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
  };
}

function customerToRow(fpsId: string, c: Customer): CustomerRow {
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

    const { data: existingRows, error: readError } = await supabase
      .from("customers")
      .select("*")
      .eq("fps_id", trimmed)
      .in(
        "src_no",
        customers.map((c) => c.srcNo)
      );
    if (readError) throw new Error(`CustomerRepository.upsertMany (read): ${readError.message}`);

    const existingBySrcNo = new Map((existingRows as CustomerRow[]).map((r) => [r.src_no, r]));

    const merged = customers.map((c) => {
      const incomingRow = customerToRow(trimmed, c);
      const existing = existingBySrcNo.get(c.srcNo);
      if (!existing) return incomingRow;
      const result: CustomerRow = { ...existing };
      for (const key of Object.keys(incomingRow) as (keyof CustomerRow)[]) {
        const value = incomingRow[key];
        if (value !== null && value !== undefined && value !== "") {
          (result as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return result;
    });

    const { error } = await supabase.from("customers").upsert(merged, { onConflict: "fps_id,src_no" });
    if (error) throw new Error(`CustomerRepository.upsertMany: ${error.message}`);
    return merged.length;
  }

  async add(fpsId: string, customer: Customer): Promise<void> {
    await this.upsertMany(fpsId, [customer]);
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
