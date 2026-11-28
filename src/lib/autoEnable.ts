/** A transaction time ("YYYY-MM-DD HH:mm", India time) as epoch ms; NaN when unreadable. */
export function istToMs(date: string): number {
  const m = String(date ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return NaN;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - 330 * 60 * 1000;
}

/**
 * Disabled cards that collected ration after they were disabled: the
 * dealer's mark is out of date, so they go back to active. A transaction
 * from before the disable never re-enables (he disabled it knowing that).
 * A card with no recorded disable time is re-enabled by any transaction.
 */
export function cardsToReEnable(
  disabled: { srcNo: string; disabledAt: string | null }[],
  txns: { srcNo: string; date: string }[]
): string[] {
  const since = new Map(disabled.map((c) => [c.srcNo, c.disabledAt ? Date.parse(c.disabledAt) : -Infinity]));
  const out = new Set<string>();
  for (const t of txns) {
    const at = since.get(t.srcNo);
    if (at === undefined) continue;
    if (istToMs(t.date) > at) out.add(t.srcNo);
  }
  return Array.from(out);
}
