import type { Customer } from "../types";

/** A `customers` table row. */
export interface CustomerRow {
  fps_id: string;
  src_no: string;
  name: string;
  last_dispatched: string | null;
  scheme: string | null;
  s_no: number | null;
  area_type: string | null;
  status: string | null;
  member_count: number | null;
  mobile: string | null;
  family_head: string | null;
  members_json: Customer["members"] | null;
  disabled: boolean | null;
  disabled_reason: string | null;
  disabled_at: string | null;
  source_fps_id: string | null;
  source_fps_name: string | null;
  portal_synced_at: string | null;
  approval_date: string | null;
  approved_by: string | null;
  status_code: string | null;
  portal_mobile: string | null;
}

/**
 * The columns an import may write. Disable state is left out on purpose:
 * only a direct edit from the UI ever sets it, so no import can re-enable a
 * card or clear its reason.
 */
export type WritableCustomerRow = Omit<CustomerRow, "disabled" | "disabled_reason" | "disabled_at">;

/** A real 10-digit mobile number (the file usually carries a masked one). */
export function isFullMobile(v?: string | null): boolean {
  return /^\d{10}$/.test(String(v ?? "").replace(/\s+/g, ""));
}

const blank = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Merges one card from a government beneficiary file onto its stored row.
 *
 * - File fields overwrite when the file has a value; blanks never erase.
 * - The dealer's own `mobile` is never replaced. It is only filled when
 *   empty and the file has a full number. The file's mobile always goes to
 *   `portal_mobile`.
 * - `last_dispatched` and disable state are never touched.
 * - `portal_synced_at` records this upload.
 */
export function mergeBeneficiary(
  fpsId: string,
  existing: CustomerRow | undefined,
  incoming: Customer,
  importedAt: string
): WritableCustomerRow {
  const base: WritableCustomerRow = existing
    ? (({ disabled: _d, disabled_reason: _r, disabled_at: _a, ...rest }) => rest)(existing)
    : {
        fps_id: fpsId,
        src_no: incoming.srcNo,
        name: "",
        last_dispatched: null,
        scheme: null,
        s_no: null,
        area_type: null,
        status: null,
        member_count: null,
        mobile: null,
        family_head: null,
        members_json: null,
        source_fps_id: null,
        source_fps_name: null,
        portal_synced_at: null,
        approval_date: null,
        approved_by: null,
        status_code: null,
        portal_mobile: null,
      };

  const fromFile: Partial<WritableCustomerRow> = {
    name: incoming.name,
    scheme: incoming.scheme ?? null,
    s_no: incoming.sNo ?? null,
    area_type: incoming.areaType ?? null,
    status: incoming.status ?? null,
    member_count: incoming.memberCount ?? null,
    family_head: incoming.familyHead ?? null,
    members_json: incoming.members && incoming.members.length > 0 ? incoming.members : null,
    source_fps_id: incoming.sourceFpsId ?? null,
    source_fps_name: incoming.sourceFpsName ?? null,
    approval_date: incoming.approvalDate ?? null,
    approved_by: incoming.approvedBy ?? null,
    status_code: incoming.statusCode ?? null,
    portal_mobile: incoming.portalMobile ?? null,
  };

  const out: WritableCustomerRow = { ...base, fps_id: fpsId, src_no: incoming.srcNo };
  for (const [key, value] of Object.entries(fromFile)) {
    if (!blank(value)) (out as unknown as Record<string, unknown>)[key] = value;
  }
  if (blank(out.mobile) && isFullMobile(incoming.portalMobile)) {
    out.mobile = String(incoming.portalMobile).replace(/\s+/g, "");
  }
  out.portal_synced_at = importedAt;
  return out;
}
