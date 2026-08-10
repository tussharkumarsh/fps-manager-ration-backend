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

export default router;
