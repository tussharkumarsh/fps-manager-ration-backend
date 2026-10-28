import { supabase } from "../lib/supabase";
import type { ManualGoshwara, ManualGoshwaraEntries } from "../types";

interface ManualGoshwaraRow {
  fps_id: string;
  year: string;
  month: string;
  entries: ManualGoshwaraEntries | null;
  updated_at: string | null;
}

function rowToGoshwara(row: ManualGoshwaraRow): ManualGoshwara {
  return {
    fpsId: row.fps_id,
    year: row.year,
    month: row.month,
    entries: row.entries || {},
    updatedAt: row.updated_at || "",
  };
}

export class ManualGoshwaraRepository {
  async get(fpsId: string, year: string, month: string): Promise<ManualGoshwara | null> {
    const { data, error } = await supabase
      .from("manual_goshwara")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim())
      .maybeSingle();
    if (error) throw new Error(`ManualGoshwaraRepository.get: ${error.message}`);
    return data ? rowToGoshwara(data as ManualGoshwaraRow) : null;
  }

  async upsert(fpsId: string, year: string, month: string, entries: ManualGoshwaraEntries): Promise<ManualGoshwara> {
    const { data, error } = await supabase
      .from("manual_goshwara")
      .upsert(
        {
          fps_id: fpsId.trim(),
          year: String(year).trim(),
          month: String(month).trim(),
          entries,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fps_id,year,month" }
      )
      .select("*")
      .single();
    if (error) throw new Error(`ManualGoshwaraRepository.upsert: ${error.message}`);
    return rowToGoshwara(data as ManualGoshwaraRow);
  }
}
