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

/**
 * Last middleware: an error carrying a 4xx status (e.g. body-parser's 400
 * for malformed JSON) keeps it; anything else becomes a 500. Either way the
 * answer is JSON with the error's message.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = Number((err as { status?: unknown } | null)?.status);
  const code = status >= 400 && status < 500 ? status : 500;
  res.status(code).json({ error: err instanceof Error ? err.message : "Unknown error" });
}
