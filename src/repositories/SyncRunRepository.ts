import { supabase } from "../lib/supabase";

export interface SyncRun {
  id: string;
  fpsId: string;
  job: string;
  year: string;
  month: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  detail: string;
}

interface SyncRunRow {
  id: string;
  fps_id: string;
  job: string;
  year: string;
  month: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  detail: string;
}

const toRun = (r: SyncRunRow): SyncRun => ({
  id: r.id,
  fpsId: r.fps_id,
  job: r.job,
  year: r.year,
  month: r.month,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  ok: r.ok,
  detail: r.detail,
});

/** Nightly auto-sync jobs and how they ended. */
export class SyncRunRepository {
  async start(fpsId: string, job: string, year = "", month = ""): Promise<string> {
    const { data, error } = await supabase
      .from("sync_runs")
      .insert({ fps_id: fpsId.trim(), job, year, month })
      .select("id")
      .single();
    if (error) throw new Error(`SyncRunRepository.start: ${error.message}`);
    return (data as { id: string }).id;
  }

  async finish(id: string, ok: boolean, detail: string): Promise<void> {
    const { error } = await supabase
      .from("sync_runs")
      .update({ finished_at: new Date().toISOString(), ok, detail: detail.slice(0, 1000) })
      .eq("id", id);
    if (error) throw new Error(`SyncRunRepository.finish: ${error.message}`);
  }

  /** This dealer's most recent runs, newest first. */
  async recent(fpsId: string, limit = 20): Promise<SyncRun[]> {
    const { data, error } = await supabase
      .from("sync_runs")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`SyncRunRepository.recent: ${error.message}`);
    return ((data as SyncRunRow[]) || []).map(toRun);
  }
}
