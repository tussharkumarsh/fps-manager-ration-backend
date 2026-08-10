import type { NextFunction, Request, Response } from "express";

/**
 * This backend is only ever called server-side, by the Next.js app's own API
 * routes (which have already verified the user's NextAuth session) — never
 * directly by a browser. This shared-secret header is the trust boundary
 * that enforces that; without it, anyone who found this backend's URL could
 * read/write any dealer's data by fpsId.
 */
export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    res.status(500).json({ error: "Server misconfigured: INTERNAL_API_KEY not set" });
    return;
  }
  const provided = req.header("x-internal-key");
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
