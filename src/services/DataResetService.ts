import { SyncService } from "./SyncService";
import { TransactionService } from "./TransactionService";
import { InventoryService } from "./InventoryService";

/**
 * "Reset Everything": deletes every transaction, month lock, customer, and
 * inventory record (items + ledger, including opening balances) stored
 * for this dealer. Scoped strictly to fpsId, which callers must always
 * derive from the caller's own authenticated session (or, for the
 * admin-only "clear a dealer's data" flow, an explicitly targeted dealer).
 */
export class DataResetService {
  private syncService = new SyncService();
  private transactionService = new TransactionService();
  private inventoryService = new InventoryService();

  async resetAll(fpsId: string): Promise<void> {
    await this.syncService.clearAllTransactions(fpsId);
    await this.transactionService.clearAllCustomers(fpsId);
    await this.inventoryService.clearAll(fpsId);
  }
}
