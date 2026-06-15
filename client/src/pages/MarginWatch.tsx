import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { FlagCard } from "@/components/marginwatch/FlagCard";
import { PortfolioRail } from "@/components/marginwatch/PortfolioRail";
import {
  PORTFOLIO,
  PORTFOLIO_STATS,
  flaggedJobs,
  monitoringJobs,
  calmJobs,
} from "@/lib/seed";
import { chat } from "@/lib/api";
import { cn, usd, usdK, type DistributiveOmit } from "@/lib/utils";
import type { ChatMessage, Job, Learning } from "@/lib/types";

type Entry =
  | { id: number; kind: "agent"; text: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "flag"; jobId: string }
  | { id: number; kind: "note"; tone: "monitoring" | "calm"; text: string }
  | { id: number; kind: "typing" };

const jobById = (id: string) => PORTFOLIO.find((j) => j.id === id)!;

function buildLearning(job: Job): Learning {
  const f = job.flag!;
  return {
    id: `live-${job.number}`,
    jobNumber: job.number,
    jobName: job.name,
    trade: job.trade,
    costCode: f.costCode,
    costCodeName: f.costCodeName,
    overranPct: f.overPct,
    kind: f.kind,
    text: `Just protected Job ${job.number}: ${f.costCodeName} (${f.costCode}) ran ${f.overPct}% over — benchmark tightened from live actuals.`,
    source: "resolved",
  };
}

export default function MarginWatch({
  onLearn,
  onOpenBid,
}: {
  onLearn: (l: Learning) => void;
  onOpenBid: () => void;
}) {
  const flagged = useMemo(() => flaggedJobs(), []);
  const monitoring = useMemo(() => monitoringJobs(), []);
  const calm = useMemo(() => calmJobs(), []);

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  const [entries, setEntries] = useState<Entry[]>(() => {
    const first = flagged[0];
    return [
      {
        id: nextId(),
        kind: "agent",
        text: `Morning. I'm watching ${PORTFOLIO_STATS.jobsMonitored} active jobs. ${calm.length} are tracking on budget and ${monitoring.length} are drifting but below the line to act on. ${flagged.length} need you — ranked by margin at risk × confidence × time left to act. Starting with the highest exposure:`,
      },
      { id: nextId(), kind: "flag", jobId: first.id },
    ];
  });

  const [shownFlags, setShownFlags] = useState<Set<string>>(
    () => new Set([flagged[0].id])
  );
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [protectedAmt, setProtectedAmt] = useState(
    PORTFOLIO_STATS.marginProtectedBase
  );
  const [activeJobId, setActiveJobId] = useState<string>(flagged[0].id);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  const push = (e: DistributiveOmit<Entry, "id">) =>
    setEntries((prev) => [...prev, { ...e, id: nextId() } as Entry]);

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
    const job = PORTFOLIO.find((j) => j.id === activeJobId);
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
    push({ kind: "typing" } as Entry);
    try {
      const history = [...chatHistory(), { role: "user", content: q } as ChatMessage];
      const { reply } = await chat(history, {
        mode: "margin-watch",
        jobContext: jobContext(),
      });
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      push({ kind: "agent", text: reply });
    } catch {
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      push({
        kind: "agent",
        text: "I lost the connection for a second — but the plan above stands. Approve all and I'll protect the margin on that job.",
      });
    } finally {
      setSending(false);
    }
  }

  function selectJob(job: Job) {
    setActiveJobId(job.id);
    if (job.status === "flagged") {
      push({ kind: "user", text: `Show me Job ${job.number}.` });
      if (!shownFlags.has(job.id)) {
        setShownFlags((s) => new Set(s).add(job.id));
        push({ kind: "flag", jobId: job.id });
      } else {
        push({
          kind: "agent",
          text: `Job ${job.number} is already on the board above — ${job.flag!.summary} Approve the plan when you're ready.`,
        });
      }
    } else if (job.status === "monitoring") {
      push({ kind: "user", text: `What's going on with Job ${job.number}?` });
      push({
        kind: "note",
        tone: "monitoring",
        text: `Job ${job.number} — ${job.driftNote} I'm tracking it; I'll surface a plan the moment it clears the threshold.`,
      });
    } else {
      push({ kind: "user", text: `How's Job ${job.number}?` });
      push({
        kind: "note",
        tone: "calm",
        text: `Job ${job.number} is tracking on budget at ${Math.round(
          job.pctComplete * 100
        )}% complete — margin holding near ${job.projectedMarginPct}%. Nothing to action.`,
      });
    }
  }

  function onResolved(job: Job) {
    setResolved((s) => new Set(s).add(job.id));
    setProtectedAmt((p) => p + job.flag!.recoverable);
    onLearn(buildLearning(job));

    const remaining = flagged.filter(
      (j) => !resolved.has(j.id) && j.id !== job.id
    );
    setTimeout(() => {
      if (remaining.length > 0) {
        const n = remaining[0];
        push({
          kind: "agent",
          text: `Done — ${usd(job.flag!.recoverable)} protected on Job ${
            job.number
          }, and the ${job.flag!.costCodeName} benchmark just got tighter (that feeds your next bid). Next is Job ${
            n.number
          }, ${usdK(n.flag!.marginAtRisk)} at risk. Want me to pull it up?`,
        });
      } else {
        push({
          kind: "agent",
          text: `That clears every job that needs you today — the rest are tracking on budget. Each fix also sharpened a benchmark, so your next bid in the Co-pilot starts from the truth.`,
        });
      }
    }, 650);
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Conversation column */}
      <div className="flex min-h-0 flex-col border-r border-ink-200">
        {/* Tally bar */}
        <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-900">Margin Watch</div>
              <div className="text-[11px] text-ink-500">
                Always-on · your whole portfolio
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Stat value={usd(protectedAmt)} label="margin protected" tone="brand" />
            <div className="hidden h-8 w-px bg-ink-200 sm:block" />
            <Stat
              value={String(PORTFOLIO_STATS.jobsMonitored)}
              label="jobs monitored"
            />
          </div>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-4">
            <AnimatePresence initial={false}>
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
                  {e.kind === "note" && (
                    <NoteBubble tone={e.tone} text={e.text} />
                  )}
                  {e.kind === "flag" && (
                    <FlagCard job={jobById(e.jobId)} onResolved={onResolved} />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-ink-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap gap-2">
              {[
                "Why is it drifting?",
                "Walk me through the plan",
                "What about the other jobs?",
              ].map((c) => (
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
                placeholder="Ask Margin Watch about any job…"
                className="h-11 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <Button type="submit" size="icon" className="h-11 w-11" disabled={sending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <button
              onClick={onOpenBid}
              className="mt-2 flex items-center gap-1 text-[11px] text-ink-400 transition hover:text-brand-600"
            >
              <Sparkles className="h-3 w-3" />
              Closing the loop: each fix sharpens your next bid →
            </button>
          </div>
        </div>
      </div>

      {/* Portfolio rail */}
      <aside className="hidden min-h-0 bg-white lg:block">
        <PortfolioRail
          flagged={flagged}
          monitoring={monitoring}
          calm={calm}
          activeJobId={activeJobId}
          resolvedJobs={resolved}
          onSelect={selectJob}
        />
      </aside>
    </div>
  );
}

/* ---- bubbles ---- */

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

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "brand";
}) {
  return (
    <div className="text-right">
      <div
        className={cn(
          "tabular text-sm font-semibold",
          tone === "brand" ? "text-brand-600" : "text-ink-800"
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-ink-400">
        {label}
      </div>
    </div>
  );
}
