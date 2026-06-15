import type {
  ActionStep,
  CostCodeLine,
  CostCodeProjection,
  FlagKind,
  Job,
  JobFlag,
  JobStatus,
  Learning,
  ScoreParts,
} from "./types";

/* ============================================================ tuning knobs */

const NOISE_FLOOR = 0.07; // overrun under 7% is noise, not drift
const SURFACE_MIN_AT_RISK = 18000; // $ — below this we monitor, don't surface
const SURFACE_MIN_SCORE = 10; // scaled score (marginAtRisk×conf×remaining / 1000)

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const round = (n: number, step = 1) => Math.round(n / step) * step;

/* Diagnosed driver → recovery playbook. `recoverability` is a qualitative read
 * of how much of the overrun can realistically be clawed back given the cause
 * (out-of-scope labor is billable; quality rework is mostly sunk). It is a
 * judgment label, not a computed percentage. */
const KIND: Record<
  FlagKind,
  {
    label: string;
    recoverability: "high" | "medium" | "low";
    firstStep: string;
    firstArtifact: (n: string) => string;
  }
> = {
  "added-scope": {
    label: "Out-of-scope labor",
    recoverability: "high",
    firstStep: "Draft change order",
    firstArtifact: (n) => `Change order drafted for Job ${n}`,
  },
  "under-recovery": {
    label: "Billable labor not captured",
    recoverability: "high",
    firstStep: "Draft billing tickets",
    firstArtifact: (n) => `T&M tickets queued for Job ${n}`,
  },
  underbid: {
    label: "Estimate ran light",
    recoverability: "medium",
    firstStep: "Issue T&M / scope letter",
    firstArtifact: (n) => `Scope letter drafted for Job ${n}`,
  },
  rework: {
    label: "Quality rework (mostly sunk)",
    recoverability: "low",
    firstStep: "Carry rework allowance",
    firstArtifact: (n) => `Rework allowance set on Job ${n}`,
  },
};

/* ============================================================ projections */

export function projectLine(
  line: CostCodeLine,
  rate: number
): CostCodeProjection {
  const pct = clamp(line.pctComplete, 0.01, 1);
  const burnProjected = line.actualHours / pct;
  const committedProjected = line.actualHours + line.committedHours;
  const projectedHours = Math.round(Math.max(burnProjected, committedProjected));
  const overrunHours = projectedHours - line.budgetHours;
  const overrunPct = overrunHours / Math.max(1, line.budgetHours);
  const marginAtRisk = Math.max(0, overrunHours) * rate;
  const recoverable = marginAtRisk * (1 - pct);
  return {
    ...line,
    rate,
    projectedHours,
    overrunHours,
    overrunPct,
    marginAtRisk,
    recoverable,
    drifting: overrunPct > NOISE_FLOOR,
  };
}

/* ============================================================ scoring */

function confidenceFrom(pctComplete: number): {
  confidence: number;
  confidenceLabel: ScoreParts["confidenceLabel"];
} {
  // More of the job booked → more trustworthy the burn-rate projection.
  const confidence = clamp(0.55 + (pctComplete - 0.1) * 0.72, 0.4, 0.96);
  const confidenceLabel =
    confidence >= 0.85 ? "high" : confidence >= 0.65 ? "medium" : "low";
  return { confidence, confidenceLabel };
}

function scoreJob(
  marginAtRisk: number,
  pctComplete: number,
  weeksTotal: number
): ScoreParts {
  const { confidence, confidenceLabel } = confidenceFrom(pctComplete);
  const pctJobRemaining = clamp(1 - pctComplete, 0, 1);
  const weeksLeftToAct = Math.max(1, Math.round(pctJobRemaining * weeksTotal));
  // marginAtRisk × confidence × time-left-to-act, scaled for readability.
  const score = Math.round((marginAtRisk * confidence * pctJobRemaining) / 1000);
  return {
    marginAtRisk,
    confidence,
    confidenceLabel,
    pctJobRemaining,
    weeksLeftToAct,
    score,
  };
}

/* ============================================================ action plan */

