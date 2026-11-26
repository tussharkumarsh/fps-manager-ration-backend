import { normalizeCommodity, txFieldForCommodity, TX_FIELD_TO_COMMODITY, type TxField } from "./commodity";
import type { InventoryMonthlySummary, ScmInventoryTransaction, Transaction } from "../types";

const TX_FIELDS: TxField[] = ["wheat", "rice", "sugar", "saree", "jowar"];

/**
 * One month's stock summary per scheme × commodity:
 *   opening     = previous month's closing (0 when there is none)
 *   received    = SCM truck-chit received qty
 *   distributed = our own recorded sales for commodities the ePOS ledger
 *                 tracks; the SCM dispatch figure for anything else — and
 *                 for every commodity in a month whose ePOS data was never
 *                 synced (localDataSynced=false), since counting that
 *                 month as "nothing distributed" would carry its whole
 *                 receipt into every later month's opening
 *   closing     = opening + received − distributed
 * Commodity names are normalized so a portal rename (FRice → Rice) doesn't
 * break the carry-forward chain.
 */
export function buildMonthSummary(input: {
  fpsId: string;
  year: string;
  month: string;
  /** Whether this month's ePOS transactions have been synced at all. */
  localDataSynced: boolean;
  scmTxns: ScmInventoryTransaction[];
  localTxns: Transaction[];
  previous: InventoryMonthlySummary[];
}): InventoryMonthlySummary[] {
  const { fpsId, year, month } = input;
  const keyOf = (scheme: string, commodity: string) =>
    `${scheme.trim().toUpperCase()}|${normalizeCommodity(commodity)}`;

  const groups = new Map<
    string,
    { received: number; dispatched: number; truckChits: Set<string>; ros: Set<string> }
  >();
  const group = (key: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { received: 0, dispatched: 0, truckChits: new Set(), ros: new Set() };
      groups.set(key, g);
    }
    return g;
  };

  for (const t of input.scmTxns) {
    const g = group(keyOf(t.scheme, t.commodity));
    g.received += t.receivedQty || 0;
    g.dispatched += t.dispatchedQty || 0;
    if (t.truckChitNo) g.truckChits.add(t.truckChitNo);
    if (t.roNo) g.ros.add(t.roNo);
  }

  const openingByKey = new Map<string, number>();
  for (const p of input.previous) {
    const key = keyOf(p.scheme, p.commodity);
    openingByKey.set(key, (openingByKey.get(key) || 0) + (p.closingStock || 0));
  }
  for (const [key, closing] of openingByKey) {
    if (closing !== 0) group(key);
  }

  const localByKey = new Map<string, number>();
  for (const t of input.localTxns) {
    for (const field of TX_FIELDS) {
      const qty = t[field] || 0;
      if (!qty) continue;
      const key = keyOf(t.scheme, TX_FIELD_TO_COMMODITY[field]);
      localByKey.set(key, (localByKey.get(key) || 0) + qty);
      group(key);
    }
  }

  return Array.from(groups.keys())
    .sort()
    .map((key) => {
      const g = groups.get(key)!;
      const [scheme, commodity] = key.split("|");
      const opening = openingByKey.get(key) || 0;
      const useLocal = input.localDataSynced && txFieldForCommodity(commodity) !== null;
      const distributed = useLocal ? localByKey.get(key) || 0 : g.dispatched;
      return {
        fpsId,
        year,
        month,
        scheme,
        commodity,
        openingStock: opening,
        receivedQty: g.received,
        distributedQty: distributed,
        closingStock: opening + g.received - distributed,
        truckChitCount: g.truckChits.size,
        roCount: g.ros.size,
      };
    });
}
