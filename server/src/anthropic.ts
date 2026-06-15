import Anthropic from "@anthropic-ai/sdk";

/** Fast model for chat + extraction; stronger model for analysis reasoning. */
export const FAST_MODEL = "claude-3-5-haiku-latest";
export const SMART_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

/** Pull the first balanced JSON object out of arbitrary model text. */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function num(v: unknown, fallback = 0): number {
  const n =
    typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Collect plain text from a messages response. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
