import { supabase } from "../lib/supabase";
import type { FpsDirectoryEntry } from "../lib/fpsDirectory";

interface FpsDirectoryRow {
  shop_fps_id: string;
  office_code: string;
  owner_name: string | null;
  terminal_id: string | null;
  mobile_masked: string | null;
  dist_name: string | null;
  afso_name: string | null;
  total_cards: number | null;
  longitude: number | null;
  latitude: number | null;
  fetched_at: string | null;
}

function rowToEntry(row: FpsDirectoryRow): FpsDirectoryEntry {
  return {
    shopFpsId: row.shop_fps_id,
    officeCode: row.office_code,
    ownerName: row.owner_name || "",
    terminalId: row.terminal_id || "",
    mobileMasked: row.mobile_masked || "",
    distName: row.dist_name || "",
    afsoName: row.afso_name || "",
    totalCards: row.total_cards ?? 0,
    longitude: row.longitude,
    latitude: row.latitude,
    fetchedAt: row.fetched_at || "",
  };
}

/** The portal's public FPS directory, shared by every dealer (it holds no dealer's own data). */
export class FpsDirectoryRepository {
  async listByIds(ids: string[]): Promise<FpsDirectoryEntry[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from("fps_directory").select("*").in("shop_fps_id", ids);
    if (error) throw new Error(`FpsDirectoryRepository.listByIds: ${error.message}`);
    return ((data as FpsDirectoryRow[]) || []).map(rowToEntry);
  }

  async upsertMany(entries: FpsDirectoryEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const rows: FpsDirectoryRow[] = entries.map((e) => ({
      shop_fps_id: e.shopFpsId,
      office_code: e.officeCode,
      owner_name: e.ownerName,
      terminal_id: e.terminalId,
      mobile_masked: e.mobileMasked,
      dist_name: e.distName,
      afso_name: e.afsoName,
      total_cards: e.totalCards,
      longitude: e.longitude,
      latitude: e.latitude,
      fetched_at: e.fetchedAt,
    }));
    const { error } = await supabase.from("fps_directory").upsert(rows, { onConflict: "shop_fps_id" });
    if (error) throw new Error(`FpsDirectoryRepository.upsertMany: ${error.message}`);
    return rows.length;
  }

  /** A few directory entries of one AFSO office (enough to read its names). */
  async sampleByOffice(officeCode: string): Promise<FpsDirectoryEntry[]> {
    const { data, error } = await supabase
      .from("fps_directory")
      .select("*")
      .eq("office_code", officeCode)
      .limit(5);
    if (error) throw new Error(`FpsDirectoryRepository.sampleByOffice: ${error.message}`);
    return ((data as FpsDirectoryRow[]) || []).map(rowToEntry);
  }
}
