import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, LayoutGrid, BarChart3, ChevronLeft, ChevronDown } from "lucide-react";
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

// Marks where the AI answer ends and the demo disclaimer begins (rendered muted).
const DISCLAIMER_SENTINEL = "␟";
const SEED_DISCLAIMER =
  "Illustrative — figures from seeded demo data, not a live feed.";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
        text: `Morning. I forecast cost-at-completion for all ${PORTFOLIO_STATS.jobsMonitored} active jobs off Miter's live actuals and watch each for drift — surfacing only the few where margin is genuinely at risk. ${flagged.length} need you today; open one on the left for the drift and a plan to approve.`,
      },
    ],
  }));
  const [activeId, setActiveId] = useState<string>(OVERVIEW);
  // Mobile master-detail: show the board, or the open thread (not both).
  const [mobilePane, setMobilePane] = useState<"board" | "thread">("board");
  // Threads the user has opened, most-recent first — their chat history.
  const [history, setHistory] = useState<string[]>([]);
  // Let the user collapse the portfolio panel for a bigger conversation.
  const [rollupCollapsed, setRollupCollapsed] = useState(false);

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
    setHistory((h) => [job.id, ...h.filter((id) => id !== job.id)]);
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
        msgs.push({
          role: "assistant",
          content: (e as any).text.split(DISCLAIMER_SENTINEL)[0].trim(),
        });
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

  /** Deterministic, data-grounded answers for the common questions — so the
   *  demo never hedges or invents figures. Returns null to fall back to the LLM. */
  function seededReply(q: string): string | null {
    const s = q.toLowerCase();
    const job = jobById(activeId);
    const k = (n: number) => usdK(n);

    if (job?.flag) {
      const f = job.flag;
      if (/not.*billable|isn'?t.*billable|what if.*(scope|billable)|our productivity|inefficien/.test(s))
        return `Then it's a productivity problem, not a recovery — no change order goes out. I'd flag the crew/sequence issue on ${f.costCode} ${f.costCodeName}, reforecast the margin at the true rate, and write it back so the next bid carries it.`;
      if (/confiden|how.*sure|how.*know|trust/.test(s))
        return `${cap(f.confidenceLabel)} confidence. The burn-rate forecast firms up as more of the job is booked, and you're ${Math.round(job.pctComplete * 100)}% in here. Acting now matters because ${f.weeksLeftToAct} weeks of work are still ahead — there's runway to bend the curve.`;
      if (/why.*(drift|over|driv)|what.*driv/.test(s))
        return `${f.why || f.summary} The driver is ${f.costCode} ${f.costCodeName} — ${f.overPct}% over, pulling projected margin from ${f.marginNow}% to ${f.marginAtCompletion}% if it's left alone.`;
      if (/walk.*(through|plan)|the plan|what.*step|steps?\b/.test(s)) {
        const steps = f.plan
          .map((p, i) => `${i + 1}. ${p.label}${p.decision ? "  — your call" : ""}`)
          .join("\n");
        return `Here's the ${f.plan.length}-step plan for Job ${job.number}:\n${steps}\n\nThe steps marked "your call" pause for your decision; the rest I run on your approval.`;
      }
      if (/recover|claw|get.*back|billable|salvage/.test(s))
        return `${cap(f.recoverability)} recoverability. ${f.why || f.summary} You've got ${f.weeksLeftToAct} weeks of work left to act while it's still recoverable.`;
    }

    if (job && !job.flag) {
      if (/why.*not.*flag|why isn'?t|not flagged/.test(s))
        return `Job ${job.number} is drifting but below the surfacing bar${job.driftNote ? ` — ${job.driftNote}` : " — the dollars at risk and time-to-act don't clear the threshold yet"}. Flagging it now would just be noise.`;
      if (/what.*change|when.*flag|what.*trigger/.test(s))
        return `It surfaces the moment the projected overrun clears the dollar threshold with enough job left to act on. I'm watching the burn rate and will flag it then.`;
    }

    if (/worst|which job|biggest|top |priorit|tackle first/.test(s)) {
      const w = flagged.find((j) => !resolved.has(j.id)) || flagged[0];
      if (!w?.flag) return null;
      const f = w.flag;
      return `Job ${w.number} — ${w.name} is your worst exposure: ${f.costCodeName} ${f.overPct}% over, ${k(f.marginAtRisk)} at risk with ${f.weeksLeftToAct} weeks left to act. ${cap(f.recoverability)} recoverability — it's ${f.driverLabel.toLowerCase()}. It ranks #1 because it pairs the biggest dollars at risk with enough runway to actually recover. Open it and I'll walk the plan.`;
    }
    if (/exposure|summar|portfolio|across|overall|total/.test(s)) {
      const total = flagged.reduce((sum, j) => sum + (j.flag?.marginAtRisk || 0), 0);
      const lines = flagged
        .map(
          (j) =>
            `• Job ${j.number} — ${k(j.flag!.marginAtRisk)} (${j.flag!.costCodeName} ${j.flag!.overPct}% over, ${j.flag!.driverLabel.toLowerCase()})`
        )
        .join("\n");
      return `Across ${PORTFOLIO_STATS.jobsMonitored} active jobs, ${flagged.length} need you — about ${k(total)} at risk in total:\n${lines}\n\n${monitoring.length} more are drifting below the surfacing line; the other ${calm.length} are tracking on budget. The driver is labor-heavy cost codes burning hours faster than units convert.`;
    }
    if (/next.*worst|next.*job|what.*next/.test(s)) {
      const n =
        flagged.find((j) => !resolved.has(j.id) && j.id !== activeId) ||
        flagged.find((j) => j.id !== activeId);
      if (!n?.flag) return `That clears everything that needs you — the rest are tracking on budget.`;
      const nf = n.flag;
      return `Next is Job ${n.number} — ${n.name}: ${nf.costCodeName} ${nf.overPct}% over, ${k(nf.marginAtRisk)} at risk, ${cap(nf.recoverability)} recoverability. Open it from the board when you're ready and I'll walk the plan.`;
    }
    if (/protect|mitigat|how much.*(saved|actioned|done|protect)/.test(s)) {
      const doneN = resolved.size;
      const left = flagged.filter((j) => !resolved.has(j.id)).length;
      return `You've actioned ${usd(protectedAmt)} across ${doneN} job${doneN === 1 ? "" : "s"} so far. ${left > 0 ? `${left} still need you.` : "That clears every job flagged today."}`;
    }
    if (/(drift|over).*(not.*flag|below|watch)|not flagged|what.*watch|monitor/.test(s)) {
      if (!monitoring.length) return `Nothing's drifting below the line right now — everything's either flagged or on budget.`;
      const lines = monitoring
        .map((j) => `• Job ${j.number} — ${Math.round(j.pctComplete * 100)}% in${j.driftNote ? `, ${j.driftNote}` : ""}`)
        .join("\n");
      return `${monitoring.length} are drifting but below the surfacing bar:\n${lines}\nI'm watching them and will surface a plan the moment one clears the threshold.`;
    }
    if (/why.*(flag|these|surfac)|criteria|how.*decide/.test(s)) {
      return `I score every drifting job by dollars at risk × how confident the forecast is × how much runway you have to act — then surface only what clears the bar. ${flagged.length} cleared it today; ${monitoring.length} are drifting below the line, and ${calm.length} are tracking on budget.`;
    }
    return null;
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    push({ kind: "user", text: q });
    setSending(true);
    push({ kind: "typing" });
    const threadId = activeId;
    const withDisclaimer = (reply: string) =>
      `${reply}\n\n${DISCLAIMER_SENTINEL}${SEED_DISCLAIMER}`;
    const land = (reply: string) =>
      setThreads((prev) => ({
        ...prev,
        [threadId]: [
          ...(prev[threadId] ?? []).filter((e) => e.kind !== "typing"),
          { id: nextId(), kind: "agent", text: withDisclaimer(reply) },
        ],
      }));

    // Common questions answer deterministically from the seeded portfolio.
    const seeded = seededReply(q);
    if (seeded) {
      await new Promise((r) => window.setTimeout(r, 650));
      land(seeded);
      setSending(false);
      return;
    }

    try {
      const history = [...chatHistory(), { role: "user", content: q } as ChatMessage];
      const { reply } = await chat(history, {
        mode: "margin-watch",
        jobContext: jobContext(),
      });
      land(reply);
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

  /** Next-step suggestions that adapt to the conversation — the agent drops
   *  what's been covered and proposes the next thing worth asking. */
  function suggestChips(): string[] {
    const askedTexts = entries
      .filter((e) => e.kind === "user")
      .map((e) => (e as any).text.toLowerCase());
    const asked = (re: RegExp) => askedTexts.some((t) => re.test(t));
    const fromPool = (
      pool: { chip: string; re: RegExp }[],
      forward: string[]
    ) => {
      const left = pool.filter((p) => !asked(p.re)).map((p) => p.chip);
      return (left.length >= 2 ? left : [...left, ...forward]).slice(0, 3);
    };

    // A flagged job already resolved → propose moving on.
    if (activeJob?.flag && resolved.has(activeJob.id)) {
      return [
        "What's the next-worst job?",
        "How much have I protected?",
        "What's drifting but not flagged?",
      ];
    }

    if (activeJob?.flag) {
      return fromPool(
        [
          { chip: "Why is it drifting?", re: /why.*(drift|over|driv)|what.*driv/ },
          { chip: "Is it recoverable?", re: /recover|claw|billable|salvage/ },
          { chip: "Walk me through the plan", re: /walk.*through|the plan|steps?\b/ },
          { chip: "How confident are you?", re: /confiden|how.*sure|how.*know|trust/ },
        ],
        ["What if the scope isn't billable?", "What's the next-worst job?"]
      );
    }

    if (activeJob) {
      return ["Why isn't this flagged?", "What would change that?", "Which job is worst?"];
    }

    // Overview
    return fromPool(
      [
        { chip: "Which job is worst?", re: /worst|which job|biggest|top |priorit/ },
        { chip: "Summarize my exposure", re: /exposure|summar|portfolio|across|overall|total/ },
        { chip: "Why are these flagged?", re: /why.*(flag|these)|surfac|criteria|how.*decide/ },
        { chip: "What's drifting but not flagged?", re: /watch|below.*threshold|not flagged|monitor/ },
      ],
      ["Which should I tackle first?"]
    );
  }
  const chips = suggestChips();

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
          recent={history.map((id) => jobById(id)).filter(Boolean) as Job[]}
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

        {/* Portfolio roll-up — pinned under the Overview header; collapsible */}
        {activeId === OVERVIEW && (
          <div className="border-b border-ink-200 bg-white px-4 pt-4 sm:px-6">
            <div className="mx-auto max-w-2xl pb-4">
              <PortfolioRollup
                flagged={flagged}
                monitoring={monitoring}
                calm={calm}
                mitigated={protectedAmt}
                collapsed={rollupCollapsed}
                onToggle={() => setRollupCollapsed((c) => !c)}
              />
            </div>
          </div>
        )}

        <div className="scroll-thin flex-1 overflow-y-auto bg-neutral-50/40 px-4 py-5 sm:px-6">
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
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 transition hover:border-ink-300 hover:text-maroon disabled:opacity-50"
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
                    : "Ask Margin Agent about your portfolio…"
                }
                className="h-11 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-sm outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-100"
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-maroon/5 text-maroon">
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
        ? { chip: "bg-emerald-100 text-emerald-700", label: "Handled" }
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
            ? "text-maroon"
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
  collapsed,
  onToggle,
}: {
  flagged: Job[];
  monitoring: Job[];
  calm: Job[];
  mitigated: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const all = [...flagged, ...monitoring, ...calm];
  const total = all.length || 1;
  const totalContract = all.reduce((s, j) => s + j.contractValue, 0);
  const surfacedAtRisk = flagged.reduce((s, j) => s + j.flag!.marginAtRisk, 0);
  const seg = (n: number) => (n / total) * 100;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-soft">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-maroon/5 text-maroon">
          <BarChart3 className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-ink-900">Portfolio roll-up</h3>
        {collapsed ? (
          <span className="tabular text-[11px] text-ink-400">
            · <span className="font-medium text-rose-600">{usdK(surfacedAtRisk)}</span> at risk · {flagged.length} need you
          </span>
        ) : (
          <span className="text-[11px] text-ink-400">· {all.length} active jobs</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-ink-400 transition-transform",
            collapsed && "-rotate-90"
          )}
        />
      </button>
      {!collapsed && (
        <>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <RollStat label="Contract value" value={`$${(totalContract / 1e6).toFixed(1)}M`} />
        <RollStat label="Surfaced at risk" value={usdK(surfacedAtRisk)} tone="danger" />
        <RollStat label="Acted on" value={usd(mitigated)} tone="brand" />
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
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ bubbles */

function AgentBubble({ text }: { text: string }) {
  text = text ?? "";
  const cut = text.indexOf(DISCLAIMER_SENTINEL);
  const body = cut >= 0 ? text.slice(0, cut).trimEnd() : text;
  const disclaimer =
    cut >= 0 ? text.slice(cut + DISCLAIMER_SENTINEL.length).trim() : null;
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-ink-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-ink-700 shadow-soft">
        <p className="whitespace-pre-line">{body}</p>
        {disclaimer && (
          <p className="mt-2 border-t border-ink-100 pt-1.5 text-[11px] italic leading-snug text-ink-400">
            {disclaimer}
          </p>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-maroon px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
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
