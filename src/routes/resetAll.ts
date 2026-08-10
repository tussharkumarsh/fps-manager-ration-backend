import { Router } from "express";
import { DataResetService } from "../services/DataResetService";

const router = Router();
const dataResetService = new DataResetService();

router.delete("/", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    await dataResetService.resetAll(fpsId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
