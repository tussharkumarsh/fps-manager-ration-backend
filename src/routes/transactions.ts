import { Router } from "express";
import { SyncService } from "../services/SyncService";

const router = Router();
const syncService = new SyncService();

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
  try {
    const result = await syncService.getMonthData(distCode, fpsId, year, month, readOnly);
    res.json({
      success: true,
      transactions: result.transactions,
      count: result.transactions.length,
      source: result.source,
      lockStatus: result.lockStatus,
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
