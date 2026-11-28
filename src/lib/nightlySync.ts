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

/**
 * Where /cron/nightly sends its per-dealer requests: the project's
 * production domain (Vercel sets VERCEL_PROJECT_PRODUCTION_URL), because
 * per-deployment URLs sit behind Vercel Authentication and would refuse
 * them. Falls back to the request's own host (e.g. local runs).
 */
export function fanOutBase(env: { VERCEL_PROJECT_PRODUCTION_URL?: string }, host: string | undefined): string {
  return `https://${env.VERCEL_PROJECT_PRODUCTION_URL || host || ""}`;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a nightly job, and once more after `delayMs` if it fails: the ePOS
 * portal drops connections now and then (more so when several dealers sync
 * at once), and nobody is waiting on a nightly job.
 */
export async function retryOnce<T>(job: () => Promise<T>, delayMs: number, wait = sleep): Promise<T> {
  try {
    return await job();
  } catch {
    await wait(delayMs);
    return job();
  }
}
