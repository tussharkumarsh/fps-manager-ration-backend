import type { OtherShopDetails } from "../repositories/OtherShopRepository";

/** FPS numbers are digits only (12 on this portal); allow some slack for other formats. */
export function isValidShopFpsId(v: unknown): v is string {
  return typeof v === "string" && /^\d{6,20}$/.test(v.trim());
}

const LIMITS: Record<keyof OtherShopDetails, number> = {
  shopName: 200,
  dealerName: 200,
  mobile: 20,
  altMobile: 20,
  address: 500,
  notes: 1000,
};

/** Coerces client-sent shop details into trimmed, length-capped strings; unknown keys are dropped. */
export function sanitizeShopDetails(raw: unknown): OtherShopDetails {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as OtherShopDetails;
  for (const [key, max] of Object.entries(LIMITS) as [keyof OtherShopDetails, number][]) {
    const v = src[key];
    out[key] = typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "";
  }
  return out;
}
