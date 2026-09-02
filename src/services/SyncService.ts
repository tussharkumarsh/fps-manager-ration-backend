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
 * The gov API is only ever called when a caller explicitly asks for
 * forceRefresh (the Sync page's manual "Fetch and Parse" button). Every
 * other read — including the automatic load on login/navigation — serves
 * exactly what's already stored in Supabase, never triggering a live call.
 * A month that receives real data via forceRefresh is locked as
 * 'synced_locked' (except the current calendar month, which stays 'live'
 * since it's still being added to on the gov side).
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

    // View-only path — used for read-only (admin) callers, and for every
    // ordinary login/navigation read. Never touches the gov API; just
    // serves whatever is already in the DB (briefly cached to absorb
    // repeated reads within a short window).
    if (readOnly || !forceRefresh) {
      const [lock, stored] = await Promise.all([
        this.lockRepo.get(fpsId, year, month),
        monthDataCache.getOrLoad(fpsId, () => this.txnRepo.getForMonth(fpsId, year, month), cacheKey),
      ]);
      return { transactions: stored, source: "sheet_cache", lockStatus: lock?.status ?? "live" };
    }

    // forceRefresh — an explicit manual sync request. Always hits the gov
    // API and stores the result, regardless of any existing lock.
    const current = isCurrentMonth(year, month);
    const result = await this.fetchAndStore(distCode, fpsId, year, month, current ? "live" : "synced_locked");
    monthDataCache.invalidate(fpsId);
    const newLock = await this.lockRepo.get(fpsId, year, month);
    return {
      transactions: result,
      source: "gov_api",
      lockStatus: newLock?.status ?? (current ? "live" : "synced_locked"),
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
