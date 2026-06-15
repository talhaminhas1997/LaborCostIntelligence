import {
  FAST_MODEL,
  SMART_MODEL,
  getClient,
  extractJson,
  num,
  textOf,
} from "./anthropic";
import { computeAnalyze, computeChat, computeExtract } from "./fallbacks";
import type {
  AnalyzeRequest,
  AnalyzeResult,
  ChatRequest,
  ExtractRequest,
  ExtractResult,
  PhaseResult,
  Status,
} from "./types";

/**
 * Pure, framework-agnostic handlers shared by the local Express dev server
 * (server/src/index.ts) and the Vercel serverless functions (api/*.ts).
 * Every function always resolves to a valid result — model output when a key
 * is present and the call succeeds, otherwise a deterministic fallback.
 */

export const apiMode = (): "live" | "fallback" =>
  getClient() ? "live" : "fallback";

const coerceStatus = (v: unknown): Status =>
  v === "light" || v === "heavy" || v === "on-target" ? v : "on-target";

/* ----------------------------------------------------------------- chat */

const CHAT_SYSTEM = `You are Cubit, the job-cost intelligence layer for construction. You speak to construction operations leadership (ops managers, project executives) about protecting labor margin on active jobs and bidding new work without undercosting.

Rules:
- Be concise, concrete, and use cost/margin language. Reference cost codes, hours, budgeted vs actual production, and margin points.
- NEVER discuss schedule, safety, or generic crew morale — job-cost only.
- When asked about an active job's drift, explain the cost driver and the projected margin impact, and (when relevant) the multi-step plan to protect margin: draft change order, reforecast margin, alert PM, update budget — always human-approved.
- For bidding, frame value as preventing undercosting; benchmarks are learned from the contractor's own past/monitored jobs.
- All figures are illustrative; production uses live cross-contractor payroll data (v1 single-tenant: the contractor's own history).
- Reply in plain prose, 2-4 sentences. No markdown headers.`;

export async function runChat(
  body: ChatRequest
): Promise<{ reply: string; source: "model" | "fallback" }> {
  const client = getClient();
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

/* -------------------------------------------------------------- extract */

const EXTRACT_SYSTEM = `You extract a construction labor takeoff from the input (a job description, a pasted spreadsheet/takeoff, or a document). Return ONLY a JSON object, no prose, no code fences, matching exactly:
{
  "trade": string,            // "Electrical" | "Mechanical/HVAC" | "Concrete" | "Plumbing" (best fit)
  "region": string,           // e.g. "Mountain West"; default "Mountain West" if unknown
  "scope": string,            // one concise paragraph summarizing the scope
  "phases": [ { "name": string, "hours": number, "costCode": string } ],  // CSI-style cost codes, e.g. "16-100"
  "blendedRate": number       // blended labor $/hr; default 78 if unstated
}
Break the scope into realistic phases by work type with estimated hours and a plausible cost code each. Numbers only (no "$", no units). Reason from the actual input so different inputs yield different takeoffs.`;

export async function runExtract(
  body: ExtractRequest
): Promise<ExtractResult & { source: "model" | "fallback" }> {
  const client = getClient();
  if (!client) return { ...computeExtract(body), source: "fallback" };

  try {
    const content: any[] = [];
    if (
      body.fileBase64 &&
      body.mimeType &&
      /^(image\/(png|jpeg|gif|webp))$/.test(body.mimeType)
    ) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: body.mimeType, data: body.fileBase64 },
      });
      content.push({ type: "text", text: "Extract the labor takeoff from this document as JSON." });
    } else if (body.fileBase64 && body.mimeType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: body.fileBase64 },
      });
      content.push({ type: "text", text: "Extract the labor takeoff from this document as JSON." });
    } else {
      const text = (body.text || "").trim();
      if (text.length < 12) return { ...computeExtract(body), source: "fallback" };
      content.push({ type: "text", text: `Extract the labor takeoff as JSON:\n\n${text}` });
    }

    const message = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content }],
    });

    const jsonStr = extractJson(textOf(message));
    if (!jsonStr) throw new Error("no JSON");
    const raw = JSON.parse(jsonStr);
    const phases = Array.isArray(raw.phases) ? raw.phases : [];
    const result: ExtractResult = {
      trade: String(raw.trade ?? "Electrical"),
      region: String(raw.region ?? "Mountain West"),
      scope: String(raw.scope ?? ""),
      phases: phases
        .filter((p: any) => p && p.name)
        .map((p: any) => ({
          name: String(p.name),
          hours: num(p.hours),
          costCode: p.costCode ? String(p.costCode) : undefined,
        })),
      blendedRate: num(raw.blendedRate, 78),
    };
    if (result.phases.length === 0) throw new Error("no phases");
    return { ...result, source: "model" };
  } catch (err) {
    console.error("[extract] fallback:", (err as Error).message);
    return { ...computeExtract(body), source: "fallback" };
  }
}

