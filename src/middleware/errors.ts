import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so a thrown error reaches errorHandler
 * (Express 4 doesn't catch rejected promises itself). Handlers then need no
 * try/catch of their own unless they answer some errors differently.
 */
export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    return Promise.resolve(handler(req, res, next)).catch(next) as unknown as void;
  };
}

/** Last middleware: any unhandled error becomes a 500 with its message. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
}
