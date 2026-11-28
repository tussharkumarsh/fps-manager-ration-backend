import { timingSafeEqual } from "crypto";
import { currentIstYearMonth, previousMonth } from "./ids";

/**
 * The ration months a nightly sync fetches: the current month in India
 * time, plus the previous one during the first five days of a month (a
 * month's allocation is still being distributed then).
 */
export function monthsToSync(now: Date = new Date()): { year: string; month: string }[] {
  const current = currentIstYearMonth(now);
  const day = parseInt(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "numeric" }).format(now),
    10
  );
  return day <= 5 ? [current, previousMonth(current.year, current.month)] : [current];
}

/** True when the request carries "Bearer <secret>" for a configured, non-empty secret. */
export function isCronAuthorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Active dealer accounts that can be synced (admin accounts are not shops). */
export function dealersToSync<U extends { fpsId: string; distCode: string; role: string; active: boolean }>(
  users: U[]
): U[] {
  return users.filter((u) => u.role === "dealer" && u.active && u.fpsId.trim() && u.distCode.trim());
}
