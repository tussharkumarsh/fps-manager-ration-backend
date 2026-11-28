import { supabase, fetchAllRows } from "../lib/supabase";
import type { Customer } from "../types";
import { mergeBeneficiary, type CustomerRow, type WritableCustomerRow } from "../lib/beneficiaryMerge";

function rowToCustomer(row: CustomerRow): Customer {
  return {
    srcNo: row.src_no,
    name: row.name,
    lastDispatched: row.last_dispatched || undefined,
    scheme: (row.scheme as Customer["scheme"]) || undefined,
    sNo: row.s_no ?? undefined,
    areaType: row.area_type || undefined,
    status: row.status || undefined,
    memberCount: row.member_count ?? undefined,
    mobile: row.mobile || undefined,
    familyHead: row.family_head || undefined,
    members: row.members_json || undefined,
    disabled: row.disabled || undefined,
    disabledReason: row.disabled_reason || undefined,
    disabledAt: row.disabled_at || undefined,
    sourceFpsId: row.source_fps_id || undefined,
    sourceFpsName: row.source_fps_name || undefined,
    portalSyncedAt: row.portal_synced_at || undefined,
    approvalDate: row.approval_date || undefined,
    approvedBy: row.approved_by || undefined,
    statusCode: row.status_code || undefined,
    portalMobile: row.portal_mobile || undefined,
  };
}

// Disable state is never part of an import row: see WritableCustomerRow.
function customerToRow(fpsId: string, c: Customer): WritableCustomerRow {
  return {
    fps_id: fpsId,
    src_no: c.srcNo,
    name: c.name,
    last_dispatched: c.lastDispatched || null,
    scheme: c.scheme || null,
    s_no: c.sNo ?? null,
    area_type: c.areaType || null,
    status: c.status || null,
    member_count: c.memberCount ?? null,
    mobile: c.mobile || null,
    family_head: c.familyHead || null,
    members_json: c.members && c.members.length > 0 ? c.members : null,
    source_fps_id: c.sourceFpsId || null,
    source_fps_name: c.sourceFpsName || null,
    portal_synced_at: c.portalSyncedAt || null,
    approval_date: c.approvalDate || null,
    approved_by: c.approvedBy || null,
    status_code: c.statusCode || null,
    portal_mobile: c.portalMobile || null,
  };
}

export class CustomerRepository {
  async getAll(fpsId: string): Promise<Customer[]> {
    const rows = await fetchAllRows<CustomerRow>((from, to) =>
      supabase.from("customers").select("*").eq("fps_id", fpsId.trim()).range(from, to)
    );
    return rows.map(rowToCustomer);
  }

