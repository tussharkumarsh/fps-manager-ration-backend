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
  const { fpsId, year, month, itemId, received, distributed, opening } = req.body ?? {};
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
    } else if (opening !== undefined) {
      entry = await inventoryService.setOpening(fpsId, year, month, itemId, Number(opening) || 0);
    } else {
      res.status(400).json({ error: "received, distributed or opening is required" });
      return;
    }
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Bulk opening-balance setup across every item at once. */
router.post("/opening-balances", async (req, res) => {
  const { fpsId, year, month, balances } = req.body ?? {};
  if (!fpsId || !year || !month || !Array.isArray(balances)) {
    res.status(400).json({ error: "fpsId, year, month and balances[] are required" });
    return;
  }
  try {
    const entries = await inventoryService.setOpeningBalances(
      fpsId,
      year,
      month,
      balances.map((b: { itemId: string; opening: number }) => ({
        itemId: b.itemId,
        opening: Number(b.opening) || 0,
      }))
    );
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Full-year, monthwise ledger for a single dealer — powers the "All Months" table view. */
router.get("/yearly", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const year = String(req.query.year || "");
  if (!fpsId || !year) {
    res.status(400).json({ error: "fpsId and year are required" });
    return;
  }
  try {
    const { items, monthly } = await inventoryService.getYearLedger(fpsId, year);
    res.json({ success: true, items, monthly });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Reference-only snapshot from the government's own stock register — read from local storage, never live. */
router.get("/gov-stock", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const year = String(req.query.year || "");
  const month = String(req.query.month || "");
  if (!fpsId || !year || !month) {
    res.status(400).json({ error: "fpsId, year and month are required" });
    return;
  }
  try {
    const entries = await inventoryService.getGovStockRegister(fpsId, year, month);
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Fetches the latest stock register from the government portal and stores it as a reference snapshot. */
router.post("/gov-stock/sync", async (req, res) => {
  const { fpsId, distCode, year, month } = req.body ?? {};
  if (!fpsId || !distCode || !year || !month) {
    res.status(400).json({ error: "fpsId, distCode, year and month are required" });
    return;
  }
  try {
    const entries = await inventoryService.syncGovStockRegister(fpsId, distCode, year, month);
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Deletes every inventory item and ledger entry (all opening balances, history) for a dealer. */
router.delete("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    await inventoryService.clearAll(fpsId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
