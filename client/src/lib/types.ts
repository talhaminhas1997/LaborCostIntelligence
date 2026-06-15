export type Status = "light" | "heavy" | "on-target";

export interface PhaseInput {
  name: string;
  hours: number;
  costCode?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExtractResult {
  trade: string;
  region: string;
  scope: string;
  phases: PhaseInput[];
  blendedRate: number;
  source?: "model" | "fallback";
}

export interface PhaseResult {
  name: string;
  costCode?: string;
  yourHours: number;
  benchmarkLow: number;
  benchmarkHigh: number;
  status: Status;
  note: string;
}

export interface AnalyzeResult {
  verdict: Status;
  percentDelta: number;
  headline: string;
  phases: PhaseResult[];
  reworkGap: { yourAssumption: string; benchmarkTypical: string; note: string };
  recommended: { hours: number; cost: number; blendedRate: number };
  rationale: string;
  confidence: "low" | "medium" | "high";
  source?: "model" | "fallback";
}

/* ======================================================= Cost Agent
 * Features 1 & 2 run on a seeded, deterministic portfolio held client-side,
 * so the demo is fully reproducible. The engine (lib/engine.ts) turns raw
 * cost-code actuals into projections, scores them, and decides the few that
 * clear the surfacing threshold.
 * ========================================================================*/

/** The diagnosed driver behind a drift — changes the action plan. */
export type FlagKind =
  | "added-scope" // out-of-scope labor → recoverable via change order
  | "rework" // quality failure → mostly unrecoverable
  | "underbid" // estimate was light → recover via T&M / template fix
  | "under-recovery"; // billable labor not captured → recover via tickets

/** Raw seed input: one cost code on one job. */
export interface CostCodeLine {
  code: string;
  name: string;
  budgetHours: number;
  actualHours: number;
  committedHours: number; // on the books (POs / scheduled crew) not yet burned
  pctComplete: number; // 0..1 of THIS code's scope
}

/** Engine-derived projection for a cost code. */
export interface CostCodeProjection extends CostCodeLine {
  rate: number;
  projectedHours: number; // burn-rate extrapolation to completion
  overrunHours: number; // projected − budget
  overrunPct: number; // overrunHours / budget
  marginAtRisk: number; // $ of total projected overrun
  recoverable: number; // $ still recoverable by acting on remaining work
  drifting: boolean; // overrunPct past the noise floor
}

export interface ActionStep {
  id: string;
  label: string;
  detail: string;
  /** $ of projected overrun this step targets — set only on the financial action
   *  (change order / billing). Process steps (reforecast, alert, benchmark) are 0. */
  targetsDollars: number;
  /** The concrete artifact this step produces (CO number, reforecast, etc). */
  artifact: string;
  /** Final step — writing the lesson back into the estimating benchmark (the loop). */
  feedsBenchmark?: boolean;
}

export interface ScoreParts {
  marginAtRisk: number; // $
  confidence: number; // 0..1
  confidenceLabel: "low" | "medium" | "high";
  pctJobRemaining: number; // 0..1 — the time-left-to-act axis
  weeksLeftToAct: number;
  score: number; // marginAtRisk × confidence × pctJobRemaining (scaled)
}

export interface JobFlag extends ScoreParts {
  kind: FlagKind;
  rank: number; // 1 = most urgent
  costCode: string;
  costCodeName: string;
  overPct: number; // projected overrun on the driver code
  driverAtRisk: number; // $ projected overrun on the driver cost code (change-order target)
  recoverability: "high" | "medium" | "low"; // qualitative, by diagnosed cause
  driverLabel: string; // human label for the diagnosed driver
  summary: string;
  why: string;
  marginNow: number; // baseline margin pts (at bid)
  marginAtCompletion: number; // projected pts if unaddressed
  detectedWeeksAgo: number; // when the drift first crossed the noise floor
  trend: number[]; // recent overrun-% trajectory (oldest → current)
  plan: ActionStep[];
}

export type JobStatus = "flagged" | "monitoring" | "calm";

export interface Job {
  id: string;
  number: string;
  name: string;
  trade: string;
  region: string;
  contractValue: number;
  blendedRate: number;
  pctComplete: number; // job-level, hours-weighted
  baselineMarginPct: number; // margin at bid
  projectedMarginPct: number; // projected at completion if unaddressed
  costLines: CostCodeProjection[];
  totalBudgetHours: number;
  totalProjectedHours: number;
  status: JobStatus;
  /** Shown when drifting but deliberately not flagged. */
  driftNote?: string;
  flag?: JobFlag; // present only for the few that clear the threshold
}

/** A lesson written back from a resolved job — consumed by the Bid Co-pilot. */
export interface Learning {
  id: string;
  jobNumber: string;
  jobName: string;
  trade: string;
  costCode: string;
  costCodeName: string;
  overranPct: number; // how much this code ran over its bid
  kind: FlagKind;
  text: string;
  source: "seed" | "resolved"; // resolved = produced live in this session
}
