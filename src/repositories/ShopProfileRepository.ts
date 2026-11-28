import { supabase } from "../lib/supabase";
import { pickNewer, type ShopCounts, type ShopProfile } from "../lib/shopProfile";

interface ShopProfileRow {
  fps_id: string;
  shop_fps_id: string;
  office_code: string;
  dealer_name: string;
  mobile: string;
  shop_no: string;
  village: string;
  tehsil: string;
  license_no: string;
  shop_type: string;
  district: string;
  dfso: string;
  tfso: string;
  report_updated_on: string;
  report_updated_at: string;
  counts: ShopCounts;
  uploaded_at: string;
}

function toProfile(r: ShopProfileRow): ShopProfile {
  return {
    shopFpsId: r.shop_fps_id,
    officeCode: r.office_code,
    dealerName: r.dealer_name,
    mobile: r.mobile,
    shopNo: r.shop_no,
    village: r.village,
    tehsil: r.tehsil,
    licenseNo: r.license_no,
    shopType: r.shop_type,
    district: r.district,
    dfso: r.dfso,
    tfso: r.tfso,
    reportUpdatedOn: r.report_updated_on,
    reportUpdatedAt: r.report_updated_at,
    counts: r.counts,
    uploadedAt: r.uploaded_at,
  };
}

function toRow(fpsId: string, p: ShopProfile): ShopProfileRow {
  return {
    fps_id: fpsId,
    shop_fps_id: p.shopFpsId,
    office_code: p.officeCode,
    dealer_name: p.dealerName,
    mobile: p.mobile,
    shop_no: p.shopNo,
    village: p.village,
    tehsil: p.tehsil,
    license_no: p.licenseNo,
    shop_type: p.shopType,
    district: p.district,
    dfso: p.dfso,
    tfso: p.tfso,
    report_updated_on: p.reportUpdatedOn,
    report_updated_at: p.reportUpdatedAt,
    counts: p.counts,
    uploaded_at: p.uploadedAt,
  };
}

/**
 * Shop profiles from the government shop report. Each dealer keeps his own
 * copy (what he uploaded): one dealer's upload never changes what another
 * dealer sees.
 */
export class ShopProfileRepository {
  async listByIds(fpsId: string, ids: string[]): Promise<ShopProfile[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("fps_shop_profiles")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .in("shop_fps_id", ids);
    if (error) throw new Error(`ShopProfileRepository.listByIds: ${error.message}`);
    return ((data as ShopProfileRow[]) || []).map(toProfile);
  }

  /** Saves each profile unless a newer report is already stored for that shop. */
  async saveNewer(fpsId: string, profiles: ShopProfile[]): Promise<{ saved: number; skippedOlder: number }> {
    if (profiles.length === 0) return { saved: 0, skippedOlder: 0 };
    const owner = fpsId.trim();
    const existing = new Map(
      (await this.listByIds(owner, profiles.map((p) => p.shopFpsId))).map((p) => [p.shopFpsId, p])
    );
    const keep = profiles.filter((p) => pickNewer(existing.get(p.shopFpsId), p) === p);
    if (keep.length > 0) {
      const { error } = await supabase.from("fps_shop_profiles").upsert(keep.map((p) => toRow(owner, p)), { onConflict: "fps_id,shop_fps_id" });
      if (error) throw new Error(`ShopProfileRepository.saveNewer: ${error.message}`);
    }
    return { saved: keep.length, skippedOlder: profiles.length - keep.length };
  }

  async clearAll(fpsId: string): Promise<void> {
    const { error } = await supabase.from("fps_shop_profiles").delete().eq("fps_id", fpsId.trim());
    if (error) throw new Error(`ShopProfileRepository.clearAll: ${error.message}`);
  }
}
