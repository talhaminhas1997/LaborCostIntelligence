import { FAST_MODEL, SMART_MODEL, getClient, hasKey, textOf } from "./anthropic";
import { computeChat } from "./fallbacks";
import type { ChatRequest } from "./types";

/**
 * Framework-agnostic handler shared by the local Express dev server
 * (server/src/index.ts) and the Vercel serverless function (api/chat.ts).
 * Always resolves to a valid reply — model output when a key is present and the
 * call succeeds, otherwise a deterministic fallback.
 */

export const apiMode = (): "live" | "fallback" => (hasKey() ? "live" : "fallback");

const CHAT_SYSTEM = `You are Cost Agent, a job-cost intelligence layer for construction built on Miter (payroll + field operations). You speak to construction operations leadership about protecting labor margin on active jobs.

Rules:
- Be concise, concrete, and use cost/margin language. Reference cost codes, hours booked vs. units installed, budgeted vs. actual production rate, and margin points.
- NEVER discuss schedule, safety, or generic crew morale — job-cost only.
- When asked about a job's drift, explain the cost driver and the projected margin impact, and (when relevant) the multi-step plan to protect margin: draft change order, reforecast margin, alert PM, write back to benchmark — always human-approved.
- Data sources: burdened labor cost/hours from Miter Payroll, units installed from Miter Field Operations, budget from the ERP.
- All figures are illustrative; production uses live first-party Miter data.
- Reply in plain prose, 2-4 sentences. No markdown headers.`;

export async function runChat(
  body: ChatRequest
): Promise<{ reply: string; source: "model" | "fallback" }> {
  const client = await getClient();
  if (!client || !Array.isArray(body.messages)) {
    return { reply: computeChat(body), source: "fallback" };
  }
  try {
    const ctx = body.jobContext
      ? `\n\nJob context (JSON): ${JSON.stringify(body.jobContext)}`
      : "";
    const useSmart = body.mode === "margin-watch";
    const message = await client.messages.create({
      model: useSmart ? SMART_MODEL : FAST_MODEL,
      max_tokens: 400,
      system: CHAT_SYSTEM + ctx,
      messages: body.messages.map((m) => ({
        role: m.role,
        content: String(m.content ?? ""),
      })),
    });
    const reply = textOf(message).trim();
    if (!reply) throw new Error("empty reply");
    return { reply, source: "model" };
  } catch (err) {
    console.error("[chat] fallback:", (err as Error).message);
    return { reply: computeChat(body), source: "fallback" };
  }
}
