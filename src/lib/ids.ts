export function rowKey(fpsId: string, year: string, month: string, receiptNo: string): string {
  return `${fpsId}_${year}_${month}_${receiptNo}`;
}

export function generateItemId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The dealers and the gov portal work in IST; the server (Vercel) runs in
 * UTC, which would put the first 5.5 hours of each month in the previous one.
 */
export function currentIstYearMonth(now: Date = new Date()): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear());
  const month = parts.find((p) => p.type === "month")?.value ?? String(now.getUTCMonth() + 1);
  return { year, month: String(parseInt(month, 10)) };
}

/** Every month from (year, fromMonth) through `now`, inclusive, crossing year ends. Empty if the start is after now. */
export function monthsFrom(
  year: string,
  fromMonth: string,
  now: { year: string; month: string }
): { year: string; month: string }[] {
  const out: { year: string; month: string }[] = [];
  const end = Number(now.year) * 12 + Number(now.month);
  for (let k = Number(year) * 12 + Number(fromMonth); k <= end; k++) {
    const y = Math.floor((k - 1) / 12);
    out.push({ year: String(y), month: String(k - y * 12) });
  }
  return out;
}

export function previousMonth(year: string, month: string): { year: string; month: string } {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (m <= 1) return { year: String(y - 1), month: "12" };
  return { year: String(y), month: String(m - 1) };
}

/**
 * Resolves with the work's result, or with undefined once `ms` has passed —
 * for best-effort steps that must not push a request past the serverless
 * time limit. The work itself isn't cancelled; its outcome is just not waited on.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), Math.max(0, ms));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
