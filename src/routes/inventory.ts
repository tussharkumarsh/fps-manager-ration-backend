import { Router } from "express";
import { InventoryService } from "../services/InventoryService";
import { AuthService } from "../services/AuthService";

const router = Router();
const inventoryService = new InventoryService();
const authService = new AuthService();

/**
 * Every dealer's inventory ledger for a given month, tagged with which
 * dealer each row belongs to — the admin "collective view" across all FPS
 * accounts.
 */
router.get("/all-dealers", async (req, res) => {
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!year || !month) {
    res.status(400).json({ error: "year and month are required" });
    return;
  }
  try {
    const users = await authService.listUsers();
    const dealers = users.filter((u) => u.role === "dealer");
    const results = await Promise.all(
      dealers.map(async (d) => {
        const { items, ledger } = await inventoryService.getMonthLedger(d.fpsId, year, month);
        const itemsById = new Map(items.map((i) => [i.id, i]));
        return ledger.map((entry) => ({
          ...entry,
          dealerName: d.displayName,
          itemName: itemsById.get(entry.itemId)?.name ?? entry.itemId,
          unit: itemsById.get(entry.itemId)?.unit ?? "",
        }));
      })
    );
    const rows = results.flat();
    res.json({ success: true, rows });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !year || !month) {
    res.status(400).json({ error: "fpsId, year and month are required" });
    return;
  }
  try {
    const { items, ledger } = await inventoryService.getMonthLedger(fpsId, year, month);
    res.json({ success: true, items, ledger });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/items", async (req, res) => {
  const { fpsId, name, unit } = req.body ?? {};
  if (!fpsId || !name || !unit) {
    res.status(400).json({ error: "fpsId, name and unit are required" });
    return;
  }
  try {
    const item = await inventoryService.addItem(fpsId, { name, unit, txField: "", active: true });
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/ledger", async (req, res) => {
  const { fpsId, year, month, itemId, received, distributed } = req.body ?? {};
  if (!fpsId || !year || !month || !itemId) {
    res.status(400).json({ error: "fpsId, year, month and itemId are required" });
    return;
  }
  try {
    let entry;
    if (received !== undefined) {
      entry = await inventoryService.setReceived(fpsId, year, month, itemId, Number(received) || 0);
    } else if (distributed !== undefined) {
      entry = await inventoryService.setManualDistributed(fpsId, year, month, itemId, Number(distributed) || 0);
    } else {
      res.status(400).json({ error: "received or distributed is required" });
      return;
    }
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
