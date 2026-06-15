import { motion } from "framer-motion";
import { ShieldCheck, LayoutGrid } from "lucide-react";
import { cn, usd, usdK } from "@/lib/utils";
import type { FlagKind, Job } from "@/lib/types";

const KIND_LABEL: Record<FlagKind, string> = {
  "added-scope": "Added scope",
  rework: "Rework",
  underbid: "Underbid",
  "under-recovery": "Under-recovery",
};

/**
 * Left-hand "Job board" — each row opens that job's own chat thread.
 * Mirrors a messaging app: jobs on the left, an independent conversation each.
 */
export function JobBoard({
  flagged,
  monitoring,
  calm,
  activeThreadId,
  resolvedJobs,
  protectedAmt,
  jobsMonitored,
  onSelectJob,
  onSelectOverview,
}: {
  flagged: Job[];
  monitoring: Job[];
  calm: Job[];
  activeThreadId: string;
  resolvedJobs: Set<string>;
  protectedAmt: number;
  jobsMonitored: number;
  onSelectJob: (job: Job) => void;
  onSelectOverview: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header + tally */}
      <div className="border-b border-ink-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-ink-900">Job board</h3>
        </div>
        <div className="mt-2.5 flex items-center gap-3 text-xs">
          <div>
            <span className="tabular font-semibold text-brand-600">
              {usd(protectedAmt)}
            </span>
            <span className="text-ink-400"> protected</span>
          </div>
          <span className="h-3 w-px bg-ink-200" />
          <div>
            <span className="tabular font-semibold text-ink-700">
              {jobsMonitored}
            </span>
            <span className="text-ink-400"> monitored</span>
          </div>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
        {/* Overview */}
        <button
          onClick={onSelectOverview}
          className={cn(
            "mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
            activeThreadId === "overview"
              ? "bg-brand-50 text-brand-700"
              : "text-ink-600 hover:bg-ink-100"
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Overview</span>
          <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
            {flagged.filter((j) => !resolvedJobs.has(j.id)).length} need you
          </span>
        </button>

        {/* Needs you */}
        <SectionLabel tone="danger" title="Needs you" sub="ranked" />
        <div className="space-y-1.5">
          {flagged.map((job, i) => {
            const resolved = resolvedJobs.has(job.id);
            return (
              <motion.button
                key={job.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onSelectJob(job)}
                className={cn(
                  "w-full rounded-lg border p-2.5 text-left transition-all",
                  activeThreadId === job.id
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : resolved
                    ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300"
                    : "border-ink-200 bg-white hover:border-brand-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-ink-900 text-[10px] font-semibold text-white">
                      {job.flag!.rank}
                    </span>
                    <span className="text-xs font-semibold text-ink-800">
                      Job {job.number}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      resolved
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    )}
                  >
                    {resolved ? "Protected" : KIND_LABEL[job.flag!.kind]}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-ink-500">{job.name}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-ink-400">
                    {job.flag!.costCode}
                  </span>
                  <span
                    className={cn(
                      "tabular text-xs font-semibold",
                      resolved ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {resolved
                      ? `+${job.flag!.marginRecovered} pts`
                      : `${usdK(job.flag!.marginAtRisk)} at risk`}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Watching */}
        {monitoring.length > 0 && (
          <>
            <SectionLabel tone="warn" title="Watching" sub="below threshold" />
            <div className="space-y-0.5">
              {monitoring.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  active={activeThreadId === job.id}
                  dot="bg-amber-400"
                  onClick={() => onSelectJob(job)}
                />
              ))}
            </div>
          </>
        )}

        {/* On budget */}
        <SectionLabel tone="success" title="On budget" sub="no action" />
        <div className="space-y-0.5">
          {calm.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              active={activeThreadId === job.id}
              dot="bg-emerald-400"
              onClick={() => onSelectJob(job)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function JobRow({
  job,
  active,
  dot,
  onClick,
}: {
  job: Job;
  active: boolean;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-ink-100" : "hover:bg-ink-100/70"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
        <span className="truncate text-xs text-ink-600">
          <span className="font-medium text-ink-700">Job {job.number}</span> ·{" "}
          {job.name}
        </span>
      </div>
      <span className="tabular shrink-0 text-[11px] text-ink-400">
        {Math.round(job.pctComplete * 100)}%
      </span>
    </button>
  );
}

function SectionLabel({
  tone,
  title,
  sub,
}: {
  tone: "danger" | "warn" | "success";
  title: string;
  sub: string;
}) {
  const color =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warn"
      ? "text-amber-600"
      : "text-emerald-600";
  return (
    <div className="mb-1.5 mt-4 flex items-center gap-2 px-2">
      <span
        className={cn("text-[11px] font-semibold uppercase tracking-wide", color)}
      >
        {title}
      </span>
      <span className="text-[11px] text-ink-400">· {sub}</span>
    </div>
  );
}
