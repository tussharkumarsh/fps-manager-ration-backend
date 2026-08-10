import { Router } from "express";
import { AuthService } from "../services/AuthService";

const router = Router();
const authService = new AuthService();

router.post("/verify", async (req, res) => {
  try {
    const { identifier, password } = req.body ?? {};
    if (!identifier || !password) {
      res.status(400).json({ error: "identifier and password are required" });
      return;
    }
    const result = await authService.verifyCredentials(identifier, password);
    if (!result) {
      res.json({ success: true, result: null });
      return;
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { fpsId, distCode, username, password, displayName, role } = req.body ?? {};
    if (!fpsId || !distCode || !username || !password || !displayName) {
      res.status(400).json({ error: "fpsId, distCode, username, password, displayName are required" });
      return;
    }
    await authService.createOrUpdateUser({ fpsId, distCode, username, password, displayName, role });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/users", async (_req, res) => {
  try {
    const users = await authService.listUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/profile", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/change-password", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
