import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiMode } from "./_lib/core";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, model: apiMode() });
}
