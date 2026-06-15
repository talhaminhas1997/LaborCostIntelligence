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
    firstStep: "Update live budget",
    firstArtifact: (n) => `Job ${n} budget re-baselined`,
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
  job: { number: string },
  driver: CostCodeProjection
): ActionStep[] {
  const k = KIND[kind];
  // The financial action targets the driver cost code's projected overrun — a
  // real figure (overrun hours × blended rate), not an invented "recovered" cut.
  const driverDollars = round(Math.max(0, driver.overrunHours) * driver.rate, 100);

  return [
    {
      id: "action",
      label: `${k.firstStep} · ${driver.code}`,
      detail:
        kind === "added-scope"
          ? `Capture the ${Math.round(driver.overrunPct * 100)}% out-of-scope labor on ${driver.name} as a billable change`
          : kind === "under-recovery"
          ? `Bill the unrecovered labor on ${driver.name} at the contract rate`
          : kind === "underbid"
          ? `Convert remaining ${driver.name} to T&M against the bid gap`
          : `Carry an explicit rework allowance on ${driver.name}`,
      targetsDollars: driverDollars,
      artifact: k.firstArtifact(job.number),
    },
    {
      id: "reforecast",
      label: "Reforecast job margin",
      detail: `Re-baseline ${driver.code} cost-to-complete at the corrected production rate`,
      targetsDollars: 0,
      artifact: "Margin reforecast updated",
    },
    {
      id: "alert",
      label: "Alert PM",
      detail: "Variance summary + recommended owner conversation",
      targetsDollars: 0,
      artifact: "PM notified",
    },
    {
      id: "learn",
      label: "Write back to benchmark",
      detail: `Feed ${driver.name} actuals into the estimating benchmark`,
      targetsDollars: 0,
      artifact: `${driver.name} benchmark tightened`,
      feedsBenchmark: true,
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