  /**
   * Merges each incoming customer onto any existing row — only overwrites
   * fields the incoming record actually provides, so enrichment imports
   * don't blank out data set by an earlier import.
   */
  async upsertMany(fpsId: string, customers: Customer[]): Promise<number> {
    if (customers.length === 0) return 0;
    const trimmed = fpsId.trim();

    // Reads every existing customer for this dealer (scoped by fps_id
    // only — no per-row filter) rather than an `.in(src_no, [...])` with
    // one value per imported row: a bulk import of hundreds of customers
    // would otherwise build a query string with hundreds of values, which
    // risks hitting a request/URL size limit on Supabase's REST gateway.
    const existingRows = await fetchAllRows<CustomerRow>((from, to) =>
      supabase.from("customers").select("*").eq("fps_id", trimmed).range(from, to)
    );

    const existingBySrcNo = new Map(existingRows.map((r) => [r.src_no, r]));

    const merged = customers.map((c) => {
      const incomingRow = customerToRow(trimmed, c);
      const existing = existingBySrcNo.get(c.srcNo);
      if (!existing) return incomingRow;
      const result: WritableCustomerRow = { ...existing };
      for (const key of Object.keys(incomingRow) as (keyof WritableCustomerRow)[]) {
        const value = incomingRow[key];
        if (value !== null && value !== undefined && value !== "") {
          (result as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return result;
    });

    // Batched to keep each upsert request body a bounded size — a single
    // request with thousands of rows risks the same kind of platform-level
    // size/time limit this function was already rewritten to avoid.
    const BATCH_SIZE = 200;
    for (let i = 0; i < merged.length; i += BATCH_SIZE) {
      const batch = merged.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("customers").upsert(batch, { onConflict: "fps_id,src_no" });
      if (error) throw new Error(`CustomerRepository.upsertMany: ${error.message}`);
    }
    return merged.length;
  }

  /** Every stored row for this dealer, as raw rows (for merge bookkeeping). */
  async getRows(fpsId: string): Promise<CustomerRow[]> {
    return fetchAllRows<CustomerRow>((from, to) =>
      supabase.from("customers").select("*").eq("fps_id", fpsId.trim()).range(from, to)
    );
  }

  /**
   * Merges cards from a government beneficiary file (see mergeBeneficiary):
   * file data refreshes each card, the dealer's mobile and disable state
   * are kept, and every card is stamped with `importedAt`.
   */
  async importBeneficiaries(
    fpsId: string,
    customers: Customer[],
    importedAt: string
  ): Promise<{ saved: number; newCards: number; updatedCards: number }> {
    if (customers.length === 0) return { saved: 0, newCards: 0, updatedCards: 0 };
    const trimmed = fpsId.trim();
    const existingBySrcNo = new Map((await this.getRows(trimmed)).map((r) => [r.src_no, r]));

    // A card listed twice in one upload is written once (last wins).
    const bySrcNo = new Map(customers.map((c) => [c.srcNo, c]));
    let newCards = 0;
    const merged = Array.from(bySrcNo.values()).map((c) => {
      const existing = existingBySrcNo.get(c.srcNo);
      if (!existing) newCards++;
      return mergeBeneficiary(trimmed, existing, c, importedAt);
    });

    await this.upsertRows(merged);
    return { saved: merged.length, newCards, updatedCards: merged.length - newCards };
  }

  private async upsertRows(rows: WritableCustomerRow[]): Promise<void> {
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await supabase
        .from("customers")
        .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "fps_id,src_no" });
      if (error) throw new Error(`CustomerRepository.upsertRows: ${error.message}`);
    }
  }

  async add(fpsId: string, customer: Customer): Promise<void> {
    await this.upsertMany(fpsId, [customer]);
  }

  /**
   * A true partial update — only touches the columns explicitly present in
   * `patch`, unlike upsertMany's import-oriented merge. Used for direct
   * edits from the UI (mobile number, scheme, disable/enable) where "not
   * sent" must mean "leave alone", not "clear".
   */
  async update(fpsId: string, srcNo: string, patch: Partial<Customer>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.mobile !== undefined) row.mobile = patch.mobile || null;
    if (patch.scheme !== undefined) row.scheme = patch.scheme || null;
    if (patch.disabled !== undefined) row.disabled = patch.disabled;
    if (patch.disabledReason !== undefined) row.disabled_reason = patch.disabledReason || null;
    if (patch.disabledAt !== undefined) row.disabled_at = patch.disabledAt || null;
    if (Object.keys(row).length === 0) return;

    const { error } = await supabase
      .from("customers")
      .update(row)
      .eq("fps_id", fpsId.trim())
      .eq("src_no", srcNo);
    if (error) throw new Error(`CustomerRepository.update: ${error.message}`);
  }

  async remove(fpsId: string, srcNo: string): Promise<void> {
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("fps_id", fpsId.trim())
      .eq("src_no", srcNo);
    if (error) throw new Error(`CustomerRepository.remove: ${error.message}`);
  }

  async clearAll(fpsId: string): Promise<void> {
    const { error } = await supabase.from("customers").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`CustomerRepository.clearAll: ${error.message}`);
  }
}
