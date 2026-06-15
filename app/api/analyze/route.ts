import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { computeFallback } from "@/lib/fallback";
import type { AnalyzeRequest, AnalyzeResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an expert construction labor-cost estimator embedded in "Cubit", a labor cost intelligence platform.

You have access to ILLUSTRATIVE cross-contractor benchmark data: blended, burdened labor productivity bands for the given trade and region, derived (in this prototype) from how comparable crews actually book hours on similar scopes. Treat these as realistic illustrative benchmarks — never claim they are exact or sourced from a specific named contractor.

Your job: pressure-test the estimator's labor estimate BEFORE they bid.

Reason genuinely from the ACTUAL scope text and the ACTUAL numbers provided. Different inputs MUST produce different, defensible results — do not output boilerplate.

For each phase:
- Decide a realistic benchmark band (low–high hours) for a comparable crew doing THIS scope in THIS region for THIS trade.
- Compare the user's hours to that band and tag it light / heavy / on-target.
- Weigh phase-specific risk: e.g. fire-alarm/low-voltage tie-ins, commissioning/startup, finish/punch, demo on occupied space, and utility/service coordination are commonly under-booked.

Then:
- Identify the single riskiest underbudgeted phase.
- Flag a realistic rework / punch-list allowance the estimate may be missing (most estimates omit it).
- Produce a defensible RECOMMENDED total hours and a recommended total labor cost using the provided blended rate.
- percentDelta = how far the user's TOTAL hours are from your recommended total, as a percentage of the recommended total. NEGATIVE means the estimate is LIGHT (under), positive means HEAVY (over). Round to a whole number.
- verdict: "light" if percentDelta <= -4, "heavy" if >= 4, else "on-target".
- headline like "Your labor estimate is 14% light" / "...12% heavy" / "Your labor estimate is on target".
- A 2-3 sentence plain-English rationale grounded in the specific scope and numbers.
- A confidence tag: low / medium / high.

OUTPUT FORMAT — CRITICAL:
Return ONLY a single valid JSON object. No markdown, no code fences, no prose before or after. It must match EXACTLY this shape:
{
  "verdict": "light" | "heavy" | "on-target",
  "percentDelta": number,
  "headline": string,
  "phases": [ { "name": string, "yourHours": number, "benchmarkLow": number, "benchmarkHigh": number, "status": "light"|"heavy"|"on-target", "note": string } ],
  "reworkGap": { "yourAssumption": string, "benchmarkTypical": string, "note": string },
  "recommended": { "hours": number, "cost": number, "blendedRate": number },
  "rationale": string,
  "confidence": "low"|"medium"|"high"
}
All hour and cost values must be numbers (no "$", no commas, no units). Include every phase the user provided, in order.`;

function buildUserPrompt(req: AnalyzeRequest): string {
  const phaseLines = req.phases
    .map((p, i) => `  ${i + 1}. ${p.name}: ${p.hours} hrs`)
    .join("\n");
  const total = req.phases.reduce((s, p) => s + (Number(p.hours) || 0), 0);
  return `Trade: ${req.trade}
Region: ${req.region}
Blended labor rate: $${req.blendedRate}/hr

Scope description:
${req.scope}

Estimator's labor estimate by phase:
${phaseLines}
  TOTAL: ${total} hrs

Analyze this estimate and return ONLY the JSON object.`;
}

/** Pull the first balanced JSON object out of arbitrary model text. */
function extractJson(text: string): string | null {
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

function coerceStatus(v: unknown): "light" | "heavy" | "on-target" {
  return v === "light" || v === "heavy" || v === "on-target" ? v : "on-target";
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Validate + normalize the model's parsed JSON into a clean AnalyzeResult. */
function normalize(raw: any, req: AnalyzeRequest): AnalyzeResult {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.phases)) {
    throw new Error("missing required fields");
  }
  const rate = num(req.blendedRate, 78);
  const phases = raw.phases.map((p: any) => ({
    name: String(p?.name ?? "Phase"),
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

function isValidRequest(body: any): body is AnalyzeRequest {
  return (
    body &&
    typeof body === "object" &&
    Array.isArray(body.phases) &&
    typeof body.trade === "string"
  );
}

export async function POST(req: NextRequest) {
  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Normalize incoming numbers defensively.
  const request: AnalyzeRequest = {
    trade: body.trade,
    region: body.region || "Mountain West",
    scope: body.scope || "",
    blendedRate: num(body.blendedRate, 78),
    phases: (body.phases || [])
      .filter((p) => p && p.name)
      .map((p) => ({ name: String(p.name), hours: num(p.hours) })),
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // No key → deterministic fallback. The demo always works.
  if (!apiKey) {
    return NextResponse.json(computeFallback(request));
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(request) }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const jsonStr = extractJson(text);
    if (!jsonStr) throw new Error("no JSON found in model output");

    const parsed = JSON.parse(jsonStr);
    const result = normalize(parsed, request);
    return NextResponse.json(result);
  } catch (err) {
    // Any failure (auth, rate limit, parse, validation) → graceful fallback.
    console.error("[analyze] model path failed, using fallback:", err);
    return NextResponse.json(computeFallback(request));
  }
}
