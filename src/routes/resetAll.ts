import { Router } from "express";
import { asyncRoute } from "../middleware/errors";
import { DataResetService } from "../services/DataResetService";

const router = Router();
const dataResetService = new DataResetService();

router.delete("/", asyncRoute(async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  await dataResetService.resetAll(fpsId);
  res.json({ success: true });
}));

export default router;
