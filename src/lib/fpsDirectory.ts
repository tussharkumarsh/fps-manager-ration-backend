/**
 * The portal's public FPS directory for one AFSO office ("FPS Details" on
 * epos.mahafood.gov.in → /Epos_Spring/api/fps/afsoOwnerDetails): every shop
 * of the office with its owner, terminal, masked mobile and location.
 */

export interface FpsDirectoryEntry {
  shopFpsId: string;
  /** AFSO office code — the first 7 digits of the FPS number. */
  officeCode: string;
  ownerName: string;
  terminalId: string;
  /** The portal only ever shows it masked, e.g. "XXXXX-X9211". */
  mobileMasked: string;
  distName: string;
  afsoName: string;
  totalCards: number;
  longitude: number | null;
  latitude: number | null;
  fetchedAt: string;
}

/** AFSO office code of an FPS number (its first 7 digits). */
export function officeCodeOf(fpsId: string): string {
  return fpsId.trim().slice(0, 7);
}

export function isValidOfficeCode(v: unknown): v is string {
  return typeof v === "string" && /^\d{7}$/.test(v.trim());
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const na = (v: unknown) => (str(v).toUpperCase() === "NA" ? "" : str(v));
function num(v: unknown): number | null {
  if (v === null || v === undefined || str(v) === "" || str(v).toUpperCase() === "NA") return null;
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses the afsoOwnerDetails response (a JSON array). Entries without a
 * numeric FPS number are dropped; "NA" placeholders (shops with no owner
 * mapped yet) become empty values.
 */
export function parseAfsoOwners(json: unknown, officeCode: string, fetchedAt = new Date().toISOString()): FpsDirectoryEntry[] {
  if (!Array.isArray(json)) {
    throw new Error("FPS directory response is not a list — the portal format may have changed");
  }
  const out: FpsDirectoryEntry[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const shopFpsId = str(o.fpsId);
    if (!/^\d{6,20}$/.test(shopFpsId)) continue;
    out.push({
      shopFpsId,
      officeCode,
      ownerName: na(o.ownerNameEn),
      terminalId: na(o.terminalId),
      mobileMasked: na(o.mobileNo),
      distName: na(o.distNameEn),
      afsoName: na(o.afsoNameEn),
      totalCards: num(o.totalCards) ?? 0,
      longitude: num(o.longitude),
      latitude: num(o.latitude),
      fetchedAt,
    });
  }
  return out;
}
