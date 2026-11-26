import { normalizeCommodity, TX_FIELD_TO_COMMODITY, type TxField } from "./commodity";
import { transactionsInDateMonth } from "./scmSummary";
import type { Transaction } from "../types";

/**
 * Cross-checks our stored sales against the portal's own per-day totals
 * (POST Epos_Spring/fps/dateWiseTransDetails), so a parsing or sync problem
 * shows up as a specific day and commodity instead of a silently wrong total.
 */

export interface DayTotals {
  /** YYYY-MM-DD */
  date: string;
  /** Distinct ration cards served that day. */
  cards: number;
  /** Quantity per canonical commodity name (Wheat, Rice, …). */
  qty: Record<string, number>;
}

export interface DayComparison {
  date: string;
  ok: boolean;
  gov: DayTotals | null;
  ours: DayTotals | null;
  /** "cards" and/or commodity names whose values differ. */
  diffs: string[];
}

const TOLERANCE = 0.01;
const TX_FIELDS: TxField[] = ["wheat", "rice", "sugar", "jowar", "saree"];

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function listOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    for (const value of Object.values(body as Record<string, unknown>)) {
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [];
}

/** "06-11-2026" → "2026-11-06"; already-ISO dates pass through. */
function isoDate(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10);
}

export function parseDailyTotals(body: unknown): DayTotals[] {
  return listOf(body)
    .map((day) => {
      const qty: Record<string, number> = {};
      const list = Array.isArray(day.commoditylist) ? (day.commoditylist as Record<string, unknown>[]) : [];
      for (const c of list) {
        const name = normalizeCommodity(String(c.comm_short ?? c.comm_name_en ?? ""));
        if (!name) continue;
        qty[name] = (qty[name] || 0) + toNumber(c.sale_qty);
      }
      return { date: isoDate(day.transdate ?? day.date), cards: toNumber(day.avilcards), qty };
    })
    .filter((d) => d.date.length === 10);
}

/** Our sales dated in the given calendar month, totalled per day. */
export function summarizeDaily(txns: Transaction[], year: string, month: string): DayTotals[] {
  const byDate = new Map<string, { cards: Set<string>; qty: Record<string, number> }>();
  for (const t of transactionsInDateMonth(txns, year, month)) {
    const date = t.date.slice(0, 10);
    let day = byDate.get(date);
    if (!day) {
      day = { cards: new Set(), qty: {} };
      byDate.set(date, day);
    }
    day.cards.add(t.srcNo);
    for (const field of TX_FIELDS) {
      const q = t[field] || 0;
      if (q) day.qty[TX_FIELD_TO_COMMODITY[field]] = (day.qty[TX_FIELD_TO_COMMODITY[field]] || 0) + q;
    }
    for (const [name, q] of Object.entries(t.extraItems || {})) {
      if (q) day.qty[name] = (day.qty[name] || 0) + q;
    }
  }
  return Array.from(byDate.keys())
    .sort()
    .map((date) => ({ date, cards: byDate.get(date)!.cards.size, qty: byDate.get(date)!.qty }));
}

export function compareDaily(
  gov: DayTotals[],
  ours: DayTotals[]
): { days: DayComparison[]; matched: number; total: number } {
  const govBy = new Map(gov.map((d) => [d.date, d]));
  const oursBy = new Map(ours.map((d) => [d.date, d]));
  const dates = Array.from(new Set([...govBy.keys(), ...oursBy.keys()])).sort();

  const days = dates.map((date): DayComparison => {
    const g = govBy.get(date) ?? null;
    const o = oursBy.get(date) ?? null;
    const diffs: string[] = [];
    if ((g?.cards ?? 0) !== (o?.cards ?? 0)) diffs.push("cards");
    const names = Array.from(new Set([...Object.keys(g?.qty ?? {}), ...Object.keys(o?.qty ?? {})]));
    for (const name of names) {
      if (Math.abs((g?.qty[name] ?? 0) - (o?.qty[name] ?? 0)) > TOLERANCE) diffs.push(name);
    }
    return { date, ok: diffs.length === 0, gov: g, ours: o, diffs };
  });

  days.sort((a, b) => Number(a.ok) - Number(b.ok) || a.date.localeCompare(b.date));
  return { days, matched: days.filter((d) => d.ok).length, total: days.length };
}
