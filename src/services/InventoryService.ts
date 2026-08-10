import { InventoryRepository } from "../repositories/InventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import type { InventoryItem, InventoryLedgerEntry } from "../types";

export class InventoryService {
  private inventoryRepo = new InventoryRepository();
  private transactionRepo = new TransactionRepository();

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
}
