import { normalizeCommodity, txFieldForCommodity } from "./commodity";
import type { Transaction } from "../types";

/**
 * Parses the JSON returned by the ePOS portal's Spring endpoint
 * (POST Epos_Spring/fps/fpstransactionwitoutcatptcha with
 * {fps_id, month, year}), which replaced the old FPS_Trans_Details.jsp HTML
 * table in Nov 2026. Each record carries its commodities as a list
 * (comm_name_en + sale_qty); names we have a field for are mapped (after
 * normalization, e.g. FRice → rice), anything else is kept in extraItems
 * and reported in unknownColumns rather than dropped.
 */

interface EposCommodity {
  comm_name_en?: string | null;
  comm_short?: string | null;
  comm_id?: number | null;
  sale_qty?: number | string | null;
}

interface EposRecord {
  existingRcNumber?: string;
  schemeShortName?: string;
  receiptId?: string;
  portCheck?: string;
  amount?: string | number;
  transTime?: string;
  loginTime?: string;
  auth_type?: string;
  commodityList?: EposCommodity[];
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function availTypeOf(authType: string | undefined): Transaction["availType"] {
  const t = (authType || "").toUpperCase();
  if (t.includes("OTP")) return "OTP";
  if (t.includes("IRIS")) return "IRIS";
  return "Authenticated";
}

/** The records may come as a bare array or wrapped in an object; take the first array found. */
function recordsOf(body: unknown): EposRecord[] {
  if (Array.isArray(body)) return body as EposRecord[];
  if (body && typeof body === "object") {
    for (const value of Object.values(body as Record<string, unknown>)) {
      if (Array.isArray(value)) return value as EposRecord[];
    }
  }
  return [];
}

export function parseEposJson(body: unknown): { transactions: Transaction[]; unknownColumns: string[] } {
  const records = recordsOf(body);
  const unknown = new Set<string>();

  const transactions = records.map((r, i): Transaction => {
    if (!r || typeof r !== "object" || !r.receiptId) {
      throw new Error("ePOS response record has no receiptId — the response format may have changed");
    }
    const qty = { wheat: 0, rice: 0, sugar: 0, saree: 0, jowar: 0 };
    const extraItems: Record<string, number> = {};
    for (const c of Array.isArray(r.commodityList) ? r.commodityList : []) {
      if (!c) continue;
      const amount = toNumber(c.sale_qty);
      // The portal doesn't always fill comm_name_en (some FPS records carry
      // the name only in comm_short). Fall back to comm_id rather than ever
      // dropping a sold quantity.
      const name =
        normalizeCommodity(c.comm_name_en || c.comm_short || "") || (c.comm_id ? `comm_id ${c.comm_id}` : "");
      if (!name) {
        if (amount) throw new Error("ePOS response has a sold quantity with no commodity name or id");
        continue;
      }
      const field = txFieldForCommodity(name);
      if (field) {
        qty[field] += amount;
      } else {
        extraItems[name] = (extraItems[name] || 0) + amount;
        unknown.add(name);
      }
    }

    const receiptNo = String(r.receiptId).trim();
    return {
      id: receiptNo,
      slNo: i + 1,
      srcNo: String(r.existingRcNumber || "").trim(),
      scheme: (String(r.schemeShortName || "PHH").trim().toUpperCase() as Transaction["scheme"]),
      availType: availTypeOf(r.auth_type),
      receiptNo,
      // Stored as "YYYY-MM-DD HH:mm", the format the old HTML report used.
      date: String(r.loginTime || "").trim().slice(0, 16),
      ...qty,
      amount: toNumber(r.amount),
      portability: String(r.portCheck || "").trim(),
      authTransTime: String(r.transTime || "").trim() || undefined,
      extraItems,
    };
  });

  return { transactions, unknownColumns: Array.from(unknown) };
}