/* -------------------------------------------------------------- analyze */

const ANALYZE_SYSTEM = `You are an expert construction labor-cost estimator inside Cubit. You pressure-test a bid's labor BEFORE submission, using ILLUSTRATIVE benchmark bands learned from the contractor's own past and monitored jobs for the trade and region.

Reason genuinely from the actual scope and numbers — different inputs MUST produce different results. For each phase decide a realistic benchmark band (low–high hours), tag it light/heavy/on-target, and note phase-specific risk (fire-alarm/low-voltage, commissioning, finish/punch, demo, service coordination are commonly under-booked). Identify the riskiest underbudgeted phase, flag a realistic rework/punch allowance usually omitted, and produce a defensible recommended total hours and cost using the blended rate.

percentDelta = (your total hours − recommended total) / recommended total × 100, rounded. NEGATIVE = light (under). verdict: "light" if <= -4, "heavy" if >= 4, else "on-target". Frame value as preventing undercosting.

Return ONLY this JSON (no prose, no code fences). All hour/cost values are plain numbers:
{
  "verdict": "light"|"heavy"|"on-target",
  "percentDelta": number,
  "headline": string,
  "phases": [ { "name": string, "costCode": string, "yourHours": number, "benchmarkLow": number, "benchmarkHigh": number, "status": "light"|"heavy"|"on-target", "note": string } ],
  "reworkGap": { "yourAssumption": string, "benchmarkTypical": string, "note": string },
  "recommended": { "hours": number, "cost": number, "blendedRate": number },
  "rationale": string,
  "confidence": "low"|"medium"|"high"
}
Include every phase provided, in order.`;

function normalizeAnalyze(raw: any, req: AnalyzeRequest): AnalyzeResult {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.phases)) {
    throw new Error("missing fields");
  }
  const rate = num(req.blendedRate, 78);
  const phases: PhaseResult[] = raw.phases.map((p: any) => ({
    name: String(p?.name ?? "Phase"),
    costCode: p?.costCode ? String(p.costCode) : undefined,
    yourHours: num(p?.yourHours),
    benchmarkLow: num(p?.benchmarkLow),
    benchmarkHigh: num(p?.benchmarkHigh),
    status: coerceStatus(p?.status),
    note: String(p?.note ?? ""),
  }));
  const recHours = num(raw?.recommended?.hours);
  const recCost = num(raw?.recommended?.cost, recHours * rate);
  return {
    verdict: coerceStatus(raw.verdict),
    percentDelta: num(raw.percentDelta),
    headline: String(raw.headline ?? "Estimate analyzed"),
    phases,
    reworkGap: {
      yourAssumption: String(raw?.reworkGap?.yourAssumption ?? ""),
      benchmarkTypical: String(raw?.reworkGap?.benchmarkTypical ?? ""),
      note: String(raw?.reworkGap?.note ?? ""),
    },
    recommended: {
      hours: recHours,
      cost: recCost || recHours * rate,
      blendedRate: num(raw?.recommended?.blendedRate, rate),
    },
    rationale: String(raw.rationale ?? ""),
    confidence:
      raw.confidence === "low" || raw.confidence === "high"
        ? raw.confidence
        : "medium",
    source: "model",
  };
}

export async function runAnalyze(body: AnalyzeRequest): Promise<AnalyzeResult> {
  const request: AnalyzeRequest = {
    trade: String(body.trade ?? "Electrical"),
    region: String(body.region ?? "Mountain West"),
    scope: String(body.scope ?? ""),
    blendedRate: num(body.blendedRate, 78),
    phases: (body.phases || [])
      .filter((p) => p && p.name)
      .map((p) => ({
        name: String(p.name),
        hours: num(p.hours),
        costCode: p.costCode ? String(p.costCode) : undefined,
      })),
  };

  const client = getClient();
  if (!client) return computeAnalyze(request);

  try {
    const phaseLines = request.phases
      .map(
        (p, i) =>
          `  ${i + 1}. ${p.name}${p.costCode ? ` [${p.costCode}]` : ""}: ${p.hours} hrs`
      )
      .join("\n");
    const total = request.phases.reduce((s, p) => s + p.hours, 0);
    const userPrompt = `Trade: ${request.trade}
Region: ${request.region}
Blended labor rate: $${request.blendedRate}/hr

Scope:
${request.scope}

Bid labor by phase:
${phaseLines}
  TOTAL: ${total} hrs

Analyze and return ONLY the JSON.`;

    const message = await client.messages.create({
      model: SMART_MODEL,
      max_tokens: 1600,
      system: ANALYZE_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const jsonStr = extractJson(textOf(message));
    if (!jsonStr) throw new Error("no JSON");
    return normalizeAnalyze(JSON.parse(jsonStr), request);
  } catch (err) {
    console.error("[analyze] fallback:", (err as Error).message);
    return computeAnalyze(request);
  }
}
