import type {
  AnalyzeResult,
  ChatMessage,
  ExtractResult,
  PhaseInput,
} from "./types";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

export function chat(
  messages: ChatMessage[],
  opts: { jobContext?: Record<string, unknown>; mode?: "bid" | "margin-watch" } = {}
): Promise<{ reply: string; source?: string }> {
  return postJSON("/api/chat", { messages, ...opts });
}

export function extract(input: {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
}): Promise<ExtractResult> {
  return postJSON("/api/extract", input);
}

export function analyze(input: {
  trade: string;
  region: string;
  scope: string;
  phases: PhaseInput[];
  blendedRate: number;
}): Promise<AnalyzeResult> {
  return postJSON("/api/analyze", input);
}
