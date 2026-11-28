import { Router, type Request, type Response } from "express";
import { AuthService } from "../services/AuthService";
import { SyncService } from "../services/SyncService";
import { ScmInventoryService } from "../services/ScmInventoryService";
import { SyncRunRepository } from "../repositories/SyncRunRepository";
import { currentIstYearMonth } from "../lib/ids";
import { dealersToSync, fanOutBase, isCronAuthorized, monthsToSync } from "../lib/nightlySync";

/**
 * Nightly auto-sync, triggered by Vercel Cron (vercel.json, 23:00 IST).
 * Vercel calls with "Authorization: Bearer $CRON_SECRET". /cron/nightly
 * fans out one request per dealer and job to /cron/dealer, so every job
 * runs in its own function invocation with its own time limit, however
 * many dealers there are. Every job is recorded in sync_runs.
 */
const router = Router();
const authService = new AuthService();
const syncService = new SyncService();
const scmService = new ScmInventoryService();
const runs = new SyncRunRepository();

function authorized(req: Request, res: Response): boolean {
  if (isCronAuthorized(req.header("authorization"), process.env.CRON_SECRET)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

router.get("/nightly", async (req, res) => {
  if (!authorized(req, res)) return;
  try {
    const dealers = dealersToSync(await authService.listUsers());
    const months = monthsToSync();
    const current = currentIstYearMonth();
    const base = fanOutBase(process.env, req.header("host"));
    const jobs = dealers.flatMap((d) => [
      ...months.map((m) => ({ fpsId: d.fpsId, job: "transactions", ...m })),
      { fpsId: d.fpsId, job: "scm", ...current },
    ]);
    // Wait (within this invocation's own limit) only to report; each job
    // keeps running in its own invocation even if this one stops waiting.
    const results = await Promise.allSettled(
      jobs.map(async (j) => {
        const url = `${base}/cron/dealer?fpsId=${encodeURIComponent(j.fpsId)}&job=${j.job}&year=${j.year}&month=${j.month}`;
        const r = await fetch(url, {
          headers: { authorization: req.header("authorization") ?? "" },
          signal: AbortSignal.timeout(50_000),
        });
        if (!r.ok) throw new Error(`${j.fpsId} ${j.job}: HTTP ${r.status}`);
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    res.json({ success: true, dealers: dealers.length, jobs: jobs.length, failedOrStillRunning: failed });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/dealer", async (req, res) => {
  if (!authorized(req, res)) return;
  const fpsId = String(req.query.fpsId || "");
  const job = String(req.query.job || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !["transactions", "scm"].includes(job) || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    res.status(400).json({ error: "fpsId, job (transactions|scm), year and month are required" });
    return;
  }
  const profile = await authService.getProfile(fpsId).catch(() => null);
  const dealer = profile ? dealersToSync([profile])[0] : undefined;
  if (!dealer) {
    res.status(404).json({ error: "No active dealer with that FPS" });
    return;
  }

  const runId = await runs.start(fpsId, job, year, month);
  try {
    let detail: string;
    if (job === "transactions") {
      const r = await syncService.getMonthData(dealer.distCode, fpsId, year, month, false, true);
      detail = `${r.transactions.length} record(s)`;
    } else {
      const r = await scmService.syncAllotment(fpsId, year, month, dealer.distCode);
      detail = `${r.allotmentRows} allotment row(s)${r.warnings.length ? `; ${r.warnings.length} skipped` : ""}`;
    }
    await runs.finish(runId, true, detail);
    res.json({ success: true, detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await runs.finish(runId, false, message).catch(() => undefined);
    res.status(500).json({ error: message });
  }
});

export default router;
