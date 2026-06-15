import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, LayoutGrid, ChevronDown, MessageSquare } from "lucide-react";
import { cn, usd, usdK } from "@/lib/utils";
import type { FlagKind, Job } from "@/lib/types";

const KIND_LABEL: Record<FlagKind, string> = {
  "added-scope": "Added scope",
  rework: "Rework",
  underbid: "Underbid",
  "under-recovery": "Under-recovery",
};

/**
 * Left-hand sidebar for the Margin Agent. The agent proactively surfaces the
 * few jobs that need attention (Needs you / Watching, collapsible); below that
 * is the user's history of conversations with the agent.
 */
export function JobBoard({
  flagged,
  monitoring,
  recent,
  activeThreadId,
  resolvedJobs,
  protectedAmt,
  jobsMonitored,
  onSelectJob,
  onSelectOverview,
}: {
  flagged: Job[];
  monitoring: Job[];
  recent: Job[];
  activeThreadId: string;
  resolvedJobs: Set<string>;
  protectedAmt: number;
  jobsMonitored: number;
  onSelectJob: (job: Job) => void;
  onSelectOverview: () => void;
}) {
  const [open, setOpen] = useState({ needs: true, watch: true, recent: true });
  const toggle = (k: keyof typeof open) =>
    setOpen((o) => ({ ...o, [k]: !o[k] }));

  const needsYou = flagged.filter((j) => !resolvedJobs.has(j.id));
  // History: opened conversations that aren't currently in the proactive lists.
  const recentChats = recent.filter(
    (j) =>
      !monitoring.some((m) => m.id === j.id) &&
      !(flagged.some((f) => f.id === j.id) && !resolvedJobs.has(j.id))
  );

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header + tally */}
      <div className="border-b border-ink-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-maroon">Job board</h3>
        </div>
        <p className="mt-1 text-[11px] text-ink-400">
          Cost-at-completion on Miter&apos;s live actuals
        </p>
        <div className="mt-2.5 flex items-center gap-3 text-xs">
          <div>
            <span className="tabular font-semibold text-brand-600">
              {usd(protectedAmt)}
            </span>
            <span className="text-ink-400"> risk mitigated</span>
          </div>
          <span className="h-3 w-px bg-ink-200" />
          <div>
            <span className="tabular font-semibold text-ink-700">{jobsMonitored}</span>
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
            {needsYou.length} need you
          </span>
        </button>

        {/* Needs you */}
        <Section
          tone="danger"
          title="Needs you"
          sub="ranked"
          collapsed={!open.needs}
          onToggle={() => toggle("needs")}
        >
          {needsYou.length > 0 ? (
            <div className="space-y-1.5">
              {needsYou.map((job, i) => (
                <FlaggedRow
                  key={job.id}
                  job={job}
                  i={i}
                  active={activeThreadId === job.id}
                  onClick={() => onSelectJob(job)}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 text-xs font-medium text-emerald-600">
              ✓ All clear — every flagged job mitigated.
            </p>
          )}
        </Section>

        {/* Watching */}
        {monitoring.length > 0 && (
          <Section
            tone="warn"
            title="Watching"
            sub="below threshold"
            collapsed={!open.watch}
            onToggle={() => toggle("watch")}
          >
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
          </Section>
        )}

        {/* Recent — the user's conversation history with the agent */}
        <Section
          tone="neutral"
          title="Recent"
          sub="your conversations"
          collapsed={!open.recent}
          onToggle={() => toggle("recent")}
        >
          {recentChats.length > 0 ? (
            <div className="space-y-0.5">
              {recentChats.map((job) => (
                <ChatRow
                  key={job.id}
                  job={job}
                  active={activeThreadId === job.id}
                  resolved={resolvedJobs.has(job.id)}
                  onClick={() => onSelectJob(job)}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 text-xs text-ink-400">
              Your conversations with the agent show up here.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  tone,
  title,
  sub,
  collapsed,
  onToggle,
  children,
}: {
  tone: "danger" | "warn" | "neutral";
  title: string;
  sub: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const color =
    tone === "danger"
      ? "text-rose-600"
      : tone === "warn"
      ? "text-amber-600"
      : "text-ink-500";
  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 hover:bg-ink-50"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 text-ink-400 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
        <span className={cn("text-[11px] font-semibold uppercase tracking-wide", color)}>
          {title}
        </span>
        <span className="text-[11px] text-ink-400">· {sub}</span>
      </button>
      {!collapsed && <div className="mt-1">{children}</div>}
    </div>
  );
}

function FlaggedRow({
  job,
  i,
  active,
  onClick,
}: {
  job: Job;
  i: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.05 }}
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-2.5 text-left transition-all",
        active
          ? "border-brand-400 bg-brand-50 shadow-sm"
          : "border-ink-200 bg-white hover:border-brand-300"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-maroon text-[10px] font-semibold text-white">
            {job.flag!.rank}
          </span>
          <span className="text-xs font-semibold text-ink-800">Job {job.number}</span>
        </div>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
          {KIND_LABEL[job.flag!.kind]}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-ink-500">{job.name}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-ink-400">{job.flag!.costCode}</span>
        <span className="tabular text-xs font-semibold text-rose-600">
          {usdK(job.flag!.marginAtRisk)} at risk
        </span>
      </div>
    </motion.button>
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
          <span className="font-medium text-ink-700">Job {job.number}</span> · {job.name}
        </span>
      </div>
      <span className="tabular shrink-0 text-[11px] text-ink-400">
        {Math.round(job.pctComplete * 100)}%
      </span>
    </button>
  );
}

function ChatRow({
  job,
  active,
  resolved,
  onClick,
}: {
  job: Job;
  active: boolean;
  resolved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors",
        active ? "bg-ink-100" : "hover:bg-ink-100/70"
      )}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="truncate text-xs text-ink-600">
        <span className="font-medium text-ink-700">Job {job.number}</span> · {job.name}
      </span>
      {resolved && (
        <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-600">
          ✓ mitigated
        </span>
      )}
    </button>
  );
}
