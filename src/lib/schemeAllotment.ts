import { normalizeCommodity } from "./commodity";

export interface ShopSchemeAllotment {
  cards: number;
  units: number;
  /** Allotted quantity per canonical commodity (FRice folds into Rice). */
  qty: Record<string, number>;
  /**
   * Per commodity, the allotment per scheme (PHH, AAY, …), non-zero schemes
   * only. Only the Detailed Allotment report names schemes; empty otherwise.
   */
  byScheme: Record<string, Record<string, number>>;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses the portal's allotment reports — "Scheme Wise Allotment"
 * (Epos_Spring/SchemeAllotment/get_Scheme_Allot_FPS, one line per commodity)
 * and "Detailed Allotment" (Epos_Spring/SchemeAllotmentAll/get_Scheme_Allot_All_FPS,
 * one line per scheme × commodity). Both list every shop in a mandal; this
 * picks out one shop and totals c_lst[].qty_1 per commodity.
 */
export function parseSchemeAllotment(body: unknown, fpsId: string): ShopSchemeAllotment | null {
  const b = (body ?? {}) as { rep_message?: unknown; data?: unknown };
  if (/no\s+data\s+found/i.test(String(b.rep_message ?? ""))) return null;
  const rows = Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [];
  const row = rows.find((r) => String(r.fps_id ?? "").trim() === fpsId.trim());
  if (!row) return null;

  const qty: Record<string, number> = {};
  const byScheme: Record<string, Record<string, number>> = {};
  for (const c of Array.isArray(row.c_lst) ? (row.c_lst as Record<string, unknown>[]) : []) {
    const name = normalizeCommodity(String(c.comm_name_en ?? ""));
    if (!name) continue;
    const amount = num(c.qty_1);
    qty[name] = (qty[name] || 0) + amount;
    const scheme = String(c.scheme_short_name ?? "").trim().toUpperCase();
    if (scheme && amount) {
      byScheme[name] = byScheme[name] || {};
      byScheme[name][scheme] = (byScheme[name][scheme] || 0) + amount;
    }
  }
  return { cards: num(row.total_cards), units: num(row.total_units), qty, byScheme };
}

/**
 * Fills each stock-register entry's `alloted` (and, when known, its
 * per-scheme split) from the allotment report — the register itself
 * reports 0. Entries for commodities the allotment doesn't list keep their
 * value; a null allotment changes nothing.
 */
export function withAllotment<T extends { commodity: string; alloted: number; allotedByScheme?: Record<string, number> }>(
  entries: T[],
  qty: Record<string, number> | null,
  byScheme: Record<string, Record<string, number>> = {}
): T[] {
  if (!qty) return entries;
  return entries.map((e) =>
    e.commodity in qty
      ? { ...e, alloted: qty[e.commodity], allotedByScheme: byScheme[e.commodity] ?? {} }
      : e
  );
}
