import { GovApiClient } from "../clients/GovApiClient";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { MonthLockRepository } from "../repositories/MonthLockRepository";
import { ScmInventoryService } from "./ScmInventoryService";
import { InventoryService } from "./InventoryService";
import { currentIstYearMonth } from "../lib/ids";
import { compareDaily, summarizeByDate } from "../lib/dailyVerify";
import type { MonthLock, Transaction } from "../types";

function isCurrentMonth(year: string, month: string): boolean {
  const now = currentIstYearMonth();
  return now.year === String(year) && now.month === String(parseInt(month, 10));
}

export interface MonthDataResult {
  transactions: Transaction[];
  source: "gov_api" | "sheet_cache";
  lockStatus: MonthLock["status"];
  /** ePOS commodity headers with no dedicated field (kept in extraItems). Empty on stored reads. */
  unknownColumns: string[];
}

/**
 * The gov API is only ever called when a caller explicitly asks for
 * forceRefresh (the Sync page's manual "Fetch and Parse" button). Every
 * other read — including the automatic load on login/navigation — serves
 * exactly what's already stored in Supabase, never triggering a live call.
 * A month that receives real data via forceRefresh is locked as
 * 'synced_locked' (except the current IST calendar month, which stays
 * 'live' since it's still being added to on the gov side).
 *
 * Reads are not cached in memory: on serverless each instance would hold
 * its own copy, and a sync on one instance would leave others stale.
 */
export class SyncService {
  private govApi = new GovApiClient();
  private txnRepo = new TransactionRepository();
  private lockRepo = new MonthLockRepository();
  private scmService = new ScmInventoryService();
  private inventoryService = new InventoryService();

  async getAllStoredTransactions(fpsId: string): Promise<Transaction[]> {
    return this.txnRepo.getAll(fpsId);
  }

  async clearAllTransactions(fpsId: string): Promise<void> {
    await this.txnRepo.clearAll(fpsId);
    await this.lockRepo.clearAll(fpsId);
  }

  /**
   * Month locks for a year, each with how many transactions are actually
   * stored for that month — a lock can outlive its data (e.g. after a
   * reset), and such a month must still count as missing.
   */
  async listLocks(fpsId: string, year: string): Promise<(MonthLock & { storedCount: number })[]> {
    const [locks, counts] = await Promise.all([
      this.lockRepo.listForYear(fpsId, year),
      this.txnRepo.countsForYear(fpsId, year),
    ]);
    return locks.map((l) => ({ ...l, storedCount: counts.get(String(parseInt(l.month, 10))) || 0 }));
  }

  /**
   * Compares our stored sales, totalled per calendar day of the month, with
   * the portal's own day-wise totals. Read-only; always a live portal call.
   */
  async verifyMonth(
    distCode: string,
    fpsId: string,
    year: string,
    month: string
  ): Promise<ReturnType<typeof compareDaily>> {
    // The portal's day-wise report covers an allocation month, which can run
    // past the calendar month — compare it with that allocation month's sales.
    const [gov, stored] = await Promise.all([
      this.govApi.fetchDailyTotals(distCode, fpsId, month, year),
      this.txnRepo.getForMonth(fpsId, year, month),
    ]);
    return compareDaily(gov, summarizeByDate(stored));
  }

  async getMonthData(
    distCode: string,
    fpsId: string,
    year: string,
    month: string,
    readOnly = false,
    forceRefresh = false
  ): Promise<MonthDataResult> {
    if (readOnly || !forceRefresh) {
      const [lock, stored] = await Promise.all([
        this.lockRepo.get(fpsId, year, month),
        this.txnRepo.getForMonth(fpsId, year, month),
      ]);
      return { transactions: stored, source: "sheet_cache", lockStatus: lock?.status ?? "live", unknownColumns: [] };
    }

    // forceRefresh — an explicit manual sync request. Always hits the gov
    // API and stores the result, regardless of any existing lock.
    const current = isCurrentMonth(year, month);
    const { transactions, unknownColumns } = await this.fetchAndStore(
      distCode,
      fpsId,
      year,
      month,
      current ? "live" : "synced_locked"
    );

    // The SCM stock summary's "distributed" comes from these transactions,
    // and later months open with this month's closing — rebuild them. A
    // failure here must not fail the transaction sync that already succeeded.
    try {
      await this.scmService.recomputeFrom(fpsId, year, month);
    } catch (err) {
      console.error("SCM summary recompute after transaction sync failed", { err, fpsId, year, month });
    }

    // The government stock register is what dealers see as their stock, so
    // refresh it alongside the month's sales. Best effort, like the recompute.
    try {
      await this.inventoryService.syncGovStockRegister(fpsId, distCode, year, month);
    } catch (err) {
      console.error("Gov stock register refresh after transaction sync failed", { err, fpsId, year, month });
    }

    const newLock = await this.lockRepo.get(fpsId, year, month);
    return {
      transactions,
      source: "gov_api",
      lockStatus: newLock?.status ?? (current ? "live" : "synced_locked"),
      unknownColumns,
    };
  }

  private async fetchAndStore(
    distCode: string,
    fpsId: string,
    year: string,
    month: string,
    status: MonthLock["status"]
  ): Promise<{ transactions: Transaction[]; unknownColumns: string[] }> {
    const { transactions, unknownColumns } = await this.govApi.fetchTransactions(distCode, fpsId, month, year);

    // A historical month that comes back with zero records is NOT locked as
    // permanently synced — an empty response can be a transient gov-server
    // glitch. Only lock once real records have been observed (or it's the
    // current month, which always stays 'live').
    const shouldLock = status !== "synced_locked" || transactions.length > 0;

    // Upsert only: receipts already stored are never deleted by a re-sync.
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

    return { transactions, unknownColumns };
  }
}
