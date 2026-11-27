import { Router } from "express";
import { OtherShopRepository } from "../repositories/OtherShopRepository";
import { isValidShopFpsId, sanitizeShopDetails } from "../lib/otherShop";

const router = Router();
const repo = new OtherShopRepository();

router.get("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    res.json({ success: true, shops: await repo.list(fpsId) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.put("/", async (req, res) => {
  const { fpsId, shopFpsId, details } = req.body ?? {};
  if (!fpsId || !isValidShopFpsId(shopFpsId)) {
    res.status(400).json({ error: "fpsId and a numeric shopFpsId are required" });
    return;
  }
  if (shopFpsId.trim() === String(fpsId).trim()) {
    res.status(400).json({ error: "shopFpsId must be another shop, not your own" });
    return;
  }
  try {
    const shop = await repo.upsert(String(fpsId), shopFpsId, sanitizeShopDetails(details));
    res.json({ success: true, shop });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.delete("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const shopFpsId = String(req.query.shopFpsId || "");
  if (!fpsId || !isValidShopFpsId(shopFpsId)) {
    res.status(400).json({ error: "fpsId and a numeric shopFpsId are required" });
    return;
  }
  try {
    await repo.delete(fpsId, shopFpsId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
