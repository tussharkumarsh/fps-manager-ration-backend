import { Router } from "express";
import { TransactionService } from "../services/TransactionService";

const router = Router();
const transactionService = new TransactionService();

router.get("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    const customers = await transactionService.getCustomers(fpsId);
    res.json({ success: true, customers, count: customers.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/", async (req, res) => {
  const { fpsId, srcNo, name, lastDispatched } = req.body ?? {};
  if (!fpsId || !srcNo || !name) {
    res.status(400).json({ error: "fpsId, srcNo and name are required" });
    return;
  }
  try {
    await transactionService.addCustomer(fpsId, { srcNo, name, lastDispatched });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/import", async (req, res) => {
  const { fpsId, customers } = req.body ?? {};
  if (!fpsId || !Array.isArray(customers)) {
    res.status(400).json({ error: "fpsId and customers[] are required" });
    return;
  }
  try {
    const savedCount = await transactionService.importCustomers(fpsId, customers);
    res.json({ success: true, savedCount });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.delete("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const srcNo = req.query.srcNo ? String(req.query.srcNo) : undefined;
  const all = req.query.all === "true";
  if (!fpsId || (!srcNo && !all)) {
    res.status(400).json({ error: "fpsId and (srcNo or all=true) are required" });
    return;
  }
  try {
    if (all) {
      await transactionService.clearAllCustomers(fpsId);
    } else {
      await transactionService.deleteCustomer(fpsId, srcNo as string);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
