import { Router } from "express";
import { SyncService } from "../services/SyncService";
import { AuthService } from "../services/AuthService";

const router = Router();
const syncService = new SyncService();
const authService = new AuthService();

/**
 * Every stored transaction belonging to every dealer, tagged with which
 * dealer it belongs to — the admin "collective view" across all FPS
 * accounts. Pure read from storage, same as /all, never calls the gov API.
 */
router.get("/all-dealers", async (_req, res) => {
  try {
    const users = await authService.listUsers();
    const dealers = users.filter((u) => u.role === "dealer");
    const results = await Promise.all(
      dealers.map(async (d) => {
        const transactions = await syncService.getAllStoredTransactions(d.fpsId);
        return transactions.map((t) => ({ ...t, dealerName: d.displayName }));
      })
    );
    const transactions = results.flat();
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const distCode = String(req.query.distCode || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !distCode || !year || !month) {
    res.status(400).json({ error: "fpsId, distCode, year and month are required" });
    return;
  }
  const readOnly = req.query.readOnly === "true";
  const forceRefresh = req.query.forceRefresh === "true";
  try {
    const result = await syncService.getMonthData(distCode, fpsId, year, month, readOnly, forceRefresh);
    res.json({
      success: true,
      transactions: result.transactions,
      count: result.transactions.length,
      source: result.source,
      lockStatus: result.lockStatus,
      unknownColumns: result.unknownColumns,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Day-by-day comparison of stored sales against the portal's own daily totals (live portal call). */
router.get("/verify", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const distCode = String(req.query.distCode || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !distCode || !year || !month) {
    res.status(400).json({ error: "fpsId, distCode, year and month are required" });
    return;
  }
  try {
    const result = await syncService.verifyMonth(distCode, fpsId, year, month);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Which months of a year have been synced — drives the "Sync missing months" backfill. */
router.get("/locks", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const year = String(req.query.year || "");
  if (!fpsId || !year) {
    res.status(400).json({ error: "fpsId and year are required" });
    return;
  }
  try {
    const locks = await syncService.listLocks(fpsId, year);
    res.json({
      success: true,
      locks: locks.map((l) => ({ month: l.month, status: l.status, recordCount: l.recordCount, storedCount: l.storedCount })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/all", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    const transactions = await syncService.getAllStoredTransactions(fpsId);
    res.json({ success: true, transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.delete("/all", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    await syncService.clearAllTransactions(fpsId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
