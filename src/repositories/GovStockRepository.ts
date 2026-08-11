import { supabase } from "../lib/supabase";
import type { GovStockRegisterEntry } from "../types";

interface GovStockRow {
  fps_id: string;
  year: string;
  month: string;
  commodity: string;
  unit: string;
  alloted: number;
  opening: number;
  received_regular: number;
  received_extra: number;
  received_moved: number;
  issued: number;
  closing: number;
  fetched_at: string;
}

function rowToEntry(row: GovStockRow): GovStockRegisterEntry {
  return {
    fpsId: row.fps_id,
    year: row.year,
    month: row.month,
    commodity: row.commodity,
    unit: row.unit,
    alloted: row.alloted,
    opening: row.opening,
    receivedRegular: row.received_regular,
    receivedExtra: row.received_extra,
    receivedMoved: row.received_moved,
    issued: row.issued,
    closing: row.closing,
    fetchedAt: row.fetched_at,
  };
}

function entryToRow(entry: GovStockRegisterEntry): GovStockRow {
  return {
    fps_id: entry.fpsId,
    year: entry.year,
    month: entry.month,
    commodity: entry.commodity,
    unit: entry.unit,
    alloted: entry.alloted,
    opening: entry.opening,
    received_regular: entry.receivedRegular,
    received_extra: entry.receivedExtra,
    received_moved: entry.receivedMoved,
    issued: entry.issued,
    closing: entry.closing,
    fetched_at: entry.fetchedAt,
  };
}

export class GovStockRepository {
  async getForMonth(fpsId: string, year: string, month: string): Promise<GovStockRegisterEntry[]> {
    const { data, error } = await supabase
      .from("gov_stock_register")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim());
    if (error) throw new Error(`GovStockRepository.getForMonth: ${error.message}`);
    return (data as GovStockRow[]).map(rowToEntry);
  }

  async replaceForMonth(
    fpsId: string,
    year: string,
    month: string,
    entries: Omit<GovStockRegisterEntry, "fpsId" | "year" | "month" | "fetchedAt">[]
  ): Promise<GovStockRegisterEntry[]> {
    const trimmed = fpsId.trim();
    const fetchedAt = new Date().toISOString();
    const rows = entries.map((e) =>
      entryToRow({ ...e, fpsId: trimmed, year: String(year).trim(), month: String(month).trim(), fetchedAt })
    );

    const { error: deleteError } = await supabase
      .from("gov_stock_register")
      .delete()
      .eq("fps_id", trimmed)
      .eq("year", String(year).trim())
      .eq("month", String(month).trim());
    if (deleteError) throw new Error(`GovStockRepository.replaceForMonth (delete): ${deleteError.message}`);

    if (rows.length === 0) return [];
    const { error: insertError } = await supabase.from("gov_stock_register").insert(rows);
    if (insertError) throw new Error(`GovStockRepository.replaceForMonth (insert): ${insertError.message}`);
    return rows.map(rowToEntry);
  }

  async clearAll(fpsId: string): Promise<void> {
    const { error } = await supabase.from("gov_stock_register").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`GovStockRepository.clearAll: ${error.message}`);
  }
}
