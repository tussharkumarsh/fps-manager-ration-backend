import { Router } from "express";
import { OtherShopRepository } from "../repositories/OtherShopRepository";
import { isValidShopFpsId, sanitizeShopDetails } from "../lib/otherShop";
import { FpsDirectoryRepository } from "../repositories/FpsDirectoryRepository";
import { GovApiClient } from "../clients/GovApiClient";
import { isValidOfficeCode } from "../lib/fpsDirectory";
import { ShopProfileRepository } from "../repositories/ShopProfileRepository";
import { sanitizeProfile, type ShopProfile } from "../lib/shopProfile";

const router = Router();
const profileRepo = new ShopProfileRepository();
const repo = new OtherShopRepository();
const directoryRepo = new FpsDirectoryRepository();
const govApi = new GovApiClient();

/** Portal directory entries for the given FPS numbers (?ids=a,b,c). */
router.get("/directory", async (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isValidShopFpsId(s));
  if (ids.length > 500) {
    res.status(400).json({ error: "Too many ids" });
    return;
  }
  try {
    res.json({ success: true, entries: await directoryRepo.listByIds(Array.from(new Set(ids))) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Fetches one AFSO office's shop list from the portal and stores it (a live portal call). */
router.post("/directory/sync", async (req, res) => {
  const { officeCode } = req.body ?? {};
  if (!isValidOfficeCode(officeCode)) {
    res.status(400).json({ error: "A 7-digit officeCode is required" });
    return;
  }
  try {
    const entries = await govApi.fetchAfsoOwners(officeCode.trim());
    await directoryRepo.upsertMany(entries);
    res.json({ success: true, officeCode: officeCode.trim(), count: entries.length });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** This dealer's stored shop-report profiles for the given FPS numbers (?fpsId=…&ids=a,b,c). */
router.get("/profiles", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isValidShopFpsId(s));
  if (ids.length > 500) {
    res.status(400).json({ error: "Too many ids" });
    return;
  }
  try {
    res.json({ success: true, profiles: await profileRepo.listByIds(fpsId, Array.from(new Set(ids))) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Saves shop-report profiles (the caller keeps only shops related to the dealer). */
router.post("/profiles", async (req, res) => {
  const raw = req.body?.profiles;
  const fpsId = String(req.body?.fpsId || "");
  if (!fpsId || !Array.isArray(raw) || raw.length > 500) {
    res.status(400).json({ error: "fpsId and profiles[] (at most 500) are required" });
    return;
  }
  const profiles = raw.map(sanitizeProfile).filter((p): p is ShopProfile => p !== null);
  try {
    const result = await profileRepo.saveNewer(fpsId, profiles);
    res.json({ success: true, ...result, rejected: raw.length - profiles.length });
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
