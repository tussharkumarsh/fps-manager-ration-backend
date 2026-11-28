import { Router } from "express";
import { asyncRoute } from "../middleware/errors";
import { dealerIdentityError } from "../lib/dealerIdentity";
import { AuthService } from "../services/AuthService";

const router = Router();
const authService = new AuthService();

router.post("/verify", asyncRoute(async (req, res) => {
  const { identifier, password, clientIp } = req.body ?? {};
  if (!identifier || !password) {
    res.status(400).json({ error: "identifier and password are required" });
    return;
  }
  const result = await authService.verifyCredentials(identifier, password, typeof clientIp === "string" ? clientIp : undefined);
  if (result === "locked") {
    res.json({ success: true, result: null, locked: true });
    return;
  }
  if (!result) {
    res.json({ success: true, result: null });
    return;
  }
  res.json({ success: true, result });
}));

router.post("/users", asyncRoute(async (req, res) => {
  const { fpsId, distCode, username, password, displayName, role } = req.body ?? {};
  if (!fpsId || !distCode || !username || !password || !displayName) {
    res.status(400).json({ error: "fpsId, distCode, username, password, displayName are required" });
    return;
  }
  const identityError = dealerIdentityError(fpsId, distCode, role ?? "dealer");
  if (identityError) {
    res.status(400).json({ error: identityError });
    return;
  }
  await authService.createOrUpdateUser({ fpsId, distCode, username, password, displayName, role });
  res.json({ success: true });
}));

router.delete("/users/:fpsId", asyncRoute(async (req, res) => {
  await authService.deleteUser(String(req.params.fpsId));
  res.json({ success: true });
}));

router.patch("/users/:fpsId", asyncRoute(async (req, res) => {
  const { distCode, username, displayName, role, active } = req.body ?? {};
  if (role !== undefined && role !== "dealer" && role !== "admin") {
    res.status(400).json({ error: "role must be 'dealer' or 'admin'" });
    return;
  }
  if (distCode !== undefined || role !== undefined) {
    const current = await authService.getProfile(String(req.params.fpsId));
    if (current) {
      const identityError = dealerIdentityError(String(req.params.fpsId), distCode ?? current.distCode, role ?? current.role);
      if (identityError) {
        res.status(400).json({ error: identityError });
        return;
      }
    }
  }
  const profile = await authService.updateProfile(String(req.params.fpsId), {
    distCode,
    username,
    displayName,
    role,
    active,
  });
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ success: true, profile });
}));

router.get("/users", asyncRoute(async (_req, res) => {
  const users = await authService.listUsers();
  res.json({ success: true, users });
}));

router.get("/profile", asyncRoute(async (req, res) => {
  const fpsId = String(req.query.fpsId || "");
  if (!fpsId) {
    res.status(400).json({ error: "fpsId is required" });
    return;
  }
  const profile = await authService.getProfile(fpsId);
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ success: true, profile });
}));

router.post("/change-password", asyncRoute(async (req, res) => {
  const { fpsId, currentPassword, newPassword } = req.body ?? {};
  if (!fpsId || !currentPassword || !newPassword) {
    res.status(400).json({ error: "fpsId, currentPassword and newPassword are required" });
    return;
  }
  if (String(newPassword).length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }
  const ok = await authService.changePassword(fpsId, currentPassword, newPassword);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  res.json({ success: true });
}));

export default router;
