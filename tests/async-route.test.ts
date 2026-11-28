import test from "node:test";
import assert from "node:assert/strict";

import { asyncRoute, errorHandler } from "../src/middleware/errors";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

test("asyncRoute hands a thrown error to next()", async () => {
  let passed: unknown;
  const handler = asyncRoute(async () => { throw new Error("boom"); });
  await handler({} as never, fakeRes() as never, (err?: unknown) => { passed = err; });
  assert.ok(passed instanceof Error);
  assert.equal((passed as Error).message, "boom");
});

test("errorHandler answers 500 with the error message", () => {
  const res = fakeRes();
  errorHandler(new Error("db down"), {} as never, res as never, () => undefined);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "db down" });
  const res2 = fakeRes();
  errorHandler("weird", {} as never, res2 as never, () => undefined);
  assert.deepEqual(res2.body, { error: "Unknown error" });
});

test("an error thrown in an asyncRoute handler reaches the client as JSON 500", async () => {
  const express = (await import("express")).default;
  const app = express();
  app.get("/boom", asyncRoute(async () => { throw new Error("db down"); }));
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    const port = (server.address() as { port: number }).port;
    const r = await fetch(`http://localhost:${port}/boom`);
    assert.equal(r.status, 500);
    assert.deepEqual(await r.json(), { error: "db down" });
  } finally {
    server.close();
  }
});

test("errorHandler keeps a client-error status set on the error (e.g. malformed JSON body)", () => {
  const res = fakeRes();
  errorHandler(Object.assign(new Error("Unexpected token"), { status: 400 }), {} as never, res as never, () => undefined);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Unexpected token" });
  // A server-side status on an error is still answered as 500.
  const res2 = fakeRes();
  errorHandler(Object.assign(new Error("x"), { status: 503 }), {} as never, res2 as never, () => undefined);
  assert.equal(res2.statusCode, 500);
});