function buildPlan(
  kind: FlagKind,
  job: { number: string; trade: string; region: string },
  driver: CostCodeProjection
): ActionStep[] {
  const code = driver.code;
  const name = driver.name;
  const overPct = Math.round(driver.overrunPct * 100);
  // The financial action targets the driver cost code's projected overrun — a
  // real figure (overrun hours × blended rate), not an invented "recovered" cut.
  const driverDollars = round(Math.max(0, driver.overrunHours) * driver.rate, 100);
  // "Partly billable" splits the overage: bill the change-tied slice (~60% here,
  // a typical owner-directed vs. our-own-pace split), absorb the rest.
  const partialDollars = round(driverDollars * 0.6, 100);
  const kfmt = (n: number) => `$${Math.round(n / 1000)}K`;

  // Each plan is agent-deterministic on the data, human-gated on judgment: the
  // agent does the legwork, then surfaces the 1–2 calls only the PM can make.

  if (kind === "added-scope") {
    return [
      {
        id: "verify",
        label: "Verify the signal",
        detail: `Confirmed the ${code} overage is real before acting: no labor mis-coded in from finish/devices, and field %-complete on ${name} matches the pay app. The drift is genuine, not a coding artifact.`,
        targetsDollars: 0,
        artifact: "Signal verified — clean labor coding",
        systems: [
          { name: "Miter Payroll", mode: "read", note: "labor by cost code" },
          { name: "Miter Field Ops", mode: "read", note: "units installed" },
        ],
      },
      {
        id: "d-basis",
        label: "Confirm basis & entitlement",
        detail: `Plotted ${code} labor by day — production broke from the as-bid rate ~Wk 6, lining up with ASI-014 (added receptacles, L3) and RFI-022. We're inside the contract's change-notice window, so entitlement still holds if you act now.`,
        targetsDollars: 0,
        artifact: "",
        decision: {
          question: "Is the overage owner-directed added scope, or our own labor overrun?",
          options: [
            "Owner-directed — billable",
            "Partly billable",
            "Our overrun — we absorb it",
          ],
          recommended: 0,
          // "Our overrun — we absorb it" → not billable (same scope, just more
          // hours than budgeted): drop the change order and the GC hand-off; the
          // plan collapses to brief + reforecast + fix-the-estimate.
          skips: { 2: ["action", "d-submit"] },
          // "Partly billable" → keep the COR + hand-off, but bill only the
          // change-tied slice; the balance is absorbed in the reforecast.
          adjust: { 1: [{ stepId: "action", targetsDollars: partialDollars }] },
        },
        systems: [{ name: "Procore", mode: "read", note: "ASI-014 / RFI-022 · notice window" }],
      },
      {
        id: "action",
        label: `Draft change order · ${code}`,
        detail: `Bill only the change-tied hours × the billable rate — not the full ${overPct}%. COR assembled with the labor backup and the ASI-014 narrative.`,
        targetsDollars: driverDollars,
        artifact: "COR-008 drafted in Procore",
        systems: [{ name: "Procore", mode: "write", note: "drafts COR-008" }],
      },
      {
        id: "d-submit",
        label: "Hand off to the GC",
        detail: "COR-008 and a cover note are assembled. I can't send it from the platform — it's yours to submit.",
        targetsDollars: 0,
        artifact: "",
        decision: {
          question: `Give you the COR-008 draft to send now, or hold for your review?`,
          options: ["Give me the draft", "Hold for my review"],
          recommended: 0,
        },
        systems: [{ name: "Email", mode: "write", note: "draft to the GC — you send" }],
        draft: {
          kind: "email",
          to: "GC project manager",
          subject: `COR-008 — Job ${job.number} ${name} added scope (ASI-014)`,
          body: `Hi [GC PM],

Attached is COR-008 covering the added ${name.toLowerCase()} directed under ASI-014 (added receptacles, L3) and RFI-022.

The change is limited to the change-tied labor, billed at the contract rate; the priced labor delta and backup are in the attached COR, along with the ASI-014 narrative for your review.

Let me know if you need anything else to process it.

Thanks,
[Your name] · Job ${job.number}`,
        },
      },
      {
        id: "brief",
        label: "Brief the PM + field",
        detail: "Drafted the internal variance brief: where the margin stands, and a go-forward instruction so the field stops absorbing directed changes. I can't send it for you — it's ready to share.",
        targetsDollars: 0,
        artifact: "Variance brief ready for your PM / field",
        systems: [{ name: "Email", mode: "write", note: "internal — you send" }],
        draft: {
          kind: "email",
          internal: true,
          to: "Project manager · Field superintendent",
          subject: `Job ${job.number} — ${name} (${code}) variance + go-forward`,
          body: `Team,

Quick heads-up on Job ${job.number}. ${name} (${code}) is tracking ~${overPct}% over the as-bid rate — the overage traces to ASI-014 / RFI-022, so we're pursuing the change-tied portion on a COR.

Two asks going forward:
1. Any further ASI-directed work on ${code} goes on a T&M ticket the same day — we don't absorb directed changes.
2. Confirm the crew on the remaining rough-in is sized to the now-larger scope so we hold the as-bid production rate from here.

I'll keep the EAC updated as the COR moves.

Thanks,
[Your name]`,
        },
      },
      {
        id: "reforecast",
        label: "Reforecast + update budget",
        detail: "Rebaselined the EAC with the COR pending (approval-risk haircut), flagged the cash-flow lag, and updated the live budget.",
        targetsDollars: 0,
        artifact: "Budget updated · status follow-up set",
        systems: [
          { name: "ERP budget", mode: "write", note: "EAC + live budget" },
        ],
      },
      {
        id: "learn",
        label: "Write back to benchmark",
        detail: `Fed the true ${name} production rate into the estimating benchmark.`,
        targetsDollars: 0,
        artifact: `${name} benchmark tightened`,
        feedsBenchmark: true,
        systems: [{ name: "Estimating benchmark", mode: "write" }],
      },
    ];
  }

  if (kind === "under-recovery") {
    return [
      {
        id: "reconcile",
        label: "Reconcile billed vs logged",
        detail: `First confirmed the ${code} hours are coded right (not picking up another scope), then matched logged ${name} hours (Miter) against T&M tickets (Procore). Found ${kfmt(driverDollars)} of billable labor not yet ticketed; pulled the daily logs as backup.`,
        targetsDollars: 0,
        artifact: `${kfmt(driverDollars)} unbilled labor isolated`,
        systems: [
          { name: "Miter Payroll", mode: "read", note: "logged hours" },
          { name: "Procore", mode: "read", note: "T&M tickets + daily logs" },
        ],
      },
      {
        id: "d-basis",
        label: "Confirm the billable basis",
        detail: `${name} is on T&M under CO-003.`,
        targetsDollars: 0,
        artifact: "",
        decision: {
          question: `Is the ${kfmt(driverDollars)} all billable under CO-003?`,
          options: ["Yes — all", "Partial", "No"],
          recommended: 0,
        },
        systems: [{ name: "Procore", mode: "read", note: "CO-003 terms" }],
      },
      {
        id: "d-aging",
        label: "Late-ticket risk",
        detail: "Some tickets are >30 days old; the contract requires T&M sign-off within 30.",
        targetsDollars: 0,
        artifact: "",
        decision: {
          question: "How do you want the at-risk tickets played?",
          options: ["Draft anyway + cover note to GC", "Drop the at-risk ones"],
          recommended: 0,
        },
        systems: [{ name: "Procore", mode: "read", note: "ticket dates" }],
      },
      {
        id: "action",
        label: `Draft T&M tickets · ${code}`,
        detail: "Drafted the tickets with daily-log backup and a cover note for GC sign-off. I can't submit them for you — they're ready to send.",
        targetsDollars: driverDollars,
        artifact: `T&M tickets drafted for Job ${job.number}`,
        systems: [
          { name: "Procore", mode: "write", note: "drafts T&M tickets" },
          { name: "Email", mode: "write", note: "cover note to GC — you send" },
        ],
        draft: {
          kind: "email",
          to: "GC project manager",
          subject: `T&M tickets — Job ${job.number} ${name} (CO-003)`,
          body: `Hi [GC PM],

Submitting T&M tickets for billable ${name.toLowerCase()} performed under CO-003 that hadn't been captured yet — $${driverDollars.toLocaleString()} total, with daily-log backup attached.

A few tickets are past the 30-day window; per the sign-off provision I've included a cover note on those. Happy to walk through any of them.

Thanks,
[Your name] · Job ${job.number}`,
        },
      },
      {
        id: "budget",
        label: "Update budget + direct the field",
        detail: "Updated the live budget, then drafted a short directive so daily T&M capture sticks and this stops recurring. I can't send it for you — it's ready to share with the field.",
        targetsDollars: 0,
        artifact: "Budget updated · field directive ready",
        feedsBenchmark: true,
        systems: [
          { name: "ERP budget", mode: "write", note: "live budget" },
          { name: "Email", mode: "write", note: "internal — you send" },
        ],
        draft: {
          kind: "email",
          internal: true,
          to: "Field superintendent · Foreman",
          subject: `Job ${job.number} — daily T&M capture on ${code} ${name}`,
          body: `Team,

We just recovered ${kfmt(driverDollars)} of billable ${name.toLowerCase()} labor on Job ${job.number} that hadn't made it onto T&M tickets — work we'd already paid for and could easily have eaten.

Going forward on any T&M-eligible scope: log the ticket the same day the hours are worked, with the daily-log backup attached. Don't let them age — the contract requires sign-off inside 30 days or we lose the right to bill them.

Appreciate it — this is straight margin.

[Your name]`,
        },
      },
    ];
  }

  if (kind === "underbid") {
    return [
      {
        id: "verify",
        label: "Verify the signal",
        detail: `Confirmed the ${code} overage is real: hours are coded to ${name}, not bleeding in from an adjacent code, and the field %-complete matches. The fab rate is genuinely running over the bid.`,
        targetsDollars: 0,
        artifact: "Signal verified — clean coding",
        systems: [
          { name: "Miter Payroll", mode: "read", note: "actual fab rate" },
          { name: "Miter Field Ops", mode: "read", note: "units installed" },
        ],
      },
      {
        id: "check",
        label: "Isolate the basis",
        detail: `Checked Procore for change events on ${code} ${name} — none. Also looked for GC-caused inefficiency (out-of-sequence, trade stacking, directed OT). On the data it reads as a bid gap, not added scope — but that's a judgment call.`,
        targetsDollars: 0,
        artifact: "As-bid vs actual fab rate quantified → EAC",
        systems: [
          { name: "Procore", mode: "read", note: "change events · schedule" },
          { name: "Miter Payroll", mode: "read", note: "actual fab rate" },
        ],
      },
      {
        id: "d-diag",
        label: "Confirm the diagnosis",
        detail: `My read: bid gap, no entitlement. But if you've seen GC-driven inefficiency or differing conditions in the field, there may be a claim here — that changes the play.`,
        targetsDollars: 0,
        artifact: "",
        decision: {
          question: "How do you read it?",
          options: ["Underbid — we eat it", "Actually added scope / GC inefficiency", "Field / rework issue"],
          recommended: 0,
          // Only the middle read carries entitlement → keep the GC letter. The
          // other two skip it (we eat it / handle as a field problem).
          skips: { 0: ["pursue"], 2: ["pursue"] },
        },
        systems: [{ name: "Procore", mode: "read" }],
      },
      {
        id: "pursue",
        label: "Pursue recovery · scope/inefficiency letter",
        detail: "Drafted a scope-clarification / inefficiency letter to the GC to establish entitlement before we eat it. I can't send it from the platform — it's yours to submit.",
        targetsDollars: 0,
        artifact: "Entitlement letter drafted for the GC",
        systems: [{ name: "Email", mode: "write", note: "draft to the GC — you send" }],
        draft: {
          kind: "email",
          to: "GC project manager",
          subject: `Job ${job.number} — ${name} (${code}) production impact / request for direction`,
          body: `Hi [GC PM],

Our labor on ${name.toLowerCase()} (${code}) is running materially over our planned production rate. Before we absorb it, we want to flag conditions on site that have affected productivity — sequencing of preceding trades and access to the work areas — and confirm our understanding of the intended scope.

We're documenting the impacted hours (~$${driverDollars.toLocaleString()} to date) with daily-log backup. Please advise on direction so we can resolve this collaboratively; we'd like to discuss whether a portion is recoverable under the contract's changes/impact provisions.

Happy to walk the area together this week.

Thanks,
[Your name] · Job ${job.number}`,
        },
      },
      {
        id: "protect",
        label: "Reforecast + bend the curve",
        detail: `Reforecast at the true fab rate, then drafted a field directive to claw back what we can on the remaining ${name.toLowerCase()}: prefab/spool more offsite and re-sequence so the back half produces better than the front. I can't send it — it's ready for the field.`,
        targetsDollars: 0,
        artifact: "EAC updated · re-sequence directive ready",
        systems: [
          { name: "ERP budget", mode: "write", note: "EAC + live budget" },
          { name: "Email", mode: "write", note: "internal — you send" },
        ],
        draft: {
          kind: "email",
          internal: true,
          to: "Field superintendent · Foreman",
          subject: `Job ${job.number} — ${name} (${code}) production plan, remaining work`,
          body: `Team,

${name} (${code}) is running over the bid fab rate and we're past halfway, so the remaining work is where we make it back.

Two changes for the back half:
1. Move as much fab offsite as we can — spool/prefab the runs we'd otherwise build in place.
2. Re-sequence so we're not chasing access; group the runs to cut setup/teardown.

Goal is to get the remaining hours-per-unit back toward the bid. Let's review the look-ahead together Friday.

Thanks,
[Your name]`,
        },
      },
      {
        id: "learn",
        label: "Fix the next bid",
        detail: `Wrote the actual ${name} rate back to the estimate (${job.trade} · ${job.region}) so the next bid isn't light. This job's win is mostly the next estimate.`,
        targetsDollars: 0,
        artifact: "Estimating template corrected",
        feedsBenchmark: true,
        systems: [{ name: "Estimating benchmark", mode: "write" }],
      },
    ];
  }

  // rework — mostly sunk; no recovery, just carry the allowance + learn.
  return [
    {
      id: "rebaseline",
      label: `Carry rework allowance · ${code}`,
      detail: `Quality rework on ${name} is mostly sunk. Carried an explicit allowance and re-baselined the cost-to-complete.`,
      targetsDollars: 0,
      artifact: `Rework allowance set on Job ${job.number}`,
      systems: [
        { name: "Miter Payroll", mode: "read", note: "rework hours" },
        { name: "ERP budget", mode: "write", note: "allowance" },
      ],
    },
    {
      id: "reforecast",
      label: "Reforecast + update budget",
      detail: "Reforecast the job margin at the corrected rate and updated the live budget.",
      targetsDollars: 0,
      artifact: "Budget updated",
      systems: [{ name: "ERP budget", mode: "write", note: "live budget" }],
    },
    {
      id: "learn",
      label: "Write back to benchmark",
      detail: `Fed the ${name} rework actuals into the benchmark so it's priced in next time.`,
      targetsDollars: 0,
      artifact: `${name} benchmark tightened`,
      feedsBenchmark: true,
      systems: [{ name: "Estimating benchmark", mode: "write" }],
    },
  ];
}

