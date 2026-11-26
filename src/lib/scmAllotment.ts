import { normalizeCommodity } from "./commodity";
import type { ScmInventoryTransaction } from "../types";

/**
 * Stock coming into a shop, from the SCM portal's "District Wise Shop
 * Allotment" report (POST scm_spring/api/KeyRegister/get_fps_keyreg_allot),
 * which replaced the old RO/truck-chit pages in Nov 2026. One request per
 * commodity × allotment type returns every shop in the mandal; the shop's
 * per-scheme allotment is treated as what it received that month.
 *
 * Allotment is what was assigned, not what a truck actually delivered, so
 * where a month still has real truck-chit receipts from the old portal
 * those win (preferActualReceipts).
 */

/**
 * `optional`: the portal answers EXTRA PERCENTAGE with a bare "Error"
 * (rather than "No data found") for shops with nothing under it, so its
 * failure is reported as a warning instead of failing the whole sync.
 */
export const ALLOTMENT_TYPES: readonly { ctype: string; name: string; optional?: boolean }[] = [
  { ctype: "1", name: "REGULAR" },
  { ctype: "2", name: "EXTRA" },
  { ctype: "3", name: "PORT" },
  { ctype: "4", name: "ADVANCE" },
  { ctype: "5", name: "ADHOC" },
  { ctype: "6", name: "EXTRA PERCENTAGE", optional: true },
];

/**
 * comm_id values from the portal's Commodity dropdown. `name` is kept as the
 * portal gives it (FRice stays FRice so its rows don't collide with Rice's);
 * the stock summary normalizes names when grouping.
 */
export const ALLOTMENT_COMMODITIES = [
  { commId: "1", name: "Wheat", label: "Wheat (Kgs)", unit: "Kgs" },
  { commId: "2", name: "Rice", label: "Rice (Kgs)", unit: "Kgs" },
  { commId: "4", name: "Sugar", label: "Sugar (Kgs)", unit: "Kgs" },
  { commId: "10", name: "SAREE", label: "SAREE (PKTS)", unit: "PKTS" },
  { commId: "90", name: "Maize", label: "Maize (Kgs)", unit: "Kgs" },
  { commId: "91", name: "Jowar", label: "Jowar (Kgs)", unit: "Kgs" },
  { commId: "93", name: "Ragi", label: "Ragi (Kgs)", unit: "Kgs" },
  { commId: "98", name: "FRice", label: "FRice (Kgs)", unit: "Kgs" },
] as const;

export const ALLOTMENT_PREFIX = "ALLOT-";

export type SchemeAllotment = Record<string, number>;

/** The mandal (AFSO) code is the first 7 digits of the FPS id, e.g. 151209500212 → 1512095. */
export function afsoCodeFor(fpsId: string): string {
  return fpsId.trim().slice(0, 7);
}

export function findShopAllotment(body: unknown, fpsId: string): SchemeAllotment | null {
  const b = (body ?? {}) as { rep_code?: unknown; rep_message?: unknown; data?: unknown };
  // The portal answers "No data found" when a type (e.g. ADVANCE) has no
  // allotment that month — that's zero, not a failure.
  if (/no\s+data\s+found/i.test(String(b.rep_message ?? ""))) return null;
  if (b.rep_code !== undefined && String(b.rep_code) !== "200") {
    throw new Error(`SCM allotment API: ${String(b.rep_message || `code ${b.rep_code}`)}`);
  }
  const rows = Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [];
  const id = fpsId.trim();
  const row = rows.find((r) =>
    [r.fpshop_address, r.fps_id, r.fpsid, r.shop_no, r.shop_number].some((v) => String(v ?? "").trim() === id)
  );
  if (!row) return null;
  const list = (row.schemelist ?? {}) as Record<string, unknown>;
  const out: SchemeAllotment = {};
  for (const [scheme, qty] of Object.entries(list)) {
    const n = typeof qty === "number" ? qty : parseFloat(String(qty ?? ""));
    out[scheme.trim().toUpperCase()] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

export function allotmentToScmTxns(input: {
  fpsId: string;
  year: string;
  month: string;
  ctype: string;
  commodity: string;
  unit: string;
  allotment: SchemeAllotment;
}): ScmInventoryTransaction[] {
  const { fpsId, year, month, ctype, commodity, unit } = input;
  return Object.entries(input.allotment)
    .filter(([, qty]) => qty > 0)
    .map(([scheme, qty]) => ({
      fpsId,
      truckChitNo: `${ALLOTMENT_PREFIX}${ctype}`,
      roNo: `ALLOT/${year}/${month}/${ctype}`,
      year,
      month,
      scheme,
      commodity,
      unit,
      allocatedQty: qty,
      dispatchedQty: qty,
      receivedQty: qty,
      sourceIdentifier: `ALLOT|${fpsId}|${year}|${month}|${ctype}|${commodity}|${scheme}`,
    }));
}

const receiptKey = (t: ScmInventoryTransaction) => `${(t.scheme || "").trim().toUpperCase()}|${normalizeCommodity(t.commodity)}`;

/**
 * Real truck-chit receipts beat allotment figures — per scheme × commodity,
 * so an old receipt for PHH Wheat doesn't hide the month's Rice allotment.
 */
export function preferActualReceipts(txns: ScmInventoryTransaction[]): ScmInventoryTransaction[] {
  const withActual = new Set(txns.filter((t) => !t.truckChitNo.startsWith(ALLOTMENT_PREFIX)).map(receiptKey));
  return txns.filter((t) => !t.truckChitNo.startsWith(ALLOTMENT_PREFIX) || !withActual.has(receiptKey(t)));
}

/**
 * Allotment types whose requests all succeeded this sync. Only these may have
 * their stored rows replaced; a type that failed keeps what an earlier sync saved.
 */
export function replaceableCtypes(ctypes: string[], failedCtypes: Set<string>): string[] {
  return ctypes.filter((c) => !failedCtypes.has(c));
}

/** District / mandal display names the portal's form sends alongside the codes, keyed by AFSO code. */
export const AFSO_NAMES: Record<string, { distName: string; afsoName: string }> = {
  "1512095": { distName: "Hingoli", afsoName: "HINGOLI" },
};
