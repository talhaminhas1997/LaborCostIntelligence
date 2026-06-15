import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, ArrowRight, LayoutGrid, BarChart3, ChevronLeft } from "lucide-react";
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
        text: `Morning. Miter has the real-time cost-coded actuals — I forecast where each of these ${PORTFOLIO_STATS.jobsMonitored} active jobs lands at completion and watch every one for drift, so you don't have to. Most are tracking on budget; I only surface the few where margin is genuinely at risk, ranked by dollars at risk and time left to act. ${flagged.length} need you right now — open one to see the drift and a plan ready to approve.`,
      },
      { id: nextId(), kind: "overview" },
    ],
  }));
  const [activeId, setActiveId] = useState<string>(OVERVIEW);
  // Mobile master-detail: show the board, or the open thread (not both).
  const [mobilePane, setMobilePane] = useState<"board" | "thread">("board");

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
          text: `Job ${job.number} — ${job.name}. Here's where ${job.flag!.costCode} ${job.flag!.costCodeName} lands at completion, the exposure, and a plan ready to protect the margin.`,
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
    setMobilePane("thread");
  }
  function openOverview() {
    setActiveId(OVERVIEW);
    setMobilePane("thread");
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
      // Cost-code-level data so the agent can answer detailed questions.
      costCodes: job.costLines.map((c) => ({
        code: c.code,
        name: c.name,
        budgetHrs: c.budgetHours,
        actualHrs: c.actualHours,
        projectedHrs: c.projectedHours,
        overPct: Math.round(c.overrunPct * 100),
      })),
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

  function onResolved(job: Job, actionedDollars: number) {
    setResolved((s) => new Set(s).add(job.id));
    setProtectedAmt((p) => p + actionedDollars);

    const remaining = flagged.filter(
      (j) => !resolved.has(j.id) && j.id !== job.id
    );
    const did =
      actionedDollars > 0
        ? `${usd(actionedDollars)} actioned on Job ${job.number} via change order, and the ${job.flag!.costCodeName} benchmark is updated.`
        : `Reviewed Job ${job.number} — you deferred the action for now.`;
    const next =
      remaining.length > 0
        ? ` ${remaining.length} more need you; Job ${remaining[0].number} is next at ${usdK(
            remaining[0].flag!.marginAtRisk
          )} at risk.`
        : ` That clears every job that needs you today — the rest are tracking on budget.`;
    setThreads((prev) => ({
      ...prev,
      [job.id]: [
        ...(prev[job.id] ?? []),
        { id: nextId(), kind: "agent", text: did + next },
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
      <aside
        className={cn(
          "min-h-0 border-r border-ink-200 lg:block",
          mobilePane === "thread" ? "hidden" : "block"
        )}
      >
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
      <div
        className={cn(
          "min-h-0 flex-col lg:flex",
          mobilePane === "board" ? "hidden" : "flex"
        )}
      >
        <ThreadHeader
          job={activeJob}
          resolved={activeJob ? resolved.has(activeJob.id) : false}
          onBack={() => setMobilePane("board")}
        />

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
                  <div className="space-y-3">
                    <PortfolioRollup
                      flagged={flagged}
                      monitoring={monitoring}
                      calm={calm}
                      mitigated={protectedAmt}
                    />
                    <OverviewList
                      flagged={flagged}
                      monitoring={monitoring}
                      calm={calm}
                      resolved={resolved}
                      onOpen={openJob}
                    />
                  </div>
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

function ThreadHeader({
  job,
  resolved,
  onBack,
}: {
  job: Job | null;
  resolved: boolean;
  onBack: () => void;
}) {
  const Back = () => (
    <button
      onClick={onBack}
      aria-label="Back to job board"
      className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 lg:hidden"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
  if (!job) {
    return (
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-3 py-3 sm:px-6">
        <Back />
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
    <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        <Back />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-maroon">
              Job {job.number}
            </span>
            <span className="truncate text-xs text-ink-500">· {job.name}</span>
          </div>
          <div className="text-[11px] text-ink-500">
            {job.trade} · {job.region} · {Math.round(job.pctComplete * 100)}% installed
          </div>
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

function RollStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "brand";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-400">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-lg font-semibold",
          tone === "danger"
            ? "text-rose-600"
            : tone === "brand"
            ? "text-brand-600"
            : "text-ink-800"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PortfolioRollup({
  flagged,
  monitoring,
  calm,
  mitigated,
}: {
  flagged: Job[];
  monitoring: Job[];
  calm: Job[];
  mitigated: number;
}) {
  const all = [...flagged, ...monitoring, ...calm];
  const total = all.length || 1;
  const totalContract = all.reduce((s, j) => s + j.contractValue, 0);
  const surfacedAtRisk = flagged.reduce((s, j) => s + j.flag!.marginAtRisk, 0);
  const seg = (n: number) => (n / total) * 100;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <BarChart3 className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-ink-900">Portfolio roll-up</h3>
        <span className="text-[11px] text-ink-400">· {all.length} active jobs</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <RollStat label="Contract value" value={`$${(totalContract / 1e6).toFixed(1)}M`} />
        <RollStat label="Surfaced at risk" value={usdK(surfacedAtRisk)} tone="danger" />
        <RollStat label="Risk actioned" value={usd(mitigated)} tone="brand" />
      </div>
      <div className="mt-3.5">
        <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="bg-rose-400" style={{ width: `${seg(flagged.length)}%` }} />
          <div className="bg-amber-400" style={{ width: `${seg(monitoring.length)}%` }} />
          <div className="bg-emerald-400" style={{ width: `${seg(calm.length)}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-500">
          <span className="text-rose-600">● {flagged.length} need you</span>
          <span className="text-amber-600">● {monitoring.length} watching</span>
          <span className="text-emerald-600">● {calm.length} on budget</span>
        </div>
      </div>
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