/* ============================================================ build a job */

export interface JobSeed {
  id: string;
  number: string;
  name: string;
  trade: string;
  region: string;
  contractValue: number;
  blendedRate: number;
  baselineMarginPct: number;
  weeksTotal: number;
  lines: CostCodeLine[];
  /** Diagnosed driver for jobs that drift — picks the recovery playbook. */
  driver?: { code: string; kind: FlagKind };
}

function buildJob(seed: JobSeed): { job: Job; learning?: Learning } {
  const costLines = seed.lines.map((l) => projectLine(l, seed.blendedRate));

  const totalBudgetHours = costLines.reduce((s, c) => s + c.budgetHours, 0);
  const totalProjectedHours = costLines.reduce((s, c) => s + c.projectedHours, 0);
  const totalActualHours = costLines.reduce((s, c) => s + c.actualHours, 0);
  const pctComplete = clamp(
    totalActualHours / Math.max(1, totalProjectedHours),
    0.01,
    1
  );

  const totalAtRisk = costLines.reduce((s, c) => s + c.marginAtRisk, 0);
  const erosionPts = (totalAtRisk / seed.contractValue) * 100;
  const projectedMarginPct =
    Math.round((seed.baselineMarginPct - erosionPts) * 10) / 10;

  const drifting = costLines
    .filter((c) => c.drifting)
    .sort((a, b) => b.marginAtRisk - a.marginAtRisk);

  const base = {
    id: seed.id,
    number: seed.number,
    name: seed.name,
    trade: seed.trade,
    region: seed.region,
    contractValue: seed.contractValue,
    blendedRate: seed.blendedRate,
    pctComplete: Math.round(pctComplete * 100) / 100,
    baselineMarginPct: seed.baselineMarginPct,
    projectedMarginPct,
    costLines,
    totalBudgetHours,
    totalProjectedHours,
  };

  // Calm — nothing material drifting.
  if (drifting.length === 0 || totalAtRisk < 6000) {
    return { job: { ...base, status: "calm" as JobStatus } };
  }

  const driverCode = seed.driver?.code ?? drifting[0].code;
  const driver = costLines.find((c) => c.code === driverCode) ?? drifting[0];
  const kind: FlagKind = seed.driver?.kind ?? "added-scope";

  const sp = scoreJob(totalAtRisk, pctComplete, seed.weeksTotal);

  // Drifting but not worth surfacing → monitoring (restraint made visible).
  if (sp.score < SURFACE_MIN_SCORE || totalAtRisk < SURFACE_MIN_AT_RISK) {
    const mostlySunk = kind === "rework" || pctComplete > 0.8;
    const driftNote = `${driver.code} ${driver.name} drifting ~${Math.round(
      driver.overrunPct * 100
    )}% (${KIND[kind].label.toLowerCase()}) — ${
      mostlySunk
        ? "mostly sunk, watching rather than surfacing"
        : "below the surfacing threshold for now"
    }.`;
    return { job: { ...base, status: "monitoring" as JobStatus, driftNote } };
  }

  const plan = buildPlan(kind, seed, driver);
  const driverAtRisk = Math.round(Math.max(0, driver.overrunHours) * driver.rate);

  // Temporal: when the drift first crossed the noise floor, and its trajectory.
  const overPct = Math.round(driver.overrunPct * 100);
  const detectedWeeksAgo = Math.max(2, Math.round(sp.weeksLeftToAct * 0.4));
  const trend = [0.32, 0.5, 0.68, 0.84, 1].map((f) => Math.round(overPct * f));

  const flag: JobFlag = {
    ...sp,
    kind,
    rank: 0, // assigned after the whole portfolio is scored
    costCode: driver.code,
    costCodeName: driver.name,
    overPct,
    driverAtRisk,
    recoverability: KIND[kind].recoverability,
    driverLabel: KIND[kind].label,
    summary: summaryFor(kind, driver, sp),
    why: whyFor(kind, seed, driver, sp, driverAtRisk),
    marginNow: seed.baselineMarginPct,
    marginAtCompletion: projectedMarginPct,
    detectedWeeksAgo,
    trend,
    plan,
  };

  const learning: Learning = {
    id: `seed-${seed.number}`,
    jobNumber: seed.number,
    jobName: seed.name,
    trade: seed.trade,
    costCode: driver.code,
    costCodeName: driver.name,
    overranPct: Math.round(driver.overrunPct * 100),
    kind,
    text: `${driver.name} (${driver.code}) trending ${Math.round(
      driver.overrunPct * 100
    )}% over bid on Job ${seed.number} — benchmark adjusts up.`,
    source: "resolved",
  };

  return { job: { ...base, status: "flagged" as JobStatus, flag }, learning };
}

