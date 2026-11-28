import { isValidShopFpsId } from "./otherShop";

export interface SchemeCounts {
  rcs: number;
  m1anarc: number;
  units: number;
  anam: number;
}

export type ShopCounts = Record<"na" | "aay" | "phh" | "total", SchemeCounts>;

/**
 * One shop's row from the government "FPS Wise Scheme Wise UID Count"
 * report: contact and licence details, and card/member counts per scheme,
 * as of the report's "Updated On" time.
 */
export interface ShopProfile {
  shopFpsId: string;
  officeCode: string;
  dealerName: string;
  mobile: string;
  shopNo: string;
  village: string;
  tehsil: string;
  licenseNo: string;
  shopType: string;
  district: string;
  dfso: string;
  tfso: string;
  /** "Updated On" as printed in the report. */
  reportUpdatedOn: string;
  /** The same time as ISO, for ordering. */
  reportUpdatedAt: string;
  counts: ShopCounts;
  uploadedAt: string;
}

/** The profile from the later report; a tie goes to the incoming one. */
export function pickNewer(existing: ShopProfile | undefined, incoming: ShopProfile): ShopProfile {
  if (!existing) return incoming;
  return Date.parse(existing.reportUpdatedAt) > Date.parse(incoming.reportUpdatedAt) ? existing : incoming;
}

const TEXT_LIMITS: Record<
  Exclude<keyof ShopProfile, "shopFpsId" | "counts" | "reportUpdatedAt" | "uploadedAt">,
  number
> = {
  officeCode: 20,
  dealerName: 200,
  mobile: 20,
  shopNo: 100,
  village: 200,
  tehsil: 200,
  licenseNo: 100,
  shopType: 20,
  district: 200,
  dfso: 300,
  tfso: 300,
  reportUpdatedOn: 40,
};

const SCHEMES = ["na", "aay", "phh", "total"] as const;
const COUNT_KEYS = ["rcs", "m1anarc", "units", "anam"] as const;

/** Coerces a client-sent profile into a trusted one, or null when its id or report time is unusable. */
export function sanitizeProfile(raw: unknown): ShopProfile | null {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isValidShopFpsId(src.shopFpsId)) return null;
  const reportUpdatedAt = typeof src.reportUpdatedAt === "string" ? src.reportUpdatedAt : "";
  if (Number.isNaN(Date.parse(reportUpdatedAt))) return null;

  const text = {} as Record<keyof typeof TEXT_LIMITS, string>;
  for (const [key, max] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
    const v = src[key];
    text[key] = typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
  }

  const rawCounts = (src.counts && typeof src.counts === "object" ? src.counts : {}) as Record<string, unknown>;
  const counts = {} as ShopCounts;
  for (const scheme of SCHEMES) {
    const g = (rawCounts[scheme] && typeof rawCounts[scheme] === "object" ? rawCounts[scheme] : {}) as Record<string, unknown>;
    const c = {} as SchemeCounts;
    for (const k of COUNT_KEYS) {
      const n = Number(g[k]);
      c[k] = Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    counts[scheme] = c;
  }

  return {
    shopFpsId: String(src.shopFpsId).trim(),
    ...text,
    reportUpdatedAt: new Date(reportUpdatedAt).toISOString(),
    counts,
    uploadedAt: new Date().toISOString(),
  };
}
