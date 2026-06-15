import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  TrendingDown,
  ShieldCheck,
  RefreshCw,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, usd, usdK } from "@/lib/utils";
import type { Job } from "@/lib/types";

type StepState = "pending" | "running" | "done";

/**
 * Conversational flag card: the job-cost drift, the proposed multi-step plan,
 * and (on approval) the steps executing one-by-one with artifacts, then the
 * margin recovering and a benchmark write-back that closes the loop.
 */
export function FlagCard({
  job,
  onResolved,
}: {
  job: Job;
  onResolved: (job: Job) => void;
}) {
  const flag = job.flag!;
  const [phase, setPhase] = useState<"proposed" | "review" | "executing" | "done">(
    "proposed"
  );
  const [steps, setSteps] = useState<StepState[]>(flag.plan.map(() => "pending"));
  const [reviewIdx, setReviewIdx] = useState(0);

  function runFrom(idx: number, onAllDone: () => void) {
    if (idx >= flag.plan.length) return onAllDone();
    setSteps((prev) => prev.map((s, i) => (i === idx ? "running" : s)));
    window.setTimeout(() => {
      setSteps((prev) => prev.map((s, i) => (i === idx ? "done" : s)));
      window.setTimeout(() => runFrom(idx + 1, onAllDone), 300);
    }, 780);
  }

  function approveAll() {
    setPhase("executing");
    runFrom(0, () => {
      setPhase("done");
      onResolved(job);
    });
  }

  function approveReviewStep() {
    const idx = reviewIdx;
    setSteps((prev) => prev.map((s, i) => (i === idx ? "running" : s)));
    window.setTimeout(() => {
      setSteps((prev) => prev.map((s, i) => (i === idx ? "done" : s)));
      if (idx + 1 >= flag.plan.length) {
        setPhase("done");
        onResolved(job);
      } else setReviewIdx(idx + 1);
    }, 720);
  }

  const atStakePts = (flag.marginNow - flag.marginAtCompletion).toFixed(1);

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg",
              phase === "done"
                ? "bg-emerald-100 text-emerald-600"
                : "bg-rose-100 text-rose-600"
            )}
          >
            {phase === "done" ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-ink-900">
                Job {job.number}
              </span>
              <span className="text-xs text-ink-400">·</span>
              <span className="text-xs text-ink-500">{job.name}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              <span className="font-mono">{flag.costCode}</span>{" "}
              {flag.costCodeName} · {flag.driverLabel}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-wide text-ink-400">Rank</div>
          <div className="tabular text-sm font-semibold text-brand-600">
            #{flag.rank}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        <p className="text-sm font-medium text-ink-800">{flag.summary}</p>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Over budget" value={`${flag.overPct}%`} tone="danger" />
          <Metric label="Projected overrun" value={usdK(flag.marginAtRisk)} tone="danger" />
          <Metric
            label="Recoverability"
            value={flag.recoverability}
            tone="brand"
            capitalize
          />
          <Metric label="Time to act" value={`${flag.weeksLeftToAct} wks`} tone="neutral" />
        </div>

        {/* Margin projection */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2.5">
          <TrendingDown className="h-4 w-4 shrink-0 text-rose-500" />
          <div className="tabular flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-500">Margin</span>
            <span className="font-semibold text-ink-700">{flag.marginNow}%</span>
            <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
            <span className="font-semibold text-rose-600">
              {flag.marginAtCompletion}%
            </span>
            <span className="text-xs text-ink-400">
              if unaddressed · {atStakePts} pts at stake
            </span>
          </div>
        </div>

        {/* Plan */}
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-700">
              Proposed plan · {flag.plan.length} steps
            </span>
            {phase === "proposed" && (
              <span className="text-[11px] text-ink-400">approval required</span>
            )}
          </div>
          <div className="space-y-1.5">
            {flag.plan.map((step, i) => {
              const st = steps[i];
              const isReviewCurrent = phase === "review" && reviewIdx === i;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                    st === "done"
                      ? step.feedsBenchmark
                        ? "border-brand-200 bg-brand-50/70"
                        : "border-emerald-200 bg-emerald-50/60"
                      : st === "running"
                      ? "border-brand-300 bg-brand-50"
                      : isReviewCurrent
                      ? "border-brand-300 bg-white ring-1 ring-brand-200"
                      : "border-ink-200 bg-white"
                  )}
                >
                  <div className="mt-0.5">
                    <StepIcon state={st} idx={i} loop={step.feedsBenchmark} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800">
                        {step.label}
                      </span>
                      {step.targetsDollars > 0 && (
                        <span className="tabular shrink-0 text-xs font-medium text-ink-500">
                          targets {usdK(step.targetsDollars)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500">{step.detail}</div>
                    {st === "done" && (
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-1 text-[11px] font-medium",
                          step.feedsBenchmark ? "text-brand-600" : "text-emerald-600"
                        )}
                      >
                        {step.feedsBenchmark && <RefreshCw className="h-3 w-3" />}
                        {step.artifact}
                      </div>
                    )}
                    {st === "running" && (
                      <div className="mt-1 text-[11px] font-medium text-brand-600">
                        Executing…
                      </div>
                    )}
                  </div>
                  {isReviewCurrent && (
                    <Button size="sm" onClick={approveReviewStep}>
                      Approve
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions / outcome */}
        {phase === "proposed" && (
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={approveAll} className="flex-1">
              Approve all
            </Button>
            <Button variant="secondary" onClick={() => setPhase("review")} className="flex-1">
              Review each
            </Button>
          </div>
        )}

        {phase === "review" && (
          <p className="mt-3 text-xs text-ink-500">
            Reviewing step {reviewIdx + 1} of {flag.plan.length} — approve to execute.
          </p>
        )}

        {phase === "executing" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-brand-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            The Cost Risk Agent is executing the plan…
          </div>
        )}

        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-emerald-800">
                  Risk mitigated on Job {job.number}
                </div>
                <div className="text-xs text-emerald-600">
                  {flag.plan[0].label.split(" · ")[0]} for {usd(flag.driverAtRisk)} · margin
                  reforecast · benchmark updated.
                </div>
              </div>
            </div>
            <Check className="h-5 w-5 text-emerald-500" />
          </motion.div>
        )}

        {/* Data provenance — every figure traces to a first-party Miter source */}
        <div className="mt-3 flex items-start gap-1.5 border-t border-ink-100 pt-2.5 text-[11px] text-ink-400">
          <Database className="mt-px h-3 w-3 shrink-0" />
          <span>
            Forecast from hours booked (Miter Payroll) vs. units installed (Miter
            Field Ops), against the ERP budget. Illustrative.
          </span>
        </div>
      </div>
    </div>
  );
}

function StepIcon({
  state,
  idx,
  loop,
}: {
  state: StepState;
  idx: number;
  loop?: boolean;
}) {
  if (state === "done")
    return (
      <div
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-white",
          loop ? "bg-brand-500" : "bg-emerald-500"
        )}
      >
        {loop ? <RefreshCw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </div>
    );
  if (state === "running")
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 text-[10px] font-semibold text-ink-400">
      {idx + 1}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  capitalize,
}: {
  label: string;
  value: string;
  tone: "danger" | "neutral" | "brand";
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-400">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-sm font-semibold",
          capitalize && "capitalize",
          tone === "danger"
            ? "text-rose-600"
            : tone === "brand"
            ? "text-brand-600"
            : "text-ink-700"
        )}
      >
        {value}
      </div>
    </div>
  );
}
