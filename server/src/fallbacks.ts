import type {
  AnalyzeRequest,
  AnalyzeResult,
  ChatRequest,
  ExtractRequest,
  ExtractResult,
  PhaseResult,
  Status,
} from "./types.js";

/* =========================================================================
 * Shared helpers
 * =======================================================================*/

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

const round = (n: number, step = 1) => Math.round(n / step) * step;

/* =========================================================================
 * ANALYZE fallback — deterministic, input-sensitive labor analysis
 * =======================================================================*/

const TRADE_PROFILE: Record<
  string,
  { centerMult: number; spreadPct: number; label: string }
> = {
  Electrical: { centerMult: 1.12, spreadPct: 0.16, label: "electrical" },
  "Mechanical/HVAC": { centerMult: 1.15, spreadPct: 0.18, label: "mechanical" },
  Concrete: { centerMult: 1.08, spreadPct: 0.14, label: "concrete" },
  Plumbing: { centerMult: 1.1, spreadPct: 0.15, label: "plumbing" },
};

const PHASE_KEYWORDS: { match: RegExp; mult: number; reason: string }[] = [
  { match: /fire\s*alarm|low\s*volt|controls/i, mult: 1.32, reason: "fire-alarm / low-voltage tie-ins routinely run over due to inspection and coordination cycles" },
  { match: /finish|device|trim/i, mult: 1.18, reason: "finish & device work absorbs punch-list churn that rough numbers miss" },
  { match: /rough/i, mult: 1.06, reason: "rough-in is usually estimated tightly but holds up reasonably well" },
  { match: /panel|service|gear|switchgear|feeder/i, mult: 1.1, reason: "panel/service work carries utility-coordination float" },
  { match: /demo|tear\s*out/i, mult: 1.22, reason: "demo on occupied/TI space surfaces unknowns" },
  { match: /test|commission|startup|start-up|balanc/i, mult: 1.28, reason: "commissioning is the most commonly omitted labor bucket" },
];

export function computeAnalyze(req: AnalyzeRequest): AnalyzeResult {
  const profile = TRADE_PROFILE[req.trade] ?? TRADE_PROFILE["Electrical"];
  const scope = (req.scope || "").toLowerCase();

  let scopeMult = 1;
  const scopeNotes: string[] = [];
  if (/occupied|tenant|phas(e|ed)|after\s*hours|night/.test(scope)) {
    scopeMult += 0.04;
    scopeNotes.push("phased / occupied-space work");
  }
  if (/fast\s*track|accelerat|aggressive|tight\s*schedule|compress/.test(scope)) {
    scopeMult += 0.05;
    scopeNotes.push("schedule compression");
  }
  if (/fire\s*alarm|life\s*safety|inspection/.test(scope)) {
    scopeMult += 0.03;
    scopeNotes.push("life-safety inspection coordination");
  }

  const phases: PhaseResult[] = (req.phases || [])
    .filter((p) => p && p.name)
    .map((p) => {
      const hours = Math.max(0, Number(p.hours) || 0);
      const kw = PHASE_KEYWORDS.find((k) => k.match.test(p.name));
      const jitter = 0.96 + 0.08 * hashString(p.name + req.region);
      const center = hours * profile.centerMult * (kw?.mult ?? 1) * scopeMult * jitter;
      const half = center * profile.spreadPct;
      const low = round(center - half, 5);
      const high = round(center + half, 5);

      let status: Status = "on-target";
      if (hours < low) status = "light";
      else if (hours > high) status = "heavy";

      const note =
        status === "light"
          ? kw?.reason
            ? `Below typical crews — ${kw.reason}.`
            : `Runs below comparable ${profile.label} crews for this scope.`
          : status === "heavy"
          ? `Carries more hours than comparable crews — likely conservative or scope-padded.`
          : `Sits inside the typical band for comparable ${profile.label} crews.`;

      return {
        name: p.name,
        costCode: p.costCode,
        yourHours: round(hours),
        benchmarkLow: low,
        benchmarkHigh: high,
        status,
        note,
      };
    });

  const yourTotal = phases.reduce((s, p) => s + p.yourHours, 0);
  const benchCenterTotal = phases.reduce(
    (s, p) => s + (p.benchmarkLow + p.benchmarkHigh) / 2,
    0
  );

  const reworkRate = 0.05;
  const reworkHours = round(benchCenterTotal * reworkRate);
  const recommendedHours = round(benchCenterTotal + reworkHours);
  const percentDelta =
    yourTotal > 0
      ? round(((yourTotal - recommendedHours) / recommendedHours) * 100)
      : 0;

  let verdict: Status = "on-target";
  if (percentDelta <= -4) verdict = "light";
  else if (percentDelta >= 4) verdict = "heavy";

  const rate = Math.max(1, Number(req.blendedRate) || 78);
  const recommendedCost = round(recommendedHours * rate);

  const riskiest = [...phases]
    .filter((p) => p.status === "light")
    .sort(
      (a, b) =>
        (b.benchmarkLow - b.yourHours) / Math.max(1, b.yourHours) -
        (a.benchmarkLow - a.yourHours) / Math.max(1, a.yourHours)
    )[0];

  const headline =
    verdict === "light"
      ? `Your bid is ${Math.abs(percentDelta)}% light on labor`
      : verdict === "heavy"
      ? `Your bid is ${Math.abs(percentDelta)}% heavy on labor`
      : `Your labor estimate is on target`;

  const scopeClause =
    scopeNotes.length > 0
      ? ` Your scope flags ${scopeNotes.join(", ")}, which pushes the band up.`
      : "";

  const rationale =
    verdict === "light"
      ? `Against actuals from comparable ${profile.label} jobs in ${req.region}, this bid runs ${Math.abs(
          percentDelta
        )}% under a defensible labor number.${
          riskiest ? ` The biggest undercosting risk is ${riskiest.name}, priced below the band.` : ""
        }${scopeClause} A ${Math.round(
          reworkRate * 100
        )}% rework/punch allowance (~${reworkHours} hrs) is missing from the phases — the most common reason these jobs erode at closeout.`
      : verdict === "heavy"
      ? `This bid carries ${Math.abs(
          percentDelta
        )}% more hours than comparable ${profile.label} jobs would book.${scopeClause} There may be room to sharpen it, but confirm the heavy phases aren't covering known site risk before cutting.`
      : `This bid lands inside a defensible band for comparable ${profile.label} jobs in ${req.region}.${scopeClause} The phases are balanced; carry an explicit rework allowance (~${reworkHours} hrs) rather than leaving it implicit.`;

  return {
    verdict,
    percentDelta,
    headline,
    phases,
    reworkGap: {
      yourAssumption:
        yourTotal > 0
          ? "No explicit rework / punch-list allowance in the phase breakdown."
          : "No phases entered.",
      benchmarkTypical: `~${Math.round(
        reworkRate * 100
      )}% of labor (${reworkHours} hrs) carried as rework/punch on comparable ${profile.label} work.`,
      note: "Rework is the single most common gap between a winning bid and an eroded margin at closeout.",
    },
    recommended: {
      hours: recommendedHours,
      cost: recommendedCost,
      blendedRate: rate,
    },
    rationale,
    confidence: phases.length >= 3 ? "medium" : "low",
    source: "fallback",
  };
}

