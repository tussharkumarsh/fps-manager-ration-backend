import { CustomerRepository } from "../repositories/CustomerRepository";
import type { Customer } from "../types";

export class TransactionService {
  private customerRepo = new CustomerRepository();

  async getCustomers(fpsId: string): Promise<Customer[]> {
    return this.customerRepo.getAll(fpsId);
  }

  /**
   * Imports customers and verifies the write actually persisted by reading
   * it back. Retries once on a mismatch before failing loudly, since
   * silently reporting success on an unpersisted import would be worse than
   * an explicit error.
   */
  async importCustomers(fpsId: string, customers: Customer[]): Promise<number> {
    if (customers.length === 0) return 0;

    const attemptAndVerify = async (): Promise<{ ok: boolean; savedCount: number }> => {
      const savedCount = await this.customerRepo.upsertMany(fpsId, customers);
      const stored = await this.customerRepo.getAll(fpsId);
      const storedSrcNos = new Set(stored.map((c) => c.srcNo));
      const missing = customers.filter((c) => !storedSrcNos.has(c.srcNo));
      return { ok: missing.length === 0, savedCount };
    };

    let result = await attemptAndVerify();
    if (!result.ok) {
      result = await attemptAndVerify();
    }
    if (!result.ok) {
      throw new Error(
        "Import verification failed: some customers were not confirmed in storage after retry."
      );
    }

    return result.savedCount;
  }

  async addCustomer(fpsId: string, customer: Customer): Promise<void> {
    await this.customerRepo.add(fpsId, customer);
  }

  async deleteCustomer(fpsId: string, srcNo: string): Promise<void> {
    await this.customerRepo.remove(fpsId, srcNo);
  }

  async clearAllCustomers(fpsId: string): Promise<void> {
    await this.customerRepo.clearAll(fpsId);
  }
}
