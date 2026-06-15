import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runChat } from "./_lib/core";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.status(200).json(await runChat(req.body || {}));
}
