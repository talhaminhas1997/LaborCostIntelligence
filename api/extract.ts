import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runExtract } from "./_lib/core";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.status(200).json(await runExtract(req.body || {}));
}
