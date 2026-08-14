import { Router } from "express";
import { ScmInventoryService } from "../services/ScmInventoryService";

const router = Router();
const service = new ScmInventoryService();

router.post("/sync", async (req, res) => {
    const { fpsId, year, month, shopNo, districtCode, districtName, batchNo } = req.body ?? {};

    if (!fpsId || !year || !month) {
        res.status(400).json({ error: "fpsId, year and month are required" });
        return;
    }

    try {
        const result = await service.syncMonth(fpsId, String(year), String(month), shopNo, districtCode, districtName, batchNo);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error("SCM sync failed", { error, fpsId, year, month });
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
});

router.post("/recompute", async (req, res) => {
    const { fpsId, year } = req.body ?? {};

    if (!fpsId || !year) {
        res.status(400).json({ error: "fpsId and year are required" });
        return;
    }

    try {
        await service.recomputeYear(fpsId, String(year));
        res.json({ success: true });
    } catch (error) {
        console.error("SCM summary recompute failed", { error, fpsId, year });
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
});

router.get("/summary", async (req, res) => {
    const fpsId = String(req.query.fpsId || "");
    const year = String(req.query.year || "");
    const month = String(req.query.month || "");

    if (!fpsId || !year || !month) {
        res.status(400).json({ error: "fpsId, year and month are required" });
        return;
    }

    try {
        const repo = (service as any).repo;
        const rows = await repo.getSummaryForMonth(fpsId, year, month);
        res.json({ success: true, rows });
    } catch (error) {
        console.error("SCM summary fetch failed", { error, fpsId, year, month });
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
});

export default router;
