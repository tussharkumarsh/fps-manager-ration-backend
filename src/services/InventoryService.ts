import { InventoryRepository } from "../repositories/InventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { GovStockRepository } from "../repositories/GovStockRepository";
import { GovApiClient } from "../clients/GovApiClient";
import type { InventoryItem, InventoryLedgerEntry, GovStockRegisterEntry } from "../types";

export class InventoryService {
  private inventoryRepo = new InventoryRepository();
  private transactionRepo = new TransactionRepository();
  private govStockRepo = new GovStockRepository();
  private govApiClient = new GovApiClient();

  async getItems(fpsId: string): Promise<InventoryItem[]> {
    return this.inventoryRepo.getItems(fpsId);
  }

  async addItem(fpsId: string, item: Omit<InventoryItem, "id">): Promise<InventoryItem> {
    return this.inventoryRepo.addItem(fpsId, item);
  }

  /**
   * Ledger for a month, joined against live transaction totals: tx-linked
   * items (wheat/rice) always reflect actual synced distribution rather
   * than a stored snapshot, so the ledger can't drift from real data.
   */
  async getMonthLedger(
    fpsId: string,
    year: string,
    month: string
  ): Promise<{ items: InventoryItem[]; ledger: InventoryLedgerEntry[] }> {
    const [items, ledgerRows, transactions] = await Promise.all([
      this.inventoryRepo.getItems(fpsId),
      this.inventoryRepo.getLedgerForMonth(fpsId, year, month),
      this.transactionRepo.getForMonth(fpsId, year, month),
    ]);

    const ledgerByItem = new Map(ledgerRows.map((l) => [l.itemId, l]));

    const ledger: InventoryLedgerEntry[] = items.map((item) => {
      const existing = ledgerByItem.get(item.id);
      if (item.txField) {
        const distributed = transactions.reduce((sum, t) => sum + (t[item.txField as "wheat" | "rice"] || 0), 0);
        const opening = existing?.opening ?? 0;
        const received = existing?.received ?? 0;
        return {
          fpsId,
          year,
          month,
          itemId: item.id,
          opening,
          received,
          distributed,
          closing: opening + received - distributed,
        };
      }
      return (
        existing ?? {
          fpsId,
          year,
          month,
          itemId: item.id,
          opening: 0,
          received: 0,
          distributed: 0,
          closing: 0,
        }
      );
    });

    return { items, ledger };
  }

  async setReceived(
    fpsId: string,
    year: string,
    month: string,
    itemId: string,
    received: number
  ): Promise<InventoryLedgerEntry> {
    const items = await this.inventoryRepo.getItems(fpsId);
    const item = items.find((i) => i.id === itemId);
    let distributed = 0;
    if (item?.txField) {
      const transactions = await this.transactionRepo.getForMonth(fpsId, year, month);
      distributed = transactions.reduce((sum, t) => sum + (t[item.txField as "wheat" | "rice"] || 0), 0);
    }
    return this.inventoryRepo.setReceived(fpsId, year, month, itemId, received, distributed);
  }

  async setManualDistributed(
    fpsId: string,
    year: string,
    month: string,
    itemId: string,
    distributed: number
  ): Promise<InventoryLedgerEntry> {
    return this.inventoryRepo.setManualDistributed(fpsId, year, month, itemId, distributed);
  }

  async setOpening(
    fpsId: string,
    year: string,
    month: string,
    itemId: string,
    opening: number
  ): Promise<InventoryLedgerEntry> {
    return this.inventoryRepo.setOpening(fpsId, year, month, itemId, opening);
  }

  /** Bulk opening-balance setup — e.g. onboarding a dealer's starting stock across every item at once. */
  async setOpeningBalances(
    fpsId: string,
    year: string,
    month: string,
    balances: { itemId: string; opening: number }[]
  ): Promise<InventoryLedgerEntry[]> {
    const entries: InventoryLedgerEntry[] = [];
    for (const b of balances) {
      entries.push(await this.inventoryRepo.setOpening(fpsId, year, month, b.itemId, b.opening));
    }
    return entries;
  }

  /**
   * A full year's ledger per item, month by month — powers the "All
   * Months" monthwise table view. Reuses getMonthLedger (which already
   * joins live transaction totals for tx-linked items) for each of the 12
   * months, so it stays consistent with the single-month view.
   */
  async getYearLedger(
    fpsId: string,
    year: string
  ): Promise<{ items: InventoryItem[]; monthly: Record<string, InventoryLedgerEntry[]> }> {
    const items = await this.inventoryRepo.getItems(fpsId);
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const monthly: Record<string, InventoryLedgerEntry[]> = {};
    for (const month of months) {
      const { ledger } = await this.getMonthLedger(fpsId, year, month);
      monthly[month] = ledger;
    }
    return { items, monthly };
  }

  async clearAll(fpsId: string): Promise<void> {
    await this.inventoryRepo.clearAll(fpsId);
    await this.govStockRepo.clearAll(fpsId);
  }

  /** Reference-only snapshot from the government's own stock register — never overwrites the local ledger. */
  async getGovStockRegister(fpsId: string, year: string, month: string): Promise<GovStockRegisterEntry[]> {
    return this.govStockRepo.getForMonth(fpsId, year, month);
  }

  async syncGovStockRegister(
    fpsId: string,
    distCode: string,
    year: string,
    month: string
  ): Promise<GovStockRegisterEntry[]> {
    const entries = await this.govApiClient.fetchStockRegister(distCode, fpsId, month, year);
    return this.govStockRepo.replaceForMonth(fpsId, year, month, entries);
  }
}
