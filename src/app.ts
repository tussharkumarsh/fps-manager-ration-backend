import express from "express";
import cors from "cors";
import { supabase } from "./lib/supabase";
import { internalAuth } from "./middleware/internalAuth";
import authRoutes from "./routes/auth";
import customerRoutes from "./routes/customers";
import transactionRoutes from "./routes/transactions";
import inventoryRoutes from "./routes/inventory";
import resetAllRoutes from "./routes/resetAll";

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((o) => o.trim());

app.use(cors({ origin: allowedOrigins }));
// Express's default body-size limit is 100kb — far too small for a bulk
// customer import (hundreds of ration cards, each with a full family-
// members array). The Next.js side already chunks large imports to stay
// well under this, but the limit itself still needs raising to accept
// those chunks (and any other reasonably large payload) at all.
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/supabase", async (_req, res) => {
  const { error } = await supabase.from("users").select("fps_id").limit(1);
  if (error) {
    res.status(500).json({ status: "error", error: error.message });
    return;
  }
  res.json({ status: "connected" });
});

// Everything past this point is trusted server-to-server traffic from the
// Next.js app only — see src/middleware/internalAuth.ts.
app.use(internalAuth);

app.use("/auth", authRoutes);
app.use("/customers", customerRoutes);
app.use("/transactions", transactionRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/reset-all", resetAllRoutes);

export default app;
