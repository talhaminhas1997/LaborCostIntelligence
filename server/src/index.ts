import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiMode, runChat, runExtract, runAnalyze } from "../../api/_lib/core";

/**
 * Local development server. In production these routes are served by the
 * Vercel serverless functions in /api, which call the same shared core
 * (api/_lib/core.ts). This Express app exists only so `npm run dev` gives the
 * Vite client a local /api to talk to.
 */
const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

// Dedicated var so dev runners / hosts that inject PORT can't move the API off
// the port the Vite proxy expects. Set API_PORT to override.
const PORT = Number(process.env.API_PORT) || 8787;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: apiMode() });
});

app.post("/api/chat", async (req, res) => {
  res.json(await runChat(req.body || {}));
});

app.post("/api/extract", async (req, res) => {
  res.json(await runExtract(req.body || {}));
});

app.post("/api/analyze", async (req, res) => {
  res.json(await runAnalyze(req.body || {}));
});

app.listen(PORT, () => {
  const mode = apiMode() === "live" ? "live Claude" : "deterministic fallback";
  console.log(`[cubit] API on http://localhost:${PORT} (${mode})`);
});
