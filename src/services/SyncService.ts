import { GovApiClient } from "../clients/GovApiClient";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { MonthLockRepository } from "../repositories/MonthLockRepository";
import { SheetCache } from "../cache/SheetCache";
import type { StoredTransaction, MonthLock, Transaction } from "../types";

const monthDataCache = new SheetCache<StoredTransaction[]>(5 * 60 * 1000);

function isCurrentMonth(year: string, month: string): boolean {
  const now = new Date();
  return (
    String(now.getFullYear()) === String(year) &&
    String(now.getMonth() + 1) === String(parseInt(month, 10))
  );
}

export interface MonthDataResult {
  transactions: Transaction[];
  source: "gov_api" | "sheet_cache";
  lockStatus: MonthLock["status"];
}

/**
 * Implements the month-lock fetch decision:
 * - Current calendar month: always re-fetch from the gov API, upsert, keep status=live.
 * - Past months: fetch once, lock as synced_locked; afterwards always served
 *   from Supabase (cached in-memory) without hitting the gov API again.
 * - Lazy rollover: a month that's no longer current but still marked 'live'
 *   flips to 'synced_locked' the next time it's touched.
 */
export class SyncService {
  private govApi = new GovApiClient();
  private txnRepo = new TransactionRepository();
  private lockRepo = new MonthLockRepository();

  async getAllStoredTransactions(fpsId: string): Promise<Transaction[]> {
    return this.txnRepo.getAll(fpsId);
  }

  async clearAllTransactions(fpsId: string): Promise<void> {
    await this.txnRepo.clearAll(fpsId);
    await this.lockRepo.clearAll(fpsId);
    monthDataCache.invalidate(fpsId);
  }

  async getMonthData(
    distCode: string,
    fpsId: string,
    year: string,
    month: string,
    readOnly = false,
    forceRefresh = false
  ): Promise<MonthDataResult> {
    const cacheKey = `${year}-${month}`;
    const current = isCurrentMonth(year, month);

    // Read-only callers (an admin browsing another dealer's data) must never
    // trigger a live gov-API fetch-and-store — that would silently write new
    // transaction data into a dealer's account as a side effect of an admin
    // just looking at it. Only ever serve what's already stored.
    if (readOnly) {
      const lock = await this.lockRepo.get(fpsId, year, month);
      const stored = await this.txnRepo.getForMonth(fpsId, year, month);
      return { transactions: stored, source: "sheet_cache", lockStatus: lock?.status ?? "live" };
    }

    if (current) {
      // The current month's data changes throughout the day on the gov
      // server, but a signed-in user shouldn't trigger a live gov-API call
      // on every navigation/render. Fetch fresh once (forceRefresh, sent
      // once per login by the client) and otherwise serve the short-lived
      // in-memory cache — same cache used for locked past months.
      if (!forceRefresh) {
        const cached = await monthDataCache.getOrLoad(
          fpsId,
          async () => {
            await this.fetchAndStore(distCode, fpsId, year, month, "live");
            return this.txnRepo.getForMonth(fpsId, year, month);
          },
          cacheKey
        );
        return { transactions: cached, source: "sheet_cache", lockStatus: "live" };
      }
      const result = await this.fetchAndStore(distCode, fpsId, year, month, "live");
      monthDataCache.invalidate(fpsId);
      return { transactions: result, source: "gov_api", lockStatus: "live" };
    }

    let lock = await this.lockRepo.get(fpsId, year, month);

    if (lock && lock.status === "live") {
      lock = { ...lock, status: "synced_locked" };
      await this.lockRepo.upsert(lock);
    }

    if (lock && lock.status === "synced_locked") {
      const cached = await monthDataCache.getOrLoad(
        fpsId,
        () => this.txnRepo.getForMonth(fpsId, year, month),
        cacheKey
      );
      return { transactions: cached, source: "sheet_cache", lockStatus: "synced_locked" };
    }

    const result = await this.fetchAndStore(distCode, fpsId, year, month, "synced_locked");
    monthDataCache.invalidate(fpsId);
    const newLock = await this.lockRepo.get(fpsId, year, month);
    return {
      transactions: result,
      source: "gov_api",
      lockStatus: newLock?.status ?? "live",
    };
  }

  private async fetchAndStore(
    distCode: string,
    fpsId: string,
    year: string,
    month: string,
    status: MonthLock["status"]
  ): Promise<Transaction[]> {
    const { transactions } = await this.govApi.fetchTransactions(distCode, fpsId, month, year);

    // A historical month that comes back with zero records is NOT locked as
    // permanently synced — an empty response can be a transient gov-server
    // glitch. Only lock once real records have been observed (or it's the
    // current month, which always stays 'live').
    const shouldLock = status !== "synced_locked" || transactions.length > 0;

    await this.txnRepo.upsertMany(fpsId, year, month, transactions, "api");
    if (shouldLock) {
      await this.lockRepo.upsert({
        fpsId,
        year,
        month,
        status,
        lastSyncedAt: new Date().toISOString(),
        recordCount: transactions.length,
      });
    }

    return transactions;
  }
}
