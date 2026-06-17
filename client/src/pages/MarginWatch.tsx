import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Logo } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { FlagCard, type FlagCardHandle } from "@/components/marginwatch/FlagCard";
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
import { GATE_META, type GateCategory } from "@/lib/engine";
import type { ChatMessage, FlagKind, Job } from "@/lib/types";

type Entry =
  | { id: number; kind: "agent"; text: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "typing" }
  | { id: number; kind: "note"; tone: "monitoring" | "calm"; text: string }
  | { id: number; kind: "progress"; text: string }
  | { id: number; kind: "flag"; jobId: string }
  | { id: number; kind: "overview" }
  | { id: number; kind: "cta"; action: "reveal-plan"; jobId: string; label: string };

const OVERVIEW = "overview";
// Flags the agent holds back and surfaces one-per-resolve, in this order — the
// "it never stops watching" drip. Three of them → six jobs surface in all.
const INCOMING_IDS = ["j318", "j256", "j401"];
const jobById = (id: string) => PORTFOLIO.find((j) => j.id === id);

// Marks where the AI answer ends and the demo disclaimer begins (rendered muted).
const DISCLAIMER_SENTINEL = "␟";
const SEED_DISCLAIMER =
  "Illustrative — figures from seeded demo data, not a live feed.";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The consultant's opening: like a good management consultant, the agent frames
 * the situation, recommends a play with the reasoning, names the one risk worth
 * managing and how it mitigates it, then drives toward starting the work.
 */
const PLAY: Record<
  FlagKind,
  { play: string; why: (cc: string) => string; risk: string; mitig: string }
> = {
  "added-scope": {
    play: "bill the owner-directed work back as a change order",
    why: (cc) =>
      `the overage on ${cc} traces to ASI-014 and RFI-022 — that's added scope you're owed for, not your crew's inefficiency, and it's recoverable if we move inside the change-notice window`,
    risk: "the GC pushes back on entitlement",
    mitig:
      "I'll attach the labor backup and the ASI narrative so the case is airtight before anything goes out",
  },
  "under-recovery": {
    play: "recover the billable T&M that never got ticketed",
    why: (cc) =>
      `the ${cc} hours are legitimately billable under CO-003 — they just weren't captured before they aged`,
    risk: "a few tickets are past the 30-day sign-off window",
    mitig:
      "I'll flag the at-risk ones and send a cover note rather than gamble the whole claim",
  },
  underbid: {
    play: "get ahead of the bid gap — protect the back half and fix the next estimate",
    why: (cc) =>
      `there are no change events on ${cc}, so this reads as a bid miss, not recoverable scope — the real win is keeping the next job from inheriting it`,
    risk: "there's actually GC-driven inefficiency we could claim",
    mitig: "I'll confirm that diagnosis with you before we absorb a dollar",
  },
  rework: {
    play: "carry a clean rework allowance and price it into the next bid",
    why: (cc) =>
      `the rework on ${cc} is mostly sunk — the value here is making sure it doesn't quietly repeat`,
    risk: "little downside — this is bookkeeping plus a benchmark update",
    mitig: "I'll just confirm the allowance with you",
  },
};

