import {
  ChevronRight,
  PanelLeftClose,
  Check,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlagKind, Job, JobFlag } from "@/lib/types";

const ISSUE_LABEL: Record<FlagKind, string> = {
  "added-scope": "Added scope",
  "under-recovery": "Unbilled labor",
  underbid: "Bid gap",
  rework: "Quality rework",
};

type Priority = "high" | "med" | "low";
function priorityOf(f: JobFlag): Priority {
  if (f.marginAtRisk >= 50000 || f.weeksLeftToAct <= 4) return "high";
  if (f.marginAtRisk >= 25000) return "med";
  return "low";
}

type RowStatus = "needs" | "watching" | "resolved";
type DotTone = Priority | "watching" | "resolved";

const DOT_COLOR: Record<Priority | "watching", string> = {
  high: "bg-rose-500",
  med: "bg-amber-500",
  low: "bg-amber-300",
  watching: "bg-ink-300",
};

function toneFor(job: Job, status: RowStatus): DotTone {
  if (status === "resolved") return "resolved";
  if (status === "watching") return "watching";
  return job.flag ? priorityOf(job.flag) : "watching";
}

function StatusDot({ tone, pulse }: { tone: DotTone; pulse?: boolean }) {
  if (tone === "resolved") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-2.5 w-2.5" />
      </span>
    );
  }
  const color = DOT_COLOR[tone];
  return (
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-70",
            color
          )}
        />
      )}
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  );
}

function JtbdRow({
  job,
  status,
  active,
  isNew,
  onClick,
}: {
  job: Job;
  status: RowStatus;
  active: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  const issue =
    status === "resolved"
      ? "Resolved"
      : status === "watching"
      ? "Watching"
      : job.flag
      ? ISSUE_LABEL[job.flag.kind]
      : "Watching";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-ink-100" : "hover:bg-ink-50"
      )}
    >
      <span className="mt-1 shrink-0">
        <StatusDot tone={toneFor(job, status)} pulse={isNew} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              active ? "text-ink-700" : "text-ink-800"
            )}
          >
            {issue}
          </span>
          {isNew && (
            <span className="shrink-0 text-[10px] font-medium text-amber-600">
              new
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-400">
          Job {job.number} · {job.name}
        </span>
      </span>
    </button>
  );
}

export function JobBoard({
  flagged,
  monitoring,
  recent,
  activeThreadId,
  resolvedJobs,
  newlySurfaced,
  collapsed,
  onToggleCollapsed,
  onSelectJob,
  onSelectOverview,
  onNew,
}: {
  flagged: Job[];
  monitoring: Job[];
  recent: Job[];
  activeThreadId: string;
  resolvedJobs: Set<string>;
  newlySurfaced?: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onSelectJob: (job: Job) => void;
  onSelectOverview: () => void;
  onNew?: () => void;
}) {
  const needsYou = flagged.filter((j) => !resolvedJobs.has(j.id));
  const resolvedList = recent.filter(
    (j) =>
      !monitoring.some((m) => m.id === j.id) &&
      !(flagged.some((f) => f.id === j.id) && !resolvedJobs.has(j.id))
  );

  const allJobs: { job: Job; status: RowStatus }[] = [
    ...needsYou.map((job) => ({ job, status: "needs" as RowStatus })),
    ...monitoring.map((job) => ({ job, status: "watching" as RowStatus })),
    ...resolvedList.map((job) => ({ job, status: "resolved" as RowStatus })),
  ];

  if (collapsed) {
    return (
      <StripRail
        allJobs={allJobs}
        activeThreadId={activeThreadId}
        newlySurfaced={newlySurfaced}
        onExpand={onToggleCollapsed}
        onSelectJob={onSelectJob}
        onNew={onNew}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <button
          onClick={onSelectOverview}
          className="text-sm font-semibold text-ink-800 transition-colors hover:text-ink-700"
        >
          Margin Protection Agent
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onNew ?? onSelectOverview}
            aria-label="New conversation"
            title="Start a new conversation"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
          >
            <Plus className="h-4 w-4" />
          </button>
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              aria-label="Collapse"
              className="hidden h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 lg:flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Flat job list */}
      <div className="scroll-thin flex-1 overflow-y-auto px-2 py-1.5">
        {allJobs.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">
            All clear — nothing flagged right now.
          </p>
        ) : (
          allJobs.map(({ job, status }) => (
            <JtbdRow
              key={job.id}
              job={job}
              status={status}
              active={activeThreadId === job.id}
              isNew={job.id === newlySurfaced}
              onClick={() => onSelectJob(job)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------- collapsed status strip */

function StripRail({
  allJobs,
  activeThreadId,
  newlySurfaced,
  onExpand,
  onSelectJob,
  onNew,
}: {
  allJobs: { job: Job; status: RowStatus }[];
  activeThreadId: string;
  newlySurfaced?: string | null;
  onExpand?: () => void;
  onSelectJob: (job: Job) => void;
  onNew?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center bg-white py-2">
      <button
        onClick={onExpand}
        aria-label="Expand"
        className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-600"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {onNew && (
        <button
          onClick={onNew}
          aria-label="New conversation"
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-600"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
      <div className="scroll-thin mt-1 flex w-full flex-1 flex-col gap-0.5 overflow-y-auto px-1.5">
        {allJobs.map(({ job, status }) => (
          <button
            key={job.id}
            onClick={() => onSelectJob(job)}
            title={`Job ${job.number} · ${job.name}`}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors",
              activeThreadId === job.id ? "bg-ink-100" : "hover:bg-ink-50"
            )}
          >
            <StatusDot
              tone={toneFor(job, status)}
              pulse={job.id === newlySurfaced}
            />
            <span
              className={cn(
                "text-[10px] font-semibold",
                activeThreadId === job.id ? "text-ink-700" : "text-ink-500"
              )}
            >
              {job.number}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
