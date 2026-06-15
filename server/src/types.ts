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

export interface ChatRequest {
  messages: ChatMessage[];
  jobContext?: Record<string, unknown>;
  /** Optional hint so the server can pick a better deterministic fallback. */
  mode?: "bid" | "margin-watch";
}

export interface ExtractRequest {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
}

export interface ExtractResult {
  trade: string;
  region: string;
  scope: string;
  phases: PhaseInput[];
  blendedRate: number;
}

export interface AnalyzeRequest {
  trade: string;
  region: string;
  scope: string;
  phases: PhaseInput[];
  blendedRate: number;
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
  source?: "model" | "fallback";
}