/** Portfolio-level greeting — replaces the static chart with a conversational brief. */
function buildPortfolioGreeting(
  surfacedFlagged: Job[],
  watching: Job[],
  totalJobs: number
): string {
  if (surfacedFlagged.length === 0) {
    return `Morning — nothing needs your attention right now. All ${totalJobs} jobs I'm tracking are on budget or below the surfacing threshold. I'll flag anything the moment it drifts into action territory.`;
  }

  const top = surfacedFlagged[0];
  const tf = top.flag!;
  const priorityLine = `Job ${top.number} is the priority: ${tf.costCodeName} running ${tf.overPct}% over, ${usdK(tf.marginAtRisk)} at risk — and the play is to ${PLAY[tf.kind].play}.`;

  const others = surfacedFlagged.slice(1);
  const othersLine =
    others.length > 0
      ? ` ${others.map((j) => `Job ${j.number} (${usdK(j.flag!.marginAtRisk)} at risk)`).join(", ")} ${others.length === 1 ? "is" : "are"} also flagged.`
      : "";

  const watchLine =
    watching.length > 0
      ? ` ${watching.length} more ${watching.length === 1 ? "is" : "are"} drifting below the threshold — I'm watching ${watching.length === 1 ? "it" : "them"} and will surface a plan the moment one crosses.`
      : "";

  return `Morning — ${surfacedFlagged.length} job${surfacedFlagged.length === 1 ? "" : "s"} need${surfacedFlagged.length === 1 ? "s" : ""} your attention out of ${totalJobs} I'm tracking.\n\n${priorityLine}${othersLine}${watchLine}\n\nOpen one on the left and I'll walk you through what I've put together.`;
}

function consultantBrief(job: Job): string {
  const f = job.flag!;
  const p = PLAY[f.kind];
  return [
    `Job ${job.number} — ${job.name}. ${f.summary} Left alone, margin slips ${f.marginNow}% → ${f.marginAtCompletion}% — about ${usdK(
      f.marginAtRisk
    )}.`,
    `My read: ${p.play} — ${p.why(f.costCodeName)}. Let me walk you through how I'd protect it. I'll handle the legwork and only stop you where I need a call.`,
  ].join("\n\n");
}

