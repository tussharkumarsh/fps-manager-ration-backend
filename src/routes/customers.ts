import { Router } from "express";
import { TransactionService } from "../services/TransactionService";
import { AuthService } from "../services/AuthService";

const router = Router();
const transactionService = new TransactionService();
const authService = new AuthService();

/**
 * Every customer belonging to every dealer, tagged with which dealer it
 * belongs to — the admin "collective view" across all FPS accounts.
 */
router.get("/all-dealers", async (_req, res) => {
  try {
    const users = await authService.listUsers();
    const dealers = users.filter((u) => u.role === "dealer");
    const results = await Promise.all(
      dealers.map(async (d) => {
        const customers = await transactionService.getCustomers(d.fpsId);
        return customers.map((c) => ({ ...c, fpsId: d.fpsId, dealerName: d.displayName }));
      })
    );
    const customers = results.flat();
    res.json({ success: true, customers, count: customers.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

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

router.patch("/", async (req, res) => {
  const { fpsId, srcNo, mobile, scheme, disabled, disabledReason, disabledAt } = req.body ?? {};
  if (!fpsId || !srcNo) {
    res.status(400).json({ error: "fpsId and srcNo are required" });
    return;
  }
  try {
    await transactionService.updateCustomer(fpsId, srcNo, { mobile, scheme, disabled, disabledReason, disabledAt });
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
