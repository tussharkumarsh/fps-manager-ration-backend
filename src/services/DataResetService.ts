import { SyncService } from "./SyncService";
import { TransactionService } from "./TransactionService";

/**
 * "Reset Everything": deletes every transaction, month lock, and customer
 * stored for this dealer. Scoped strictly to fpsId, which callers must
 * always derive from the caller's own authenticated session.
 */
export class DataResetService {
  private syncService = new SyncService();
  private transactionService = new TransactionService();

  async resetAll(fpsId: string): Promise<void> {
    await this.syncService.clearAllTransactions(fpsId);
    await this.transactionService.clearAllCustomers(fpsId);
  }
}
