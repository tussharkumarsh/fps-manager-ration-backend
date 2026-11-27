/**
 * Months that had no allocation of their own on the portal because an
 * earlier allocation was distributed through them — e.g. April 2026's
 * allocation covered April, May and June, and the portal has no May or June
 * transaction report at all (it answers HTTP 500 for them).
 *
 * Derived purely from stored records: each record carries the allocation
 * month it was synced under (year/month) and the calendar date it was
 * handed out on.
 */

export interface AllocationRecord {
  year: string;
  month: string;
  /** "YYYY-MM-DD HH:mm" */
  date: string;
}

/** Share of an allocation's records dated in the very next month that marks that month as covered, not mere spillover. */
const NEXT_MONTH_SHARE = 0.25;
/** Share needed two or more months later — enough to rule out a handful of late stragglers. */
const LATER_MONTH_SHARE = 0.01;

const key = (year: number, month: number) => year * 12 + (month - 1);

/**
 * Calendar months of `year` (unpadded "1".."12") with no stored records of
 * their own that another allocation was clearly distributed through, mapped
 * to that allocation ({ year, month }, unpadded). Only months strictly before
 * `now` count — the current month can still receive its own allocation.
 *
 * A few days of an allocation spilling into the start of the next month is
 * normal and does NOT mark that month: a month is covered only when at least
 * a quarter of the allocation's records fall in it (the very next month), or
 * at least 1% (two or more months later — normal spillover never reaches that
 * far, and the floor still rules out one or two late stragglers).
 */
export function noAllocationMonths(
  records: AllocationRecord[],
  year: string,
  now: { year: string; month: string }
): Map<string, { year: string; month: string }> {
  const totals = new Map<number, number>(); // allocation key -> records
  const dated = new Map<number, Map<number, number>>(); // calendar key -> allocation key -> records

  for (const r of records) {
    const ay = parseInt(r.year, 10);
    const am = parseInt(r.month, 10);
    const cy = parseInt(r.date.slice(0, 4), 10);
    const cm = parseInt(r.date.slice(5, 7), 10);
    if (!ay || !am || !cy || !cm) continue;
    const a = key(ay, am);
    const c = key(cy, cm);
    totals.set(a, (totals.get(a) || 0) + 1);
    if (a === c) continue;
    let byAlloc = dated.get(c);
    if (!byAlloc) dated.set(c, (byAlloc = new Map()));
    byAlloc.set(a, (byAlloc.get(a) || 0) + 1);
  }

  const y = parseInt(year, 10);
  const nowKey = key(parseInt(now.year, 10), parseInt(now.month, 10));
  const result = new Map<string, { year: string; month: string }>();

  for (let m = 1; m <= 12; m++) {
    const c = key(y, m);
    if (c >= nowKey) break;
    if ((totals.get(c) || 0) > 0) continue; // has its own allocation's records
    const byAlloc = dated.get(c);
    if (!byAlloc) continue;

    let best: { alloc: number; count: number } | null = null;
    for (const [alloc, count] of Array.from(byAlloc.entries())) {
      if (alloc >= c) continue; // only an earlier allocation can cover a month
      const gap = c - alloc;
      const share = count / (totals.get(alloc) || 1);
      const covers = share >= (gap >= 2 ? LATER_MONTH_SHARE : NEXT_MONTH_SHARE);
      if (covers && (!best || count > best.count)) best = { alloc, count };
    }
    if (best) {
      result.set(String(m), {
        year: String(Math.floor(best.alloc / 12)),
        month: String((best.alloc % 12) + 1),
      });
    }
  }
  return result;
}
