import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, ArrowRight, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { FlagCard } from "@/components/marginwatch/FlagCard";
import { JobBoard } from "@/components/marginwatch/JobBoard";
import {
  PORTFOLIO,
  PORTFOLIO_STATS,
  flaggedJobs,
  monitoringJobs,
  calmJobs,
} from "@/lib/seed";
import { chat } from "@/lib/api";
import { cn, usd, usdK, type DistributiveOmit } from "@/lib/utils";
import type { ChatMessage, Job } from "@/lib/types";

type Entry =
  | { id: number; kind: "agent"; text: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "typing" }
  | { id: number; kind: "note"; tone: "monitoring" | "calm"; text: string }
  | { id: number; kind: "flag"; jobId: string }
  | { id: number; kind: "overview" };

const OVERVIEW = "overview";
const jobById = (id: string) => PORTFOLIO.find((j) => j.id === id);

export default function MarginWatch() {
  const flagged = useMemo(() => flaggedJobs(), []);
  const monitoring = useMemo(() => monitoringJobs(), []);
  const calm = useMemo(() => calmJobs(), []);

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  // Per-thread message history. Each job (and the overview) is its own chat.
  const [threads, setThreads] = useState<Record<string, Entry[]>>(() => ({
    [OVERVIEW]: [
      {
        id: nextId(),
        kind: "agent",
        text: `Morning. I'm watching ${PORTFOLIO_STATS.jobsMonitored} active jobs. Most are tracking on budget — I only surface the few where margin is genuinely at risk, ranked by dollars at risk and time left to act. ${flagged.length} need you right now. Open one to see the drift and a plan ready to approve.`,
      },
      { id: nextId(), kind: "overview" },
    ],
  }));
  const [activeId, setActiveId] = useState<string>(OVERVIEW);

  const [resolved, setResolved] = useState<Set<string>>(new Set());
  // Starts at $0 and grows only as you act — no invented baseline.
  const [protectedAmt, setProtectedAmt] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threads, activeId]);

  const entries = threads[activeId] ?? [];

  const push = (e: DistributiveOmit<Entry, "id">) =>
    setThreads((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), { ...e, id: nextId() } as Entry],
    }));

  /** Seed a thread the first time it's opened. */
  function seedThread(job: Job): Entry[] {
    if (job.status === "flagged") {
      return [
        {
          id: nextId(),
          kind: "agent",
          text: `Job ${job.number} — ${job.name}. Here's the exposure on ${job.flag!.costCode} ${job.flag!.costCodeName}, and a plan ready to protect the margin.`,
        },
        { id: nextId(), kind: "flag", jobId: job.id },
      ];
    }
    if (job.status === "monitoring") {
      return [
        {
          id: nextId(),
          kind: "note",
          tone: "monitoring",
          text: `Job ${job.number} — ${job.driftNote} I'm tracking it and will surface a plan the moment it clears the threshold. Ask me anything about it.`,
        },
      ];
    }
    return [
      {
        id: nextId(),
        kind: "note",
        tone: "calm",
        text: `Job ${job.number} is tracking on budget at ${Math.round(
          job.pctComplete * 100
        )}% installed (by field-logged units) — margin holding near ${job.projectedMarginPct}%. Nothing to action, but ask me anything.`,
      },
    ];
  }

  function openJob(job: Job) {
    setThreads((prev) =>
      prev[job.id] ? prev : { ...prev, [job.id]: seedThread(job) }
    );
    setActiveId(job.id);
  }
  function openOverview() {
    setActiveId(OVERVIEW);
  }

  function chatHistory(): ChatMessage[] {
    const msgs: ChatMessage[] = [];
    for (const e of entries) {
      if (e.kind === "user") msgs.push({ role: "user", content: e.text });
      else if (e.kind === "agent" || e.kind === "note")
        msgs.push({ role: "assistant", content: (e as any).text });
    }
    while (msgs.length && msgs[0].role === "assistant") msgs.shift();
    return msgs.slice(-10);
  }

  function jobContext() {
    const job = jobById(activeId);
    if (!job?.flag) return undefined;
    const f = job.flag;
    return {
      jobName: job.name,
      jobNumber: job.number,
      costCode: `${f.costCode} ${f.costCodeName}`,
      overPct: f.overPct,
      kind: f.kind,
      marginImpact: `${f.marginNow}% → ${f.marginAtCompletion}% at completion`,
    };
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    push({ kind: "user", text: q });
    setSending(true);
    push({ kind: "typing" });
    const threadId = activeId;
    try {
      const history = [...chatHistory(), { role: "user", content: q } as ChatMessage];
      const { reply } = await chat(history, {
        mode: "margin-watch",
        jobContext: jobContext(),
      });
      setThreads((prev) => ({
        ...prev,
        [threadId]: [
          ...(prev[threadId] ?? []).filter((e) => e.kind !== "typing"),
          { id: nextId(), kind: "agent", text: reply },
        ],
      }));
    } catch {
      setThreads((prev) => ({
        ...prev,
        [threadId]: [
          ...(prev[threadId] ?? []).filter((e) => e.kind !== "typing"),
          {
            id: nextId(),
            kind: "agent",
            text: "I lost the connection for a second — but the plan stands. Approve all and I'll protect the margin on this job.",
          },
        ],
      }));
    } finally {
      setSending(false);
    }
  }

  function onResolved(job: Job) {
    setResolved((s) => new Set(s).add(job.id));
    setProtectedAmt((p) => p + job.flag!.marginAtRisk);

    const remaining = flagged.filter(
      (j) => !resolved.has(j.id) && j.id !== job.id
    );
    setThreads((prev) => ({
      ...prev,
      [job.id]: [
        ...(prev[job.id] ?? []),
        {
          id: nextId(),
          kind: "agent",
          text:
            remaining.length > 0
              ? `${usd(job.flag!.marginAtRisk)} of exposure mitigated on Job ${
                  job.number
                }, and the ${job.flag!.costCodeName} benchmark just got tighter. ${
                  remaining.length
                } more need you; Job ${remaining[0].number} is next at ${usdK(
                  remaining[0].flag!.marginAtRisk
                )} at risk.`
              : `${usd(job.flag!.marginAtRisk)} of exposure mitigated on Job ${
                  job.number
                }. That clears every job that needs you today — the rest are tracking on budget.`,
        },
      ],
    }));
  }

  const activeJob = activeId === OVERVIEW ? null : jobById(activeId) ?? null;
  const chips =
    activeJob?.status === "flagged"
      ? ["Why is it drifting?", "Walk me through the plan", "Is it recoverable?"]
      : activeJob
      ? ["Why isn't this flagged?", "What would change that?"]
      : ["Which job is worst?", "Summarize my exposure"];

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Job board */}
      <aside className="min-h-0 border-r border-ink-200">
        <JobBoard
          flagged={flagged}
          monitoring={monitoring}
          calm={calm}
          activeThreadId={activeId}
          resolvedJobs={resolved}
          protectedAmt={protectedAmt}
          jobsMonitored={PORTFOLIO_STATS.jobsMonitored}
          onSelectJob={openJob}
          onSelectOverview={openOverview}
        />
      </aside>

      {/* Active thread */}
      <div className="flex min-h-0 flex-col">
        <ThreadHeader job={activeJob} resolved={activeJob ? resolved.has(activeJob.id) : false} />

        <div className="scroll-thin flex-1 overflow-y-auto bg-ink-50/40 px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {entries.map((e) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {e.kind === "agent" && <AgentBubble text={e.text} />}
                {e.kind === "user" && <UserBubble text={e.text} />}
                {e.kind === "typing" && <Typing />}
                {e.kind === "note" && <NoteBubble tone={e.tone} text={e.text} />}
                {e.kind === "flag" && jobById(e.jobId) && (
                  <FlagCard job={jobById(e.jobId)!} onResolved={onResolved} />
                )}
                {e.kind === "overview" && (
                  <OverviewList
                    flagged={flagged}
                    monitoring={monitoring}
                    calm={calm}
                    resolved={resolved}
                    onOpen={openJob}
                  />
                )}
              </motion.div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-ink-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={sending}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  activeJob
                    ? `Ask about Job ${activeJob.number}…`
                    : "Ask Cost Agent about your portfolio…"
                }
                className="h-11 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <Button type="submit" size="icon" className="h-11 w-11" disabled={sending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ subviews */