/* ---- narrative ---- */

function summaryFor(
  kind: FlagKind,
  driver: CostCodeProjection,
  sp: ScoreParts
): string {
  const pct = Math.round(driver.overrunPct * 100);
  if (kind === "added-scope")
    return `${driver.name} labor ${pct}% over budget with ${sp.weeksLeftToAct} weeks of install left.`;
  if (kind === "under-recovery")
    return `${driver.name} labor billed under the contract rate — recoverable now.`;
  if (kind === "underbid")
    return `${driver.name} bid ran light; actuals ${pct}% over with time to recover.`;
  return `${driver.name} rework pushing labor ${pct}% over budget.`;
}

function whyFor(
  kind: FlagKind,
  seed: JobSeed,
  driver: CostCodeProjection,
  sp: ScoreParts,
  driverAtRisk: number
): string {
  const pct = Math.round(driver.overrunPct * 100);
  const drvK = "$" + Math.round(driverAtRisk / 1000) + "k";
  const lead = `Hours booked to ${driver.code} (Miter Payroll) are outpacing the units installed (Field Ops) — the crew is running ~${pct}% more hours per unit than the job was budgeted for. At that production rate it projects to ${drvK} of overrun on this cost code.`;
  if (kind === "added-scope")
    return `${lead} It reads as out-of-scope work, so most of it should be billable via a change order if you act while ${sp.weeksLeftToAct} weeks of install remain.`;
  if (kind === "under-recovery")
    return `${lead} The hours are contractually billable but weren't captured on tickets, so most is recoverable by correcting the billing now.`;
  if (kind === "underbid")
    return `${lead} The original bid was light here; part is recoverable by converting remaining work to T&M, and the estimating template should be fixed for next time.`;
  return `${lead} It's quality rework, so most is already sunk — re-baselining won't claw it back, but it stops the overrun compounding through closeout.`;
}

/* ============================================================ portfolio */

import { JOB_SEEDS, SEED_LEARNINGS } from "./seed-data";

export function buildPortfolio(): { jobs: Job[]; learnings: Learning[] } {
  const built = JOB_SEEDS.map(buildJob);
  const jobs = built.map((b) => b.job);

  // Rank flagged jobs by score (1 = most urgent).
  const flagged = jobs
    .filter((j) => j.flag)
    .sort((a, b) => b.flag!.score - a.flag!.score);
  flagged.forEach((j, i) => (j.flag!.rank = i + 1));

  return { jobs, learnings: SEED_LEARNINGS };
}
