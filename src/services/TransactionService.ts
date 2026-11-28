import { CustomerRepository } from "../repositories/CustomerRepository";
import { BeneficiaryImportRepository } from "../repositories/BeneficiaryImportRepository";
import { countMissing } from "../lib/beneficiaryMerge";
import type { BeneficiaryImport, Customer } from "../types";

export interface ImportResult {
  savedCount: number;
  newCards: number;
  updatedCards: number;
}

export class TransactionService {
  private customerRepo = new CustomerRepository();
  private importRepo = new BeneficiaryImportRepository();

  async getCustomers(fpsId: string): Promise<Customer[]> {
    return this.customerRepo.getAll(fpsId);
  }

  async getCustomerMembers(fpsId: string, srcNo: string): Promise<NonNullable<Customer["members"]>> {
    return this.customerRepo.getMembers(fpsId, srcNo);
  }

  /**
   * Imports customers and verifies the write actually persisted by reading
   * it back. Retries once on a mismatch before failing loudly, since
   * silently reporting success on an unpersisted import would be worse than
   * an explicit error.
   */
  async importCustomers(fpsId: string, customers: Customer[], importedAt?: string): Promise<ImportResult> {
    if (customers.length === 0) return { savedCount: 0, newCards: 0, updatedCards: 0 };

    // With importedAt the cards come from a government beneficiary file and
    // go through the beneficiary merge; without it, the older field merge.
    // A retry after a failed verify sees the first attempt's rows as
    // existing, so the counts come from the first attempt.
    let counts: { newCards: number; updatedCards: number } | null = null;
    const attemptAndVerify = async (): Promise<{ ok: boolean; savedCount: number }> => {
      let savedCount: number;
      if (importedAt) {
        const r = await this.customerRepo.importBeneficiaries(fpsId, customers, importedAt);
        savedCount = r.saved;
        counts ??= { newCards: r.newCards, updatedCards: r.updatedCards };
      } else {
        savedCount = await this.customerRepo.upsertMany(fpsId, customers);
      }
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

    const c = counts as { newCards: number; updatedCards: number } | null;
    return { savedCount: result.savedCount, newCards: c?.newCards ?? 0, updatedCards: c?.updatedCards ?? 0 };
  }

  /**
   * Records one beneficiary-file upload. Run after all its chunks are
   * imported: the "not in this file" count is taken from what is stored.
   */
  async recordImport(fpsId: string, upload: Omit<BeneficiaryImport, "id" | "missingCards">): Promise<BeneficiaryImport> {
    const rows = await this.customerRepo.getRows(fpsId);
    const missingCards = countMissing(rows, upload.sourceFpsId, upload.importedAt, fpsId.trim());
    return this.importRepo.record({ ...upload, fpsId: fpsId.trim(), missingCards });
  }

  async listImports(fpsId: string): Promise<BeneficiaryImport[]> {
    return this.importRepo.latestPerSource(fpsId);
  }

  async addCustomer(fpsId: string, customer: Customer): Promise<void> {
    await this.customerRepo.add(fpsId, customer);
  }

  async updateCustomer(fpsId: string, srcNo: string, patch: Partial<Customer>): Promise<void> {
    await this.customerRepo.update(fpsId, srcNo, patch);
  }

  async deleteCustomer(fpsId: string, srcNo: string): Promise<void> {
    await this.customerRepo.remove(fpsId, srcNo);
  }

  async clearAllCustomers(fpsId: string): Promise<void> {
    await this.customerRepo.clearAll(fpsId);
    // The upload summaries describe those customers: they go with them.
    await this.importRepo.clearAll(fpsId);
  }
}