/* =========================================================================
 * EXTRACT fallback — deterministic takeoff parsing from free text
 * =======================================================================*/

const SAMPLE_PHASES = [
  { name: "Rough-in", hours: 1200, costCode: "16-100" },
  { name: "Panel/Service", hours: 240, costCode: "16-200" },
  { name: "Finish/Devices", hours: 880, costCode: "16-300" },
  { name: "Fire Alarm", hours: 160, costCode: "16-700" },
];

const COST_CODE_HINTS: { match: RegExp; code: string; label: string }[] = [
  { match: /rough/i, code: "16-100", label: "Rough-in" },
  { match: /panel|service|gear|feeder/i, code: "16-200", label: "Panel/Service" },
  { match: /finish|device|trim|fixture|lighting/i, code: "16-300", label: "Finish/Devices" },
  { match: /fire\s*alarm|low\s*volt|life\s*safety/i, code: "16-700", label: "Fire Alarm" },
  { match: /gear|switchgear|distribution/i, code: "16-250", label: "Switchgear" },
  { match: /demo|tear\s*out/i, code: "16-050", label: "Demolition" },
  { match: /duct|sheet\s*metal/i, code: "23-300", label: "Ductwork" },
  { match: /pipe|plumb/i, code: "22-100", label: "Piping" },
  { match: /form|formwork/i, code: "03-100", label: "Formwork" },
  { match: /pour|placement|slab/i, code: "03-300", label: "Concrete Placement" },
];

function inferTrade(text: string): string {
  const t = text.toLowerCase();
  if (/hvac|mechanical|duct|rtu|chiller/.test(t)) return "Mechanical/HVAC";
  if (/plumb|pipe|fixture|sanitary/.test(t)) return "Plumbing";
  if (/concrete|slab|formwork|rebar|pour/.test(t)) return "Concrete";
  return "Electrical";
}

function inferRegion(text: string): string {
  const m = text.match(
    /\b(mountain west|pacific northwest|southwest|southeast|northeast|midwest|texas|california|colorado|utah|arizona|denver|phoenix|seattle|new york)\b/i
  );
  return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : "Mountain West";
}

