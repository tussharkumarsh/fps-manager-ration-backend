import { supabase } from "../lib/supabase";
import type { OtherShop } from "../types";

interface OtherShopRow {
  fps_id: string;
  shop_fps_id: string;
  shop_name: string | null;
  dealer_name: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  address: string | null;
  notes: string | null;
  updated_at: string | null;
}

function rowToShop(row: OtherShopRow): OtherShop {
  return {
    fpsId: row.fps_id,
    shopFpsId: row.shop_fps_id,
    shopName: row.shop_name || "",
    dealerName: row.dealer_name || "",
    mobile: row.mobile || "",
    altMobile: row.alt_mobile || "",
    address: row.address || "",
    notes: row.notes || "",
    updatedAt: row.updated_at || "",
  };
}

export type OtherShopDetails = Omit<OtherShop, "fpsId" | "shopFpsId" | "updatedAt">;

export class OtherShopRepository {
  async list(fpsId: string): Promise<OtherShop[]> {
    const { data, error } = await supabase
      .from("other_shops")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .order("shop_fps_id");
    if (error) throw new Error(`OtherShopRepository.list: ${error.message}`);
    return ((data as OtherShopRow[]) || []).map(rowToShop);
  }

  async upsert(fpsId: string, shopFpsId: string, details: OtherShopDetails): Promise<OtherShop> {
    const { data, error } = await supabase
      .from("other_shops")
      .upsert(
        {
          fps_id: fpsId.trim(),
          shop_fps_id: shopFpsId.trim(),
          shop_name: details.shopName,
          dealer_name: details.dealerName,
          mobile: details.mobile,
          alt_mobile: details.altMobile,
          address: details.address,
          notes: details.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fps_id,shop_fps_id" }
      )
      .select("*")
      .single();
    if (error) throw new Error(`OtherShopRepository.upsert: ${error.message}`);
    return rowToShop(data as OtherShopRow);
  }

  async delete(fpsId: string, shopFpsId: string): Promise<void> {
    const { error } = await supabase
      .from("other_shops")
      .delete()
      .eq("fps_id", fpsId.trim())
      .eq("shop_fps_id", shopFpsId.trim());
    if (error) throw new Error(`OtherShopRepository.delete: ${error.message}`);
  }
}
