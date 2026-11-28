import { Router } from "express";
import { isValidShopFpsId } from "../lib/otherShop";
import { TransactionService } from "../services/TransactionService";
import { AuthService } from "../services/AuthService";

const router = Router();

const isIsoTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
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
  const { fpsId, customers, importedAt } = req.body ?? {};
  if (!fpsId || !Array.isArray(customers)) {
    res.status(400).json({ error: "fpsId and customers[] are required" });
    return;
  }
  if (importedAt !== undefined && !isIsoTime(importedAt)) {
    res.status(400).json({ error: "importedAt must be an ISO time" });
    return;
  }
  try {
    const result = await transactionService.importCustomers(fpsId, customers, importedAt);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** One card's family members (lists leave them out to stay small). */
router.get("/members", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  const srcNo = String(req.query.srcNo || "");
  if (!fpsId || !srcNo) {
    res.status(400).json({ error: "fpsId and srcNo are required" });
    return;
  }
  try {
    const members = await transactionService.getCustomerMembers(fpsId, srcNo);
    res.json({ success: true, members });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Latest beneficiary-file upload per source FPS, for the FPS-wise summary. */
router.get("/imports", async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  try {
    const imports = await transactionService.listImports(fpsId);
    res.json({ success: true, imports });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/** Records a finished beneficiary-file upload (after all its chunks). */
router.post("/imports", async (req, res) => {
  const { fpsId, upload } = req.body ?? {};
  if (!fpsId || !upload || !isValidShopFpsId(upload.sourceFpsId) || !isIsoTime(upload.importedAt)) {
    res.status(400).json({ error: "fpsId and upload { sourceFpsId, importedAt, ... } are required" });
    return;
  }
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
  const str = (v: unknown) => String(v ?? "").slice(0, 300);
  try {
    const saved = await transactionService.recordImport(fpsId, {
      fpsId,
      sourceFpsId: String(upload.sourceFpsId).trim(),
      sourceFpsName: str(upload.sourceFpsName),
      district: str(upload.district),
      dfso: str(upload.dfso),
      tfso: str(upload.tfso),
      officeCode: str(upload.officeCode),
      fileName: str(upload.fileName),
      importedAt: upload.importedAt,
      cards: num(upload.cards),
      members: num(upload.members),
      aayCards: num(upload.aayCards),
      phhCards: num(upload.phhCards),
      footer: upload.footer && typeof upload.footer === "object" ? upload.footer : {},
      newCards: num(upload.newCards),
      updatedCards: num(upload.updatedCards),
    });
    res.json({ success: true, import: saved });
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
