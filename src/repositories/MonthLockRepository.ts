import { supabase } from "../lib/supabase";
import type { MonthLock } from "../types";

interface MonthLockRow {
  fps_id: string;
  year: string;
  month: string;
  status: string;
  last_synced_at: string | null;
  record_count: number;
}

function rowToLock(row: MonthLockRow): MonthLock {
  return {
    fpsId: row.fps_id,
    year: row.year,
    month: row.month,
    status: (row.status as MonthLock["status"]) || "live",
    lastSyncedAt: row.last_synced_at || "",
    recordCount: row.record_count,
  };
}

export class MonthLockRepository {
  async get(fpsId: string, year: string, month: string): Promise<MonthLock | null> {
    const { data, error } = await supabase
      .from("month_locks")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim())
      .maybeSingle();
    if (error) throw new Error(`MonthLockRepository.get: ${error.message}`);
    return data ? rowToLock(data as MonthLockRow) : null;
  }

  async upsert(lock: MonthLock): Promise<void> {
    const { error } = await supabase.from("month_locks").upsert(
      {
        fps_id: lock.fpsId,
        year: lock.year,
        month: lock.month,
        status: lock.status,
        last_synced_at: lock.lastSyncedAt || null,
        record_count: lock.recordCount,
      },
      { onConflict: "fps_id,year,month" }
    );
    if (error) throw new Error(`MonthLockRepository.upsert: ${error.message}`);
  }

  async clearAll(fpsId: string): Promise<void> {
    const { error } = await supabase.from("month_locks").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`MonthLockRepository.clearAll: ${error.message}`);
  }
}