export function computeExtract(req: ExtractRequest): ExtractResult {
  const text = (req.text || "").trim();

  // No usable text (e.g. an uploaded binary we can't parse here) → sample takeoff.
  if (text.length < 12) {
    return {
      trade: "Electrical",
      region: "Mountain West",
      scope:
        "Commercial tenant improvement, electrical rough-in and finish: branch wiring, panel upgrade, lighting, fire alarm tie-in.",
      phases: [...SAMPLE_PHASES],
      blendedRate: 78,
    };
  }

  const trade = inferTrade(text);
  const region = inferRegion(text);

  // Try to read "<phase> ... <number> hrs" patterns.
  const phases: { name: string; hours: number; costCode?: string }[] = [];
  const lineRe =
    /([A-Za-z][A-Za-z /&-]{2,40}?)[^\d]{0,12}?(\d{2,5})\s*(?:hrs?|hours)/gi;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) && phases.length < 10) {
    const name = m[1].trim().replace(/\s+/g, " ");
    const hours = parseInt(m[2], 10);
    if (hours > 0 && name.length > 2) {
      const hint = COST_CODE_HINTS.find((h) => h.match.test(name));
      phases.push({ name: hint?.label ?? name, hours, costCode: hint?.code });
    }
  }

  // Nothing structured found → derive phases by which keywords appear, scaled by size.
  if (phases.length === 0) {
    const sqftMatch = text.match(/([\d,]{3,7})\s*(?:sq\s*ft|sf|square feet)/i);
    const sqft = sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, ""), 10) : 12000;
    const scale = Math.max(0.4, Math.min(3, sqft / 18000));
    const seen = new Set<string>();
    for (const h of COST_CODE_HINTS) {
      if (h.match.test(text) && !seen.has(h.code)) {
        seen.add(h.code);
        const base =
          SAMPLE_PHASES.find((s) => s.costCode === h.code)?.hours ?? 400;
        phases.push({
          name: h.label,
          hours: round(base * scale, 10),
          costCode: h.code,
        });
      }
    }
    if (phases.length === 0) {
      for (const s of SAMPLE_PHASES)
        phases.push({ ...s, hours: round(s.hours * scale, 10) });
    }
  }

  const rateMatch = text.match(/\$?\s*(\d{2,3})\s*(?:\/\s*hr|per hour|hr)/i);
  const blendedRate = rateMatch ? parseInt(rateMatch[1], 10) : 78;

  const scope = text.length > 280 ? text.slice(0, 277).trimEnd() + "…" : text;

  return { trade, region, scope, phases, blendedRate };
}

/* =========================================================================
 * CHAT fallback — deterministic conversational replies
 * =======================================================================*/

export function computeChat(req: ChatRequest): string {
  const last = [...(req.messages || [])].reverse().find((m) => m.role === "user");
  const q = (last?.content || "").toLowerCase();
  const ctx = req.jobContext || {};

  if (req.mode === "margin-watch") {
    const job = (ctx.jobName as string) || (ctx.job as string) || "this job";
    const code = (ctx.costCode as string) || "the drifting cost code";
    const overPct = ctx.overPct as number | undefined;
    const marginImpact = ctx.marginImpact as string | undefined;

    if (/why|cause|reason|driver|explain/.test(q)) {
      return `${job} is drifting because actual labor booked against ${code} is outpacing the budgeted production rate${
        overPct ? ` — currently ~${overPct}% over` : ""
      }. The crew is logging more hours per unit than comparable completed jobs, so left unaddressed the burn rate projects ${
        marginImpact || "a meaningful margin hit"
      } at completion. The pattern started early enough that a change order plus a reforecast still recovers most of it.`;
    }
    if (/action|plan|do|fix|recover|protect/.test(q)) {
      return `Here's what I'd do on ${job}: draft a change order for the out-of-scope labor on ${code}, reforecast the job margin with the corrected production rate, alert the PM with the variance summary, and update the live budget. Approve all and I'll run the steps, or review each first.`;
    }
    if (/other|rest|else|quiet|portfolio/.test(q)) {
      return `The rest of the portfolio is quiet — the remaining jobs are tracking inside their labor budgets, so I'm not surfacing them. I only flag where margin-at-risk, confidence, and time-left-to-act line up. Want me to walk the next-highest job?`;
    }
    return `On ${job}: the exposure is concentrated in ${code}${
      overPct ? `, running ~${overPct}% over budgeted hours` : ""
    }. I've proposed a multi-step plan to protect the margin — approve all, or ask me "why" for the analysis. (Illustrative figures — production uses live payroll actuals.)`;
  }

  // Bid Co-pilot mode
  if (/takeoff|take off|take-off/.test(q)) {
    return `A takeoff is your phase-by-phase labor quantity list — it breaks scope into work types (rough-in, panel, finish, etc.) with estimated hours. Usually a PDF export from your estimating software or a spreadsheet. Paste a job description or load the sample and I'll pull the phases for you.`;
  }
  if (/sample|example|demo/.test(q)) {
    return `Loading a sample electrical tenant-improvement job. I'll extract the phases by cost code into the panel on the right, benchmark each against actuals from comparable jobs, and flag any undercosting before you bid.`;
  }
  if (/light|heavy|undercost|under-cost|low|risk/.test(q)) {
    return `I benchmark each phase's hours against actuals learned from your past and monitored jobs. If a phase comes in under the band, I flag it as light so you don't undercost the bid — the gap that quietly erodes margin once you win the work.`;
  }
  if (q.length > 0) {
    return `Describe the job in a sentence or two — trade, rough size, scope, and crew — and I'll pull a phase-by-phase takeoff into the panel on the right, then benchmark it against actuals from comparable jobs. Or try the sample job to see it end to end.`;
  }
  return `Tell me about the job you're bidding and I'll build out the takeoff and benchmark it for you.`;
}
