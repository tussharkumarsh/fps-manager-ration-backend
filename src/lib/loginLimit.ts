export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** True once an identifier has MAX_FAILED_ATTEMPTS failures inside the window ending at `now`. */
export function isLockedOut(failedAt: Date[], now: Date): boolean {
  const since = now.getTime() - LOCKOUT_WINDOW_MS;
  return failedAt.filter((d) => d.getTime() > since).length >= MAX_FAILED_ATTEMPTS;
}

/** Login IDs are matched case-insensitively for counting, so "ABC" and "abc" share a limit. */
export function attemptKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}
