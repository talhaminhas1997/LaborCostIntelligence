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

/* How much of the projected overrun is still recoverable, by diagnosed driver. */
const KIND: Record<
  FlagKind,
  { label: string; recoverFactor: number; firstStep: string; firstArtifact: (n: string) => string }
> = {
  "added-scope": {
    label: "Out-of-scope labor",
    recoverFactor: 0.85,
    firstStep: "Draft change order",
    firstArtifact: (n) => `CO-${n}-04 drafted`,
  },
  "under-recovery": {
    label: "Billable labor not captured",
    recoverFactor: 0.9,
    firstStep: "Draft billing tickets",
    firstArtifact: (n) => `3 T&M tickets queued for Job ${n}`,
  },
  underbid: {
    label: "Estimate ran light",
    recoverFactor: 0.55,
    firstStep: "Issue T&M / scope letter",
    firstArtifact: (n) => `Scope letter drafted for Job ${n}`,
  },
  rework: {
    label: "Quality rework (mostly sunk)",
    recoverFactor: 0.3,
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
  job: { number: string; contractValue: number },
  driver: CostCodeProjection,
  recoverable: number
): ActionStep[] {
  const k = KIND[kind];
  const ptsOf = (dollars: number) =>
    Math.round((dollars / job.contractValue) * 1000) / 10;

  // Most recovery lands on the financial action; reforecast captures the tail.
  const d1 = round(recoverable * 0.78, 100);
  const d2 = round(recoverable - d1, 100);

  return [
    {
      id: "action",
      label: `${k.firstStep} · ${driver.code}`,
      detail:
        kind === "added-scope"
          ? `Capture the ${Math.round(driver.overrunPct * 100)}% out-of-scope labor as billable change`
          : kind === "under-recovery"
          ? `Recover labor billed below the contract rate on ${driver.name}`
          : kind === "underbid"
          ? `Convert remaining ${driver.name} to T&M against the bid gap`
          : `Carry an explicit rework allowance on ${driver.name}`,
      pointsRecovered: ptsOf(d1),
      dollarsRecovered: d1,
      artifact: k.firstArtifact(job.number),
    },
    {
      id: "reforecast",
      label: "Reforecast job margin",
      detail: `Apply corrected production rate on ${driver.code} to cost-to-complete`,
      pointsRecovered: ptsOf(d2),
      dollarsRecovered: d2,
      artifact: "Margin reforecast updated",
    },
    {
      id: "alert",
      label: "Alert PM",
      detail: "Variance summary + recommended owner conversation",
      pointsRecovered: 0,
      dollarsRecovered: 0,
      artifact: "PM notified",
    },
    {
      id: "learn",
      label: "Write back to benchmark",
      detail: `Feed ${driver.name} actuals into the estimating benchmark`,
      pointsRecovered: 0,
      dollarsRecovered: 0,
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
  const recoverable = Math.round(totalAtRisk * KIND[kind].recoverFactor * sp.pctJobRemaining);
  const residualAtRisk = Math.round(totalAtRisk - recoverable);

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

  const plan = buildPlan(kind, seed, driver, recoverable);
  const marginRecovered =
    Math.round(plan.reduce((s, p) => s + p.pointsRecovered, 0) * 10) / 10;

  const flag: JobFlag = {
    ...sp,
    kind,
    rank: 0, // assigned after the whole portfolio is scored
    costCode: driver.code,
    costCodeName: driver.name,
    overPct: Math.round(driver.overrunPct * 100),
    recoverable,
    residualAtRisk,
    driverLabel: KIND[kind].label,
    summary: summaryFor(kind, driver, sp),
    why: whyFor(kind, seed, driver, sp, recoverable),
    marginNow: seed.baselineMarginPct,
    marginAtCompletion: projectedMarginPct,
    marginRecovered,
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
  recoverable: number
): string {
  const pct = Math.round(driver.overrunPct * 100);
  const recK = "$" + Math.round(recoverable / 1000) + "k";
  const lead = `Actual hours booked to ${driver.code} are outpacing the budgeted rate — the crew is logging ~${pct}% more hours per unit than comparable completed ${seed.trade} jobs in ${seed.region}.`;
  if (kind === "added-scope")
    return `${lead} It reads as out-of-scope work, which means ~${recK} is recoverable through a change order if you act while ${sp.weeksLeftToAct} weeks of install remain.`;
  if (kind === "under-recovery")
    return `${lead} The hours are contractually billable but weren't captured on tickets — ~${recK} is recoverable by correcting the billing now.`;
  if (kind === "underbid")
    return `${lead} The original bid was light here; ~${recK} is recoverable by converting remaining work to T&M and fixing the estimating template.`;
  return `${lead} It's quality rework, so most is already sunk — only ~${recK} is recoverable, but re-baselining stops it compounding through closeout.`;
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
