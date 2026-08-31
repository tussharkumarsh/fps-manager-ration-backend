import { supabase } from "../lib/supabase";
import type { Customer } from "../types";

interface CustomerRow {
  fps_id: string;
  src_no: string;
  name: string;
  last_dispatched: string | null;
  scheme: string | null;
  s_no: number | null;
  area_type: string | null;
  status: string | null;
  member_count: number | null;
  mobile: string | null;
  family_head: string | null;
  members_json: Customer["members"] | null;
  disabled: boolean | null;
  disabled_reason: string | null;
  disabled_at: string | null;
}

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
  };
}

// Deliberately excludes disabled/disabled_reason/disabled_at: imports and
// the manual "add customer" flow never carry disable state, and including
// them here (even as `false`/`null`) would count as an explicit value in
// upsertMany's merge and silently re-enable an already-disabled customer on
// the next import. Disable state is only ever written via update().
type WritableCustomerRow = Omit<CustomerRow, "disabled" | "disabled_reason" | "disabled_at">;

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
  };
}

export class CustomerRepository {
  async getAll(fpsId: string): Promise<Customer[]> {
    const { data, error } = await supabase.from("customers").select("*").eq("fps_id", fpsId.trim());
    if (error) throw new Error(`CustomerRepository.getAll: ${error.message}`);
    return (data as CustomerRow[]).map(rowToCustomer);
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
    const { data: existingRows, error: readError } = await supabase
      .from("customers")
      .select("*")
      .eq("fps_id", trimmed);
    if (readError) throw new Error(`CustomerRepository.upsertMany (read): ${readError.message}`);

    const existingBySrcNo = new Map((existingRows as CustomerRow[]).map((r) => [r.src_no, r]));

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

  async add(fpsId: string, customer: Customer): Promise<void> {
    await this.upsertMany(fpsId, [customer]);
  }

  /**
   * A true partial update — only touches the columns explicitly present in
   * `patch`, unlike upsertMany's import-oriented merge. Used for direct
   * edits from the UI (mobile number, disable/enable) where "not sent"
   * must mean "leave alone", not "clear".
   */
  async update(fpsId: string, srcNo: string, patch: Partial<Customer>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.mobile !== undefined) row.mobile = patch.mobile || null;
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