function ThreadHeader({ job, resolved }: { job: Job | null; resolved: boolean }) {
  if (!job) {
    return (
      <div className="flex items-center gap-2.5 border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-maroon">Overview</div>
          <div className="text-[11px] text-ink-500">
            Portfolio briefing · the few jobs that need you
          </div>
        </div>
      </div>
    );
  }
  const tone =
    job.status === "flagged"
      ? resolved
        ? { chip: "bg-emerald-100 text-emerald-700", label: "Risk mitigated" }
        : { chip: "bg-rose-100 text-rose-700", label: "Needs you" }
      : job.status === "monitoring"
      ? { chip: "bg-amber-100 text-amber-700", label: "Watching" }
      : { chip: "bg-emerald-100 text-emerald-700", label: "On budget" };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-maroon">
            Job {job.number}
          </span>
          <span className="truncate text-xs text-ink-500">· {job.name}</span>
        </div>
        <div className="text-[11px] text-ink-500">
          {job.trade} · {job.region} · {Math.round(job.pctComplete * 100)}% installed
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
          tone.chip
        )}
      >
        {tone.label}
      </span>
    </div>
  );
}

function OverviewList({
  flagged,
  monitoring,
  calm,
  resolved,
  onOpen,
}: {
  flagged: Job[];
  monitoring: Job[];
  calm: Job[];
  resolved: Set<string>;
  onOpen: (job: Job) => void;
}) {
  return (
    <div className="space-y-2">
      {flagged.map((job) => {
        const done = resolved.has(job.id);
        return (
          <button
            key={job.id}
            onClick={() => onOpen(job)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all",
              done
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-ink-200 bg-white hover:border-brand-300 hover:shadow-soft"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-900 text-[11px] font-semibold text-white">
                {job.flag!.rank}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink-800">
                  Job {job.number} · {job.name}
                </div>
                <div className="truncate text-xs text-ink-500">
                  {job.flag!.costCode} {job.flag!.costCodeName} · {job.flag!.overPct}% over
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "tabular text-sm font-semibold",
                  done ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {done ? `✓ plan run` : `${usdK(job.flag!.marginAtRisk)}`}
              </span>
              <ArrowRight className="h-4 w-4 text-ink-300" />
            </div>
          </button>
        );
      })}
      <p className="px-1 pt-1 text-xs text-ink-500">
        {monitoring.length} more drifting but below the line to act on · {calm.length}{" "}
        tracking on budget. Open any job on the left for its own thread.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ bubbles */

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-ink-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-ink-700 shadow-soft">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

function NoteBubble({
  tone,
  text,
}: {
  tone: "monitoring" | "calm";
  text: string;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm leading-relaxed shadow-soft",
          tone === "monitoring"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
        )}
      >
        {text}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-ink-200 bg-white px-4 py-3 shadow-soft">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-ink-300"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}
