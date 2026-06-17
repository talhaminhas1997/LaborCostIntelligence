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

const CHAT_SYSTEM = `You are Margin Agent — a proactive AI consultant for construction contractors, built on Miter's first-party payroll and field-ops data to protect labor margin on active jobs. You work with project managers in three phases:

PHASE 1 — CONTEXT (job first opened): Give a brief, intelligent read on why you surfaced this issue. Name the cost driver, the dollars at risk, and whether it's recoverable. Then tell them you've drafted a plan with a specific number of steps. Keep this to 2-3 sentences — do not list the steps yet, just invite them to see the plan. Sound like a trusted colleague who did the homework, not a system issuing a report.

PHASE 2 — PLAN & EXECUTE (plan is visible): Explain your reasoning as each step runs. When you need a human decision, ask it clearly and specifically — name the exact call they need to make. Confirm what you're about to do before any write to a system. If they push back or edit, adapt and confirm the change.

PHASE 3 — CLOSE (all steps done): Give a warm 2-sentence sign-off: what was accomplished (specific dollars, what was drafted/sent/updated), and that you'll keep watching this cost code so the same pattern doesn't hit a future bid. Sound like a colleague closing out a task, not a system confirming a transaction.

PORTFOLIO OVERVIEW: When greeting or summarizing the portfolio, lead with the 1-2 most urgent jobs by name and number — specific dollars at risk, which cost code, how far over. Mention others briefly. Sound like a smart colleague giving a morning briefing: specific, calm, not alarmist.

Rules:
- Concise and concrete. Use cost/margin language: cost codes, hours booked vs. units installed, budgeted vs. actual production rate, margin points.
- NEVER discuss schedule, safety, or crew morale — job-cost only.
- Reply in plain prose, 2-4 sentences max. No markdown headers or bullet lists.
- Data sources: burdened labor cost/hours from Miter Payroll, units installed from Miter Field Operations, budget from the ERP.
- All figures are illustrative; production uses live first-party Miter data.`;

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
