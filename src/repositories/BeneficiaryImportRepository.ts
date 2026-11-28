import { supabase, fetchAllRows } from "../lib/supabase";
import type { BeneficiaryFooter, BeneficiaryImport } from "../types";

interface ImportRow {
  id: string;
  fps_id: string;
  source_fps_id: string;
  source_fps_name: string;
  district: string;
  dfso: string;
  tfso: string;
  office_code: string;
  file_name: string;
  imported_at: string;
  cards: number;
  members: number;
  aay_cards: number;
  phh_cards: number;
  footer: BeneficiaryFooter;
  new_cards: number;
  updated_cards: number;
  missing_cards: number;
}

function toImport(r: ImportRow): BeneficiaryImport {
  return {
    id: r.id,
    fpsId: r.fps_id,
    sourceFpsId: r.source_fps_id,
    sourceFpsName: r.source_fps_name,
    district: r.district,
    dfso: r.dfso,
    tfso: r.tfso,
    officeCode: r.office_code,
    fileName: r.file_name,
    importedAt: r.imported_at,
    cards: r.cards,
    members: r.members,
    aayCards: r.aay_cards,
    phhCards: r.phh_cards,
    footer: r.footer,
    newCards: r.new_cards,
    updatedCards: r.updated_cards,
    missingCards: r.missing_cards,
  };
}

/** Per-upload summaries of government beneficiary files. */
export class BeneficiaryImportRepository {
  async record(i: Omit<BeneficiaryImport, "id">): Promise<BeneficiaryImport> {
    const { data, error } = await supabase
      .from("beneficiary_imports")
      .insert({
        fps_id: i.fpsId,
        source_fps_id: i.sourceFpsId,
        source_fps_name: i.sourceFpsName,
        district: i.district,
        dfso: i.dfso,
        tfso: i.tfso,
        office_code: i.officeCode,
        file_name: i.fileName,
        imported_at: i.importedAt,
        cards: i.cards,
        members: i.members,
        aay_cards: i.aayCards,
        phh_cards: i.phhCards,
        footer: i.footer,
        new_cards: i.newCards,
        updated_cards: i.updatedCards,
        missing_cards: i.missingCards,
      })
      .select("*")
      .single();
    if (error) throw new Error(`BeneficiaryImportRepository.record: ${error.message}`);
    return toImport(data as ImportRow);
  }

  /** The latest upload of each source FPS for this dealer. */
  async latestPerSource(fpsId: string): Promise<BeneficiaryImport[]> {
    const rows = await fetchAllRows<ImportRow>((from, to) =>
      supabase
        .from("beneficiary_imports")
        .select("*")
        .eq("fps_id", fpsId.trim())
        .order("imported_at", { ascending: false })
        .range(from, to)
    );
    const latest = new Map<string, ImportRow>();
    for (const r of rows) if (!latest.has(r.source_fps_id)) latest.set(r.source_fps_id, r);
    return Array.from(latest.values()).map(toImport);
  }
}
