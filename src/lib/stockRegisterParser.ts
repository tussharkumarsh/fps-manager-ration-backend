import { normalizeCommodity } from "./commodity";
import type { GovStockRegisterEntry } from "../types";

type Entry = Omit<GovStockRegisterEntry, "fpsId" | "year" | "month" | "fetchedAt">;

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses the portal's own stock register (POST Epos_Spring/fps/getfpsStockregister
 * with {fps_id, month, year}), which replaced fps_stock_register_comm.action in
 * Nov 2026. One row per commodity: ob + receivedQty (+ extraRo, sixaCase) −
 * issuedQty = cb. Commodity names are normalized (FRice → Rice); rows that
 * normalize to the same commodity are summed so each commodity appears once.
 */
export function parseStockRegisterJson(body: unknown, fpsId: string): Entry[] {
  const list = Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
  const byCommodity = new Map<string, Entry>();
  for (const r of list) {
    if (!r || String(r.fpsId ?? fpsId).trim() !== fpsId.trim()) continue;
    const commodity = normalizeCommodity(String(r.commNameEn ?? ""));
    if (!commodity) continue;
    const prev = byCommodity.get(commodity);
    const next: Entry = {
      commodity,
      unit: String(r.commMeasureUnit ?? "").trim(),
      alloted: num(r.allottedQty),
      opening: num(r.ob),
      receivedRegular: num(r.receivedQty),
      receivedExtra: num(r.extraRo),
      receivedMoved: num(r.sixaCase),
      issued: num(r.issuedQty),
      closing: num(r.cb),
    };
    if (prev) {
      for (const k of ["alloted", "opening", "receivedRegular", "receivedExtra", "receivedMoved", "issued", "closing"] as const) {
        prev[k] += next[k];
      }
    } else {
      byCommodity.set(commodity, next);
    }
  }
  return Array.from(byCommodity.values());
}
