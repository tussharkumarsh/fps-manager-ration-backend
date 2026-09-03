import { supabase } from "../lib/supabase";
import { rowKey } from "../lib/ids";
import type { StoredTransaction, Transaction } from "../types";

interface TransactionRow {
  row_key: string;
  fps_id: string;
  year: string;
  month: string;
  sl_no: number;
  src_no: string;
  scheme: string;
  avail_type: string;
  receipt_no: string;
  date: string;
  wheat: number;
  rice: number;
  sugar: number;
  saree: number;
  jowar: number;
  amount: number;
  portability: string;
  auth_trans_time: string | null;
  fetched_at: string;
  source: string;
}

function rowToTxn(row: TransactionRow): StoredTransaction {
  return {
    id: row.receipt_no,
    fpsId: row.fps_id,
    year: row.year,
    month: row.month,
    slNo: row.sl_no,
    srcNo: row.src_no,
    scheme: (row.scheme as Transaction["scheme"]) || "PHH",
    availType: (row.avail_type as Transaction["availType"]) || "Authenticated",
    receiptNo: row.receipt_no,
    date: row.date,
    wheat: row.wheat,
    rice: row.rice,
    sugar: row.sugar,
    saree: row.saree,
    jowar: row.jowar,
    amount: row.amount,
    portability: row.portability,
    authTransTime: row.auth_trans_time || undefined,
    fetchedAt: row.fetched_at,
    source: (row.source as StoredTransaction["source"]) || "api",
  };
}

function txnToRow(
  fpsId: string,
  year: string,
  month: string,
  t: Transaction,
  fetchedAt: string,
  source: "api" | "manual"
): TransactionRow {
  return {
    row_key: rowKey(fpsId, year, month, t.receiptNo),
    fps_id: fpsId,
    year,
    month,
    sl_no: t.slNo,
    src_no: t.srcNo,
    scheme: t.scheme,
    avail_type: t.availType,
    receipt_no: t.receiptNo,
    date: t.date,
    wheat: t.wheat,
    rice: t.rice,
    sugar: t.sugar,
    saree: t.saree,
    jowar: t.jowar,
    amount: t.amount,
    portability: t.portability,
    auth_trans_time: t.authTransTime || null,
    fetched_at: fetchedAt,
    source,
  };
}

export class TransactionRepository {
  async getForMonth(fpsId: string, year: string, month: string): Promise<StoredTransaction[]> {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim());
    if (error) throw new Error(`TransactionRepository.getForMonth: ${error.message}`);
    return (data as TransactionRow[]).map(rowToTxn);
  }

  async getAll(fpsId: string): Promise<StoredTransaction[]> {
    // Supabase/PostgREST caps an unbounded select at 1000 rows by default,
    // so a dealer with more than that across all synced months would
    // silently lose whichever months fell past the cap. Page through in
    // batches of 1000 until a page comes back short.
    const pageSize = 1000;
    const rows: TransactionRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("fps_id", fpsId.trim())
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`TransactionRepository.getAll: ${error.message}`);
      const page = data as TransactionRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    return rows.map(rowToTxn);
  }

  async upsertMany(
    fpsId: string,
    year: string,
    month: string,
    txns: Transaction[],
    source: "api" | "manual" = "api"
  ): Promise<number> {
    if (txns.length === 0) return 0;
    const fetchedAt = new Date().toISOString();
    const rows = txns.map((t) => txnToRow(fpsId, year, month, t, fetchedAt, source));
    const { error } = await supabase.from("transactions").upsert(rows, { onConflict: "row_key" });
    if (error) throw new Error(`TransactionRepository.upsertMany: ${error.message}`);
    return rows.length;
  }

  async clearAll(fpsId: string): Promise<void> {
    const { error } = await supabase.from("transactions").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`TransactionRepository.clearAll: ${error.message}`);
  }
}
