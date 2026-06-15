import type {
  AnalyzeRequest,
  AnalyzeResult,
  PhaseResult,
  Status,
} from "./types";

/**
 * Deterministic local analysis used when no ANTHROPIC_API_KEY is present or the
 * model call/parse fails. It is intentionally "smart enough" to look credible on
 * a screen-share: it varies with the actual inputs (trade, phase names, hours,
 * rate, and scope keywords) so different estimates produce different results.
 *
 * These are ILLUSTRATIVE multipliers, not real payroll data.
 */

// Per-trade baseline view on how tight typical estimates run. The center of the
// benchmark band sits at (your hours * centerMult); the band half-width is
// spreadPct of that center.
const TRADE_PROFILE: Record<
  string,
  { centerMult: number; spreadPct: number; label: string }
> = {
  Electrical: { centerMult: 1.12, spreadPct: 0.16, label: "electrical" },
  "Mechanical/HVAC": { centerMult: 1.15, spreadPct: 0.18, label: "mechanical" },
  Concrete: { centerMult: 1.08, spreadPct: 0.14, label: "concrete" },
  Plumbing: { centerMult: 1.1, spreadPct: 0.15, label: "plumbing" },
};

// Phase-name keywords that tend to be systematically under- or over-estimated.
const PHASE_KEYWORDS: { match: RegExp; mult: number; reason: string }[] = [
  { match: /fire\s*alarm|low\s*volt|controls/i, mult: 1.32, reason: "fire-alarm / low-voltage tie-ins routinely run over due to inspection and coordination cycles" },
  { match: /finish|device|trim/i, mult: 1.18, reason: "finish & device work absorbs punch-list churn that rough numbers miss" },
  { match: /rough/i, mult: 1.06, reason: "rough-in is usually estimated tightly but holds up reasonably well" },
  { match: /panel|service|gear|switchgear/i, mult: 1.1, reason: "panel/service work carries utility-coordination float" },
  { match: /demo|tear\s*out/i, mult: 1.22, reason: "demo on occupied/TI space surfaces unknowns" },
  { match: /test|commission|startup|start-up/i, mult: 1.28, reason: "commissioning is the most commonly omitted labor bucket" },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}

function round(n: number, step = 1): number {
  return Math.round(n / step) * step;
}

export function computeFallback(req: AnalyzeRequest): AnalyzeResult {
  const profile =
    TRADE_PROFILE[req.trade] ?? TRADE_PROFILE["Electrical"];
  const scope = (req.scope || "").toLowerCase();

  // Scope-driven nudges so the same numbers under a heavier scope read heavier.
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

  const phases: PhaseResult[] = req.phases
    .filter((p) => p && p.name)
    .map((p) => {
      const hours = Math.max(0, Number(p.hours) || 0);
      const kw = PHASE_KEYWORDS.find((k) => k.match.test(p.name));
      const jitter = 0.96 + 0.08 * hashString(p.name + req.region); // 0.96..1.04
      const center =
        hours * profile.centerMult * (kw?.mult ?? 1) * scopeMult * jitter;
      const half = center * profile.spreadPct;
      const low = round(center - half, 5);
      const high = round(center + half, 5);

      let status: Status = "on-target";
      if (hours < low) status = "light";
      else if (hours > high) status = "heavy";

      let note: string;
      if (status === "light") {
        note =
          kw?.reason
            ? `Below typical crews — ${kw.reason}.`
            : `Runs below comparable ${profile.label} crews for this scope.`;
      } else if (status === "heavy") {
        note = `Carries more hours than comparable crews — likely conservative or scope-padded.`;
      } else {
        note = `Sits inside the typical band for comparable ${profile.label} crews.`;
      }

      return {
        name: p.name,
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

  // Add a realistic rework allowance the raw estimate usually omits.
  const reworkRate = 0.05; // 5% of labor as rework/punch allowance
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
      ? `Your labor estimate is ${Math.abs(percentDelta)}% light`
      : verdict === "heavy"
      ? `Your labor estimate is ${Math.abs(percentDelta)}% heavy`
      : `Your labor estimate is on target`;

  const scopeClause =
    scopeNotes.length > 0 ? ` Your scope flags ${scopeNotes.join(", ")}, which pushes the band up.` : "";

  const rationale =
    verdict === "light"
      ? `Against comparable ${profile.label} crews in ${req.region}, the estimate runs ${Math.abs(
          percentDelta
        )}% under a defensible labor number.${
          riskiest ? ` The biggest exposure is ${riskiest.name}, which is priced below the typical band.` : ""
        }${scopeClause} A ${Math.round(
          reworkRate * 100
        )}% rework/punch allowance (~${reworkHours} hrs) is missing from the raw phases and is the most common reason these bids erode at closeout.`
      : verdict === "heavy"
      ? `The estimate carries ${Math.abs(
          percentDelta
        )}% more hours than comparable ${profile.label} crews would book for this scope.${scopeClause} There may be room to sharpen the bid, but confirm the heavy phases aren't covering known site risk before cutting.`
      : `The estimate lands inside a defensible band for comparable ${profile.label} crews in ${req.region}.${scopeClause} The phases are balanced; the main watch-item is carrying an explicit rework allowance (~${reworkHours} hrs) rather than leaving it implicit.`;

  return {
    verdict,
    percentDelta,
    headline,
    phases,
    reworkGap: {
      yourAssumption:
        yourTotal > 0
          ? "No explicit rework / punch-list allowance line in the phase breakdown."
          : "No phases entered.",
      benchmarkTypical: `~${Math.round(
        reworkRate * 100
      )}% of labor (${reworkHours} hrs) carried as rework/punch on comparable ${profile.label} TI work.`,
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
