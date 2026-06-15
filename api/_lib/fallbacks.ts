import type { ChatRequest } from "./types";

/**
 * Deterministic chat fallback used when no ANTHROPIC_API_KEY is present or the
 * model call fails — so Cost Agent always replies.
 */
export function computeChat(req: ChatRequest): string {
  const last = [...(req.messages || [])].reverse().find((m) => m.role === "user");
  const q = (last?.content || "").toLowerCase();
  const ctx = req.jobContext || {};

  const job = (ctx.jobName as string) || (ctx.job as string) || "this job";
  const code = (ctx.costCode as string) || "the drifting cost code";
  const overPct = ctx.overPct as number | undefined;
  const marginImpact = ctx.marginImpact as string | undefined;

  if (/why|cause|reason|driver|explain/.test(q)) {
    return `${job} is drifting because hours booked to ${code} (Miter Payroll) are outpacing the units installed (Field Ops)${
      overPct ? ` — currently ~${overPct}% more hours per unit than budgeted` : ""
    }. Left unaddressed the burn rate projects ${
      marginImpact || "a meaningful margin hit"
    } at completion. It started early enough that a change order plus a reforecast recovers most of it.`;
  }
  if (/action|plan|do|fix|recover|protect|mitigat/.test(q)) {
    return `Here's the plan on ${job}: draft a change order for the out-of-scope labor on ${code}, reforecast the job margin at the corrected production rate, alert the PM with the variance summary, and write the actuals back to the benchmark. Approve all and I'll run the steps, or review each first.`;
  }
  if (/other|rest|else|quiet|portfolio/.test(q)) {
    return `The rest of the portfolio is quiet — the remaining jobs are tracking inside their labor budgets, so I'm not surfacing them. I only flag where margin-at-risk and time-left-to-act line up. Want me to walk the next-highest job?`;
  }
  return `On ${job}: the exposure is concentrated in ${code}${
    overPct ? `, running ~${overPct}% over its budgeted production rate` : ""
  }. I've proposed a multi-step plan to mitigate the risk — approve all, or ask me "why" for the analysis. (Illustrative figures — production uses live Miter payroll + field data.)`;
}
