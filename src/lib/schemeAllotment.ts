import { normalizeCommodity } from "./commodity";

export interface ShopSchemeAllotment {
  cards: number;
  units: number;
  /** Allotted quantity per canonical commodity (FRice folds into Rice). */
  qty: Record<string, number>;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses the portal's "Scheme Wise Allotment" report
 * (POST Epos_Spring/SchemeAllotment/get_Scheme_Allot_FPS), which lists every
 * shop in a mandal with its allotment per commodity (c_lst[].qty_1) for one
 * allotment type, and picks out this shop.
 */
export function parseSchemeAllotment(body: unknown, fpsId: string): ShopSchemeAllotment | null {
  const b = (body ?? {}) as { rep_message?: unknown; data?: unknown };
  if (/no\s+data\s+found/i.test(String(b.rep_message ?? ""))) return null;
  const rows = Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [];
  const row = rows.find((r) => String(r.fps_id ?? "").trim() === fpsId.trim());
  if (!row) return null;

  const qty: Record<string, number> = {};
  for (const c of Array.isArray(row.c_lst) ? (row.c_lst as Record<string, unknown>[]) : []) {
    const name = normalizeCommodity(String(c.comm_name_en ?? ""));
    if (!name) continue;
    qty[name] = (qty[name] || 0) + num(c.qty_1);
  }
  return { cards: num(row.total_cards), units: num(row.total_units), qty };
}

/**
 * Fills each stock-register entry's `alloted` from the scheme-wise allotment
 * (the register itself reports 0). Entries for commodities the allotment
 * doesn't list keep their value; a null allotment changes nothing.
 */
export function withAllotment<T extends { commodity: string; alloted: number }>(
  entries: T[],
  qty: Record<string, number> | null
): T[] {
  if (!qty) return entries;
  return entries.map((e) => (e.commodity in qty ? { ...e, alloted: qty[e.commodity] } : e));
}
