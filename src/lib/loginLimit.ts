export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** True once an identifier has MAX_FAILED_ATTEMPTS failures inside the window ending at `now`. */
export function isLockedOut(failedAt: Date[], now: Date): boolean {
  const since = now.getTime() - LOCKOUT_WINDOW_MS;
  return failedAt.filter((d) => d.getTime() > since).length >= MAX_FAILED_ATTEMPTS;
}

/**
 * Failures are counted per account (its fps_id when the login ID resolves
 * to one, so fps_id and username share a counter; the raw ID otherwise)
 * AND per client IP. FPS IDs are public, so an account-only counter would
 * let anyone lock a dealer out by sending wrong passwords; with the IP in
 * the key, they can only lock out themselves.
 */
export function lockoutKey(accountId: string, clientIp: string | undefined): string {
  return `${accountId.trim().toLowerCase()}|${(clientIp || "").trim() || "-"}`;
}
