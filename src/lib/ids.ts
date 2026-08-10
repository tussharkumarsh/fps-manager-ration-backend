export function rowKey(fpsId: string, year: string, month: string, receiptNo: string): string {
  return `${fpsId}_${year}_${month}_${receiptNo}`;
}

export function generateItemId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function previousMonth(year: string, month: string): { year: string; month: string } {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (m <= 1) return { year: String(y - 1), month: "12" };
  return { year: String(y), month: String(m - 1) };
}
