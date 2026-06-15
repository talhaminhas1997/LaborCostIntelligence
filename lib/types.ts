export type Trade =
  | "Electrical"
  | "Mechanical/HVAC"
  | "Concrete"
  | "Plumbing";

export interface PhaseInput {
  name: string;
  hours: number;
}

export interface AnalyzeRequest {
  trade: Trade | string;
  region: string;
  scope: string;
  phases: PhaseInput[];
  blendedRate: number;
}

export type Status = "light" | "heavy" | "on-target";

export interface PhaseResult {
  name: string;
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
  reworkGap: {
    yourAssumption: string;
    benchmarkTypical: string;
    note: string;
  };
  recommended: {
    hours: number;
    cost: number;
    blendedRate: number;
  };
  rationale: string;
  confidence: "low" | "medium" | "high";
  /** Whether this came from the live model or the deterministic fallback. */
  source?: "model" | "fallback";
}
