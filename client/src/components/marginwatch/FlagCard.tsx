import { useRef, useState } from "react";
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
  X,
  Clock,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/api";
import { cn, fmt, usd, usdK } from "@/lib/utils";
import type { CostCodeProjection, Job } from "@/lib/types";

type StepState = "pending" | "running" | "done" | "skipped";

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
  onResolved: (job: Job, actionedDollars: number) => void;
}) {
  const flag = job.flag!;
  const actionIdx = flag.plan.findIndex((p) => p.targetsDollars > 0);
  const [phase, setPhase] = useState<"proposed" | "review" | "executing" | "done">(
    "proposed"
  );
  const [steps, setSteps] = useState<StepState[]>(flag.plan.map(() => "pending"));
  const [reviewIdx, setReviewIdx] = useState(0);
  const [showCodes, setShowCodes] = useState(false);
  // Per-step review inputs and agent confirmations (Review-each path).
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [confirms, setConfirms] = useState<Record<number, string>>({});
  const [refining, setRefining] = useState(false);
  // Refs mirror amounts/skips so the actioned $ can be read synchronously at finish.
  const amountsRef = useRef<Record<number, number>>({});
  const skippedRef = useRef<Set<number>>(new Set());

  // $ actually committed by the financial action (edited, or 0 if skipped).
  const actionedDollars = () => {
    if (actionIdx < 0 || skippedRef.current.has(actionIdx)) return 0;
    return Math.round(
      amountsRef.current[actionIdx] ?? flag.plan[actionIdx].targetsDollars
    );
  };

  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
  const setStep = (idx: number, v: StepState) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? v : s)));
  const advance = (idx: number) => {
    if (idx + 1 >= flag.plan.length) {
      setPhase("done");
      onResolved(job, actionedDollars());
    } else setReviewIdx(idx + 1);
  };

  function runFrom(idx: number, onAllDone: () => void) {
    if (idx >= flag.plan.length) return onAllDone();
    setStep(idx, "running");
    window.setTimeout(() => {
      setStep(idx, "done");
      window.setTimeout(() => runFrom(idx + 1, onAllDone), 300);
    }, 780);
  }

  function approveAll() {
    setPhase("executing");
    runFrom(0, () => {
      setPhase("done");
      onResolved(job, actionedDollars());
    });
  }

  async function approveReviewStep() {
    if (refining) return;
    const idx = reviewIdx;
    const step = flag.plan[idx];
    const note = (notes[idx] || "").trim();
    const editedAmt = amounts[idx];
    const amountChanged =
      step.targetsDollars > 0 &&
      editedAmt != null &&
      Math.round(editedAmt) !== Math.round(step.targetsDollars);

    setStep(idx, "running");
    let confirmation = step.artifact;

    if (note || amountChanged) {
      setRefining(true);
      try {
        const instruction = `On Job ${job.number} (${flag.costCode} ${flag.costCodeName}), I'm reviewing the action step "${step.label}".${
          amountChanged ? ` Change the amount to ${usd(editedAmt!)}.` : ""
        }${note ? ` Instruction: ${note}.` : ""} Confirm in one short sentence exactly what you'll do for this step.`;
        const { reply } = await chat([{ role: "user", content: instruction }], {
          mode: "margin-watch",
          jobContext: {
            jobName: job.name,
            jobNumber: job.number,
            costCode: `${flag.costCode} ${flag.costCodeName}`,
            step: step.label,
          },
        });
        confirmation = reply?.trim() || confirmation;
      } catch {
        confirmation = `${amountChanged ? `Revised to ${usd(editedAmt!)}. ` : ""}${
          note ? `Noted: ${note}` : confirmation
        }`;
      } finally {
        setRefining(false);
      }
    } else {
      await sleep(600);
    }

    setConfirms((c) => ({ ...c, [idx]: confirmation }));
    setStep(idx, "done");
    advance(idx);
  }

  function skipReviewStep() {
    if (refining) return;
    const idx = reviewIdx;
    skippedRef.current.add(idx);
    setConfirms((c) => ({ ...c, [idx]: "Skipped — not run." }));
    setStep(idx, "skipped");
    advance(idx);
  }

  const atStakePts = (flag.marginNow - flag.marginAtCompletion).toFixed(1);

  // Outcome summary (reflects per-step edits/skips from the Review-each path).
  const ranCount = steps.filter((s) => s === "done").length;
  const skippedCount = steps.filter((s) => s === "skipped").length;
  const actionRan = actionIdx >= 0 && steps[actionIdx] === "done";
  const actionVerb = actionIdx >= 0 ? flag.plan[actionIdx].label.split(" · ")[0] : "";
  const actionAmt =
    actionIdx >= 0 ? amounts[actionIdx] ?? flag.plan[actionIdx].targetsDollars : 0;

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
              <span className="text-sm font-semibold text-maroon">
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

        {/* Temporal — caught early, trending up */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
          <Clock className="h-3 w-3 shrink-0 text-rose-400" />
          <span>
            First flagged <span className="font-medium text-ink-600">{flag.detectedWeeksAgo} weeks ago</span> · drift widening
          </span>
          <Sparkline data={flag.trend} />
        </div>

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

        {/* Cost-code drill-down — the forecast at the cost-code level */}
        <button
          onClick={() => setShowCodes((s) => !s)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          {showCodes ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Cost-code breakdown · {job.costLines.length} codes
        </button>
        {showCodes && (
          <CostCodeTable lines={job.costLines} driverCode={flag.costCode} />
        )}

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
                    "rounded-lg border px-3 py-2 transition-colors",
                    st === "skipped"
                      ? "border-ink-200 bg-ink-50 opacity-60"
                      : st === "done"
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
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      <StepIcon state={st} idx={i} loop={step.feedsBenchmark} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium text-ink-800",
                            st === "skipped" && "line-through"
                          )}
                        >
                          {step.label}
                        </span>
                        {step.targetsDollars > 0 && (
                          <span className="tabular shrink-0 text-xs font-medium text-ink-500">
                            targets {usdK(amounts[i] ?? step.targetsDollars)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500">{step.detail}</div>
                      {(st === "done" || st === "skipped") && (
                        <div
                          className={cn(
                            "mt-1 flex items-center gap-1 text-[11px] font-medium",
                            st === "skipped"
                              ? "text-ink-400"
                              : step.feedsBenchmark
                              ? "text-brand-600"
                              : "text-emerald-600"
                          )}
                        >
                          {st === "done" && step.feedsBenchmark && (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {confirms[i] ?? step.artifact}
                        </div>
                      )}
                      {st === "running" && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-brand-600">
                          {refining && <Loader2 className="h-3 w-3 animate-spin" />}
                          {refining ? "Cost Agent is revising…" : "Executing…"}
                        </div>
                      )}
                    </div>
                  </div>

                  {isReviewCurrent && (
                    <div className="mt-2.5 space-y-2 border-t border-ink-100 pt-2.5">
                      {step.targetsDollars > 0 && (
                        <label className="flex items-center gap-2 text-xs text-ink-500">
                          Amount
                          <span className="flex items-center rounded-md border border-ink-200 bg-white px-2">
                            <span className="text-ink-400">$</span>
                            <input
                              type="number"
                              min={0}
                              value={amounts[i] ?? Math.round(step.targetsDollars)}
                              onChange={(e) => {
                                const v = e.target.value === "" ? 0 : Number(e.target.value);
                                amountsRef.current[i] = v;
                                setAmounts((a) => ({ ...a, [i]: v }));
                              }}
                              className="tabular h-7 w-28 bg-transparent px-1 text-right text-sm text-ink-800 outline-none"
                            />
                          </span>
                        </label>
                      )}
                      <input
                        value={notes[i] || ""}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [i]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") approveReviewStep();
                        }}
                        placeholder="Adjust this step or tell Cost Agent how (optional)…"
                        className="h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={approveReviewStep} disabled={refining}>
                          {refining ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revising…
                            </>
                          ) : (
                            "Approve & run"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={skipReviewStep}
                          disabled={refining}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
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
            Reviewing step {reviewIdx + 1} of {flag.plan.length} — edit the amount,
            add an instruction, then approve & run, or skip.
          </p>
        )}

        {phase === "executing" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-brand-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cost Agent is executing the plan…
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
                  {actionRan && `${actionVerb} for ${usd(actionAmt)} · `}
                  {ranCount} of {flag.plan.length} steps run
                  {skippedCount > 0 && ` · ${skippedCount} skipped`}.
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
  if (state === "skipped")
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 bg-ink-100 text-ink-400">
        <X className="h-3 w-3" />
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

/** Tiny overrun-trajectory sparkline (oldest → current). */
function Sparkline({ data }: { data: number[] }) {
  const w = 52;
  const h = 14;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`)
    .join(" ");
  const lastY = h - (data[data.length - 1] / max) * (h - 2) - 1;
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible">
      <polyline points={pts} fill="none" stroke="#e11d48" strokeWidth="1.5" />
      <circle cx={w} cy={lastY} r="1.8" fill="#e11d48" />
    </svg>
  );
}

/** Cost-code breakdown — the forecast at the cost-code level (the #1 foundation). */
function CostCodeTable({
  lines,
  driverCode,
}: {
  lines: CostCodeProjection[];
  driverCode: string;
}) {
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full min-w-[26rem] text-left text-[11px]">
        <thead className="bg-ink-50 text-ink-400">
          <tr>
            <th className="px-2 py-1 font-medium">Cost code</th>
            <th className="px-2 py-1 text-right font-medium">Budget</th>
            <th className="px-2 py-1 text-right font-medium">Actual</th>
            <th className="px-2 py-1 text-right font-medium">Proj.</th>
            <th className="px-2 py-1 text-right font-medium">Over</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((c) => {
            const isDriver = c.code === driverCode;
            const overPct = Math.round(c.overrunPct * 100);
            const overDollars = Math.round(Math.max(0, c.overrunHours) * c.rate);
            return (
              <tr
                key={c.code}
                className={cn(
                  "border-t border-ink-100",
                  isDriver && "bg-rose-50/60"
                )}
              >
                <td className="px-2 py-1.5">
                  <span className="font-mono text-ink-400">{c.code}</span>{" "}
                  <span className="text-ink-700">{c.name}</span>
                </td>
                <td className="tabular px-2 py-1.5 text-right text-ink-500">
                  {fmt(c.budgetHours)}h
                </td>
                <td className="tabular px-2 py-1.5 text-right text-ink-600">
                  {fmt(c.actualHours)}h
                  <span className="text-ink-400"> · {Math.round(c.pctComplete * 100)}%</span>
                </td>
                <td className="tabular px-2 py-1.5 text-right font-medium text-ink-700">
                  {fmt(c.projectedHours)}h
                </td>
                <td
                  className={cn(
                    "tabular px-2 py-1.5 text-right font-semibold",
                    c.drifting ? "text-rose-600" : "text-emerald-600"
                  )}
                >
                  {c.drifting ? `+${overPct}% · ${usdK(overDollars)}` : "on budget"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
