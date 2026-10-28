import { Router } from "express";
import { ManualGoshwaraRepository } from "../repositories/ManualGoshwaraRepository";
import type { ManualGoshwaraEntries } from "../types";

const router = Router();
const repo = new ManualGoshwaraRepository();

/** Coerces client-sent entries into { key: { phh, aay } } with finite numbers only. */
function sanitizeEntries(raw: unknown): ManualGoshwaraEntries {
  const entries: ManualGoshwaraEntries = {};
  if (!raw || typeof raw !== "object") return entries;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = (value ?? {}) as { phh?: unknown; aay?: unknown };
    const phh = Number(v.phh);
    const aay = Number(v.aay);
    entries[key] = { phh: Number.isFinite(phh) ? phh : 0, aay: Number.isFinite(aay) ? aay : 0 };
  }
  return entries;
}

router.get("/manual", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !year || !month) {
    res.status(400).json({ error: "fpsId, year and month are required" });
    return;
  }
  try {
    const goshwara = await repo.get(fpsId, year, month);
    res.json({ success: true, goshwara });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.put("/manual", async (req, res) => {
  const { fpsId, year, month, entries } = req.body ?? {};
  if (!fpsId || !year || !month) {
    res.status(400).json({ error: "fpsId, year and month are required" });
    return;
  }
  try {
    const goshwara = await repo.upsert(fpsId, year, month, sanitizeEntries(entries));
    res.json({ success: true, goshwara });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