export default function MarginWatch() {
  // allFlagged holds all six; `flagged` is only what's been surfaced so far, so
  // every count/answer below keeps reading the live, growing list for free.
  const allFlagged = useMemo(() => flaggedJobs(), []);
  const [surfaced, setSurfaced] = useState<Set<string>>(
    () =>
      new Set(
        allFlagged.filter((j) => !INCOMING_IDS.includes(j.id)).map((j) => j.id)
      )
  );
  const flagged = useMemo(
    () => allFlagged.filter((j) => surfaced.has(j.id)),
    [allFlagged, surfaced]
  );
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
        text: buildPortfolioGreeting(
          flagged,
          monitoring,
          PORTFOLIO_STATS.jobsMonitored
        ),
      },
    ],
  }));
  const [activeId, setActiveId] = useState<string>(OVERVIEW);
  // Mobile master-detail: show the board, the conversation, or the living plan.
  const [mobilePane, setMobilePane] = useState<"board" | "thread" | "plan">(
    "board"
  );
  // The rail collapses to a thin status strip while you work a flagged job, so
  // the conversation + living plan get room (Claude-Code-agent style split).
  const [railCollapsed, setRailCollapsed] = useState(false);
  // The autonomy control panel (gear) — review/retune per-category approvals.
  const [autonomyOpen, setAutonomyOpen] = useState(false);
  // Threads the user has opened, most-recent first — their chat history.
  const [history, setHistory] = useState<string[]>([]);

  // Tracks which flagged jobs have had their plan revealed (Phase 1 → Phase 2).
  const [planRevealedByJob, setPlanRevealedByJob] = useState<
    Record<string, boolean>
  >({});

  const [resolved, setResolved] = useState<Set<string>>(new Set());
  // Per-category approval preference, shared across every job this session.
  // Everything defaults to "ask" — the agent never writes without approval until
  // the PM explicitly grants autonomy for that category.
  const [autonomy, setAutonomy] = useState<Record<GateCategory, "ask" | "auto">>(
    () => ({
      judgment: "ask",
      money: "ask",
      "external-msg": "ask",
      "internal-msg": "ask",
      estimating: "ask",
      budget: "ask",
    })
  );
  const setCategoryAuto = (c: GateCategory) =>
    setAutonomy((a) => ({ ...a, [c]: "auto" }));
  // Starts at $0 and grows only as you act — no invented baseline.
  const [protectedAmt, setProtectedAmt] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Proactive surfacing: a transient "NEW" highlight on the board, and a toast
  // when the PM is heads-down on a different thread. dripRef caps the drip at 3.
  const [newlySurfaced, setNewlySurfaced] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; jobId: string; text: string } | null>(
    null
  );
  // True for the ~1.5s "agent is checking" beat right before a flag surfaces.
  const [scanning, setScanning] = useState(false);
  const dripRef = useRef(0);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threads, activeId]);

  // Daily follow-up: while a job stays open, the agent checks back like a
  // colleague would — here simulated as one warm nudge shortly after you land.
  const flagCardRef = useRef<FlagCardHandle>(null);
  // Mount point for the approval gate — sits above the chat bar, so every
  // agent→PM ask lives in the conversation (left), not a centred pop-up.
  const [gateSlot, setGateSlot] = useState<HTMLDivElement | null>(null);
  const nudgedRef = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (nudgedRef.current) return;
      const open = flagged.filter((j) => !resolved.has(j.id) && j.flag);
      if (!open.length) return;
      nudgedRef.current = true;
      const top = open[0];
      const mins = Math.max(2, Math.round(top.flag!.plan.length / 2));
      setThreads((prev) => ({
        ...prev,
        [OVERVIEW]: [
          ...(prev[OVERVIEW] ?? []),
          {
            id: nextId(),
            kind: "agent",
            text: `Following up from yesterday — Job ${top.number}'s ${top.flag!.costCodeName} item is still open. It's a quick one, ~${mins} min to walk to done together. Want to knock it out now? I'll keep checking back till it's closed.`,
          },
        ],
      }));
    }, 5500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = threads[activeId] ?? [];

  const push = (e: DistributiveOmit<Entry, "id">) =>
    setThreads((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), { ...e, id: nextId() } as Entry],
    }));

  /** Seed a thread the first time it's opened. */
  function seedThread(job: Job): Entry[] {
    if (job.status === "flagged") {
      // Phase 1 opening — one-liner hook. The full briefing sequence is
      // driven by openJob() with typing beats and timed messages.
      return [
        {
          id: nextId(),
          kind: "agent",
          text: `Job ${job.number} — ${job.name}. I've been watching this one. Let me give you the quick read.`,
        },
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
    const isNew = !threads[job.id];
    setThreads((prev) =>
      prev[job.id] ? prev : { ...prev, [job.id]: seedThread(job) }
    );
    setHistory((h) => [job.id, ...h.filter((id) => id !== job.id)]);
    setActiveId(job.id);
    setMobilePane("thread");
    setRailCollapsed(!!job.flag);

    // Phase 1 briefing sequence — runs once on first open of a flagged job.
    // Two messages with typing beats, then a plan CTA.
    if (isNew && job.flag) {
      const f = job.flag;
      const p = PLAY[f.kind];
      const visibleSteps = f.plan.filter((s) => !s.feedsBenchmark).length;

      // Beat 1 — situation (the cost driver + dollars at risk)
      window.setTimeout(() => {
        setThreads((prev) => ({
          ...prev,
          [job.id]: [
            ...(prev[job.id] ?? []),
            { id: nextId(), kind: "typing" },
          ],
        }));
      }, 700);
      window.setTimeout(() => {
        setThreads((prev) => ({
          ...prev,
          [job.id]: [
            ...(prev[job.id] ?? []).filter((e) => e.kind !== "typing"),
            {
              id: nextId(),
              kind: "agent",
              text: `${f.summary} ${cap(
                p.why(f.costCodeName)
              )}. ${usdK(f.marginAtRisk)} at risk — ${f.recoverability} recoverability.`,
            },
          ],
        }));
      }, 1700);

      // Beat 2 — plan intro + CTA button
      window.setTimeout(() => {
        setThreads((prev) => ({
          ...prev,
          [job.id]: [
            ...(prev[job.id] ?? []),
            { id: nextId(), kind: "typing" },
          ],
        }));
      }, 2400);
      window.setTimeout(() => {
        setThreads((prev) => ({
          ...prev,
          [job.id]: [
            ...(prev[job.id] ?? []).filter((e) => e.kind !== "typing"),
            {
              id: nextId(),
              kind: "agent",
              text: `I've drafted a ${visibleSteps}-step plan to ${p.play}. The main calls are yours — I handle the legwork and only stop where I need a decision from you.`,
            },
            {
              id: nextId(),
              kind: "cta",
              action: "reveal-plan" as const,
              jobId: job.id,
              label: `See the plan (${visibleSteps} steps) →`,
            },
          ],
        }));
      }, 3700);
    }
  }

  /** Reveal the living plan on the right — transitions Phase 1 → Phase 2. */
  function revealPlan(jobId: string) {
    setPlanRevealedByJob((prev) => ({ ...prev, [jobId]: true }));
    const job = jobById(jobId);
    if (!job?.flag) return;
    const f = job.flag;
    const visibleSteps = f.plan.filter((s) => !s.feedsBenchmark).length;
    // Short delay so the panel appears first, then the follow-up lands.
    window.setTimeout(() => {
      setThreads((prev) => ({
        ...prev,
        [jobId]: [
          ...(prev[jobId] ?? []),
          {
            id: nextId(),
            kind: "agent",
            text: `There it is — ${visibleSteps} steps. The decisions that need you are marked. Want to walk through it together, or should I just run it?`,
          },
        ],
      }));
    }, 350);
  }

  function openOverview() {
    setActiveId(OVERVIEW);
    setMobilePane("thread");
    setRailCollapsed(false);
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

    // Plain-English plan edits ("skip the GC letter", "bill only $40k") are
    // handled by the living plan itself — it updates and the agent confirms.
    const activeJobNow = jobById(activeId);
    if (activeJobNow?.flag && flagCardRef.current) {
      const edit = flagCardRef.current.applyPlanEdit(q);
      if (edit.ok) {
        await new Promise((r) => window.setTimeout(r, 500));
        setThreads((prev) => ({
          ...prev,
          [threadId]: [
            ...(prev[threadId] ?? []).filter((e) => e.kind !== "typing"),
            { id: nextId(), kind: "agent", text: edit.reply },
          ],
        }));
        setSending(false);
        return;
      }
    }

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

  /** Show the ~1.5s "scanning live actuals" beat, then surface the flag — so the
   *  reveal feels like the agent caught it, landing ~5s after you cleared a job. */
  function startScan() {
    if (dripRef.current >= INCOMING_IDS.length) return;
    setScanning(true);
    window.setTimeout(surfaceNext, 1500);
  }

  /** Reveal the next held-back flag. On the overview the agent posts a proactive
   *  heads-up message; if the PM is heads-down elsewhere, a 3s toast instead. */
  function surfaceNext() {
    setScanning(false);
    const idx = dripRef.current;
    if (idx >= INCOMING_IDS.length) return;
    const id = INCOMING_IDS[idx];
    dripRef.current = idx + 1;
    const job = allFlagged.find((j) => j.id === id);
    if (!job?.flag) return;
    const f = job.flag;

    setSurfaced((s) => new Set(s).add(id));
    setNewlySurfaced(id);
    window.setTimeout(
      () => setNewlySurfaced((cur) => (cur === id ? null : cur)),
      6000
    );

    const headline = `Job ${job.number} — ${job.name}: ${f.costCodeName} ${f.overPct}% over, ${usdK(
      f.marginAtRisk
    )} at risk`;

    if (activeIdRef.current === OVERVIEW) {
      setThreads((prev) => ({
        ...prev,
        [OVERVIEW]: [
          ...(prev[OVERVIEW] ?? []),
          {
            id: nextId(),
            kind: "agent",
            text: `Heads up — a new job just crossed the line while you were working. ${headline}. ${cap(
              f.recoverability
            )} recoverability; I've added it to your queue on the left.\n\n${DISCLAIMER_SENTINEL}${SEED_DISCLAIMER}`,
          },
        ],
      }));
    } else {
      const tid = nextId();
      setToast({ id: tid, jobId: id, text: headline });
      window.setTimeout(
        () => setToast((t) => (t && t.id === tid ? null : t)),
        3000
      );
    }
  }

  function onResolved(job: Job, actionedDollars: number) {
    setResolved((s) => new Set(s).add(job.id));
    setProtectedAmt((p) => p + actionedDollars);

    const remaining = flagged.filter(
      (j) => !resolved.has(j.id) && j.id !== job.id
    );
    const f = job.flag!;

    let closeMsg: string;
    if (actionedDollars > 0) {
      const nextPart =
        remaining.length > 0
          ? ` Job ${remaining[0].number} is next when you're ready.`
          : ` That clears everything on your plate today — well played.`;
      closeMsg =
        `That's a wrap on Job ${job.number}. ${usd(actionedDollars)} actioned on ${f.costCodeName} — change order drafted, budget rebaselined, team briefed. ` +
        `I'll keep this cost code on my radar; if the same pattern shows on a future bid, I'll catch it before it bites.${nextPart}`;
    } else {
      const nextPart =
        remaining.length > 0 ? ` Job ${remaining[0].number} is still waiting.` : "";
      closeMsg = `Reviewed Job ${job.number} — you've deferred for now. I'll keep it open and check back.${nextPart}`;
    }

    setThreads((prev) => ({
      ...prev,
      [job.id]: [
        ...(prev[job.id] ?? []),
        { id: nextId(), kind: "agent", text: closeMsg },
      ],
    }));

    // The agent keeps watching: ~3.5s of quiet, then a visible scan, then the
    // next held-back flag surfaces at ~5s (up to 3) — the queue never feels done.
    if (dripRef.current < INCOMING_IDS.length) {
      window.setTimeout(startScan, 3500);
    }
  }

  const activeJob = activeId === OVERVIEW ? null : jobById(activeId) ?? null;
  const isFlaggedOpen = !!activeJob?.flag;
  const planVisible = isFlaggedOpen && !!planRevealedByJob[activeJob?.id ?? ""];

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

    // Phase 1 — plan not revealed yet; offer discovery questions
    if (isFlaggedOpen && !planVisible) {
      return fromPool(
        [
          { chip: "Why is it drifting?", re: /why.*(drift|over|driv)|what.*driv/ },
          { chip: "Is it recoverable?", re: /recover|claw|billable|salvage/ },
          { chip: "How confident are you?", re: /confiden|how.*sure|how.*know|trust/ },
        ],
        ["What's the biggest risk?"]
      );
    }

    // Phase 3 — resolved
    if (activeJob?.flag && resolved.has(activeJob.id)) {
      return [
        "What's the next-worst job?",
        "How much have I protected?",
        "What's drifting but not flagged?",
      ];
    }

    // Phase 2 — plan visible, executing
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

  const gridCols = planVisible
    ? railCollapsed
      ? "lg:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)]"
      : "lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]"
    : railCollapsed
    ? "lg:grid-cols-[56px_minmax(0,1fr)]"
    : "lg:grid-cols-[300px_minmax(0,1fr)]";

  return (
    <div className={cn("grid h-[calc(100vh-3.5rem)] grid-cols-1", gridCols)}>
      {/* Jobs rail */}
      <aside
        className={cn(
          "min-h-0 border-r border-ink-200 lg:block",
          mobilePane === "board" ? "block" : "hidden"
        )}
      >
        <JobBoard
          flagged={flagged}
          monitoring={monitoring}
          recent={history.map((id) => jobById(id)).filter(Boolean) as Job[]}
          activeThreadId={activeId}
          resolvedJobs={resolved}
          newlySurfaced={newlySurfaced}
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed((c) => !c)}
          onSelectJob={openJob}
          onSelectOverview={openOverview}
          onNew={openOverview}
        />
      </aside>

      {/* Conversation */}
      <div
        className={cn(
          "min-h-0 flex-col lg:flex",
          mobilePane === "thread" ? "flex" : "hidden"
        )}
      >
        <ThreadHeader
          job={activeJob}
          resolved={activeJob ? resolved.has(activeJob.id) : false}
          onBack={() => setMobilePane("board")}
          onSettings={() => setAutonomyOpen(true)}
          rightSlot={
            planVisible ? (
              <button
                onClick={() => setMobilePane("plan")}
                className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 lg:hidden"
              >
                Plan <ChevronRight className="h-3 w-3" />
              </button>
            ) : null
          }
        />

        <div className="scroll-thin flex-1 overflow-y-auto bg-neutral-50/40 px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {entries
              .filter((e) => e.kind !== "flag" && e.kind !== "overview")
              .map((e) => (
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
                  {e.kind === "progress" && <ProgressLine text={e.text} />}
                  {e.kind === "cta" && e.action === "reveal-plan" && !planVisible && (
                    <div className="pl-9">
                      <button
                        onClick={() => revealPlan(e.jobId)}
                        className="inline-flex items-center gap-2 rounded-lg bg-ink-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-700"
                      >
                        {e.label}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Approval gate mounts here — just above the chat bar (left section) */}
        <div ref={setGateSlot} />

        {/* Composer */}
        <div className="border-t border-ink-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  disabled={sending}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 transition hover:border-ink-300 hover:text-ink-700 disabled:opacity-50"
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
                    ? `Talk to Margin Protection Agent about Job ${activeJob.number}…`
                    : "Ask Margin Protection Agent about your portfolio…"
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

      {/* Living plan — the right side of the split for a flagged job.
          Only appears after the user clicks "See the plan →" (Phase 2). */}
      {planVisible && activeJob && (
        <div
          className={cn(
            "min-h-0 flex-col border-l border-ink-200 lg:flex",
            mobilePane === "plan" ? "flex" : "hidden"
          )}
        >
          <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
            <button
              onClick={() => setMobilePane("thread")}
              className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 lg:hidden"
              aria-label="Back to conversation"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="text-sm font-semibold text-ink-700">Plan</div>
              <div className="text-[11px] text-ink-500">
                Nothing writes without your go-ahead
              </div>
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto bg-neutral-50/40 px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-2xl">
              <FlagCard
                key={activeJob.id}
                ref={flagCardRef}
                job={activeJob}
                onResolved={onResolved}
                autonomy={autonomy}
                setCategoryAuto={setCategoryAuto}
                gateSlot={gateSlot}
                onNarrate={(text) =>
                  setThreads((prev) => ({
                    ...prev,
                    [activeJob.id]: [
                      ...(prev[activeJob.id] ?? []),
                      { id: nextId(), kind: "progress", text },
                    ],
                  }))
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Scanning beat — the agent visibly checks live actuals for ~1.5s right
          before a new flag surfaces, so the reveal reads as "it caught one." */}
      {scanning && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-lift"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
          </span>
          <span className="text-xs font-medium text-ink-600">
            Margin Protection Agent · scanning live actuals…
          </span>
        </motion.div>
      )}

      {/* Proactive-surfacing toast — shown only when the PM is heads-down on
          another thread; auto-dismisses in 3s, click to jump to the new job. */}
      {toast && (
        <motion.button
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            const j = jobById(toast.jobId);
            if (j) openJob(j);
            setToast(null);
          }}
          className="fixed bottom-5 right-5 z-50 flex max-w-xs items-start gap-2.5 rounded-xl border border-brand-200 bg-white px-4 py-3 text-left shadow-lift"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <ShieldCheck className="h-3 w-3" />
          </span>
          <span className="text-xs leading-snug">
            <span className="block font-semibold text-ink-700">New job needs you</span>
            <span className="text-ink-500">{toast.text}</span>
          </span>
        </motion.button>
      )}

      <AutonomyPanel
        open={autonomyOpen}
        autonomy={autonomy}
        setAutonomy={setAutonomy}
        onClose={() => setAutonomyOpen(false)}
      />
    </div>
  );
}

/* ------------------------------------------ autonomy control panel (gear) */

const GATE_ORDER: GateCategory[] = [
  "judgment",
  "money",
  "external-msg",
  "internal-msg",
  "budget",
  "estimating",
];

function AutonomyPanel({
  open,
  autonomy,
  setAutonomy,
  onClose,
}: {
  open: boolean;
  autonomy: Record<GateCategory, "ask" | "auto">;
  setAutonomy: Dispatch<SetStateAction<Record<GateCategory, "ask" | "auto">>>;
  onClose: () => void;
}) {
  const askCount = GATE_ORDER.filter((c) => autonomy[c] === "ask").length;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink-900/20" onClick={onClose} />
          <motion.aside
            className="scroll-thin relative flex h-full w-full max-w-sm flex-col overflow-y-auto bg-white shadow-lift"
            initial={{ x: 24, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex items-start justify-between border-b border-ink-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-700">
                  What I do on my own
                </h3>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  I stop for your approval on {askCount} of {GATE_ORDER.length}.
                  Flip any to Auto when you trust me with it.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 px-3 py-3">
              {GATE_ORDER.map((c) => (
                <div
                  key={c}
                  className="flex items-start justify-between gap-3 rounded-lg px-2 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-800">
                      {GATE_META[c].label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-500">
                      {GATE_META[c].blurb}
                    </div>
                  </div>
                  <div className="flex shrink-0 rounded-lg border border-ink-200 p-0.5">
                    {(["ask", "auto"] as const).map((pref) => (
                      <button
                        key={pref}
                        onClick={() =>
                          setAutonomy((a) => ({ ...a, [c]: pref }))
                        }
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                          autonomy[c] === pref
                            ? "bg-ink-800 text-white"
                            : "text-ink-500 hover:text-ink-700"
                        )}
                      >
                        {pref === "ask" ? "Ask me" : "Auto"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 px-5 py-3 text-[11px] text-ink-400">
              I never touch another system or send anything on Auto without it
              being reversible or yours to send.
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------ subviews */

function ThreadHeader({
  job,
  resolved,
  onBack,
  rightSlot,
  onSettings,
}: {
  job: Job | null;
  resolved: boolean;
  onBack: () => void;
  rightSlot?: ReactNode;
  onSettings?: () => void;
}) {
  const Gear = () =>
    onSettings ? (
      <button
        onClick={onSettings}
        aria-label="Approval settings"
        title="Approval settings — what the agent does on its own"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-600"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    ) : null;
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
          <LayoutGrid className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-700">Overview</div>
          <div className="text-[11px] text-ink-500">
            Portfolio briefing · the few jobs that need you
          </div>
        </div>
        <div className="ml-auto">
          <Gear />
        </div>
      </div>
    );
  }
  const tone =
    job.status === "flagged"
      ? resolved
        ? { chip: "bg-ink-100 text-ink-600", label: "Resolved" }
        : { chip: "bg-ink-100 text-ink-700", label: "Needs you" }
      : job.status === "monitoring"
      ? { chip: "bg-ink-100 text-ink-600", label: "Watching" }
      : { chip: "bg-ink-100 text-ink-600", label: "On budget" };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        <Back />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-700">
              Job {job.number}
            </span>
            <span className="truncate text-xs text-ink-500">· {job.name}</span>
          </div>
          <div className="text-[11px] text-ink-500">
            {job.trade} · {job.region} · {Math.round(job.pctComplete * 100)}% installed
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            tone.chip
          )}
        >
          {tone.label}
        </span>
        {rightSlot}
        <Gear />
      </div>
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
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-ink-800 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

/** A light narration line — the agent talking you through what it just did. */
function ProgressLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 pl-10 text-xs text-ink-500">
      <span className="font-medium">{text.slice(0, 1)}</span>
      <span>{text.slice(1).trim()}</span>
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
            ? "border-ink-200 bg-ink-50 text-ink-700"
            : "border-ink-200 bg-ink-50 text-ink-700"
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
