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

export function previousMonth(year: string, month: string): { year: string; month: string } {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (m <= 1) return { year: String(y - 1), month: "12" };
  return { year: String(y), month: String(m - 1) };
}
