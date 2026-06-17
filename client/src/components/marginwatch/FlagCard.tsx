import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Mail,
  Copy,
  Eye,
  PenLine,
  MessageSquare,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/api";
import { cn, fmt, usd, usdK } from "@/lib/utils";
import { stepGate, GATE_META, type GateCategory } from "@/lib/engine";
import type { ActionStep, CostCodeProjection, Job } from "@/lib/types";

type StepState = "pending" | "running" | "done" | "skipped" | "awaiting";

/**
 * Conversational flag card: the job-cost drift, the proposed multi-step plan,
 * and (on approval) the steps executing one-by-one with artifacts, then the
 * margin recovering and a benchmark write-back that closes the loop.
 */
export type FlagCardHandle = {
  /** Apply a plain-English plan edit from the conversation. Returns whether it
   *  was handled and the line the agent should reply with. */
  applyPlanEdit: (text: string) => { ok: boolean; reply: string };
  /** Begin gated execution — called from the left panel when the user confirms. */
  start: () => void;
  /** Begin fully-autonomous execution — agent takes every recommended call. */
  startAutonomously: () => void;
};

export const FlagCard = forwardRef<
  FlagCardHandle,
  {
    job: Job;
    onResolved: (job: Job, actionedDollars: number) => void;
    /** Push a short progress line into the conversation as the agent works. */
    onNarrate?: (text: string) => void;
    /** Per-category approval preference, shared across the session. */
    autonomy?: Record<GateCategory, "ask" | "auto">;
    setCategoryAuto?: (c: GateCategory) => void;
    /** Where to render the approval gate — a slot above the conversation's
     *  chat bar, so all agent→PM input stays on the left. */
    gateSlot?: HTMLElement | null;
    /** When false, execution does not start automatically on mount — the parent
     *  calls start() or startAutonomously() from the conversation. */
    autoStart?: boolean;
  }
>(function FlagCard(
  { job, onResolved, onNarrate, autonomy, setCategoryAuto, gateSlot, autoStart = true },
  ref
) {
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
  // Step-through edit: the revised step the agent will now take, previewed
  // before it commits (the "show me what it'll do" path).
  const [previews, setPreviews] = useState<Record<number, string>>({});
  // Per-step conversation — the PM can open any step and ask about it.
  const [chatOpen, setChatOpen] = useState<number | null>(null);
  const [stepMsgs, setStepMsgs] = useState<
    Record<number, { role: "user" | "assistant"; content: string }[]>
  >({});
  const [chatDraft, setChatDraft] = useState<Record<number, string>>({});
  const [chatBusy, setChatBusy] = useState<number | null>(null);
  // Drafts the agent can't send (emails / docs to a third party) — expanded for
  // the PM to copy and send themselves.
  const [openDrafts, setOpenDrafts] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  // The decision step the auto-runner is paused on, awaiting the PM's call.
  const [awaiting, setAwaiting] = useState<number | null>(null);
  // "Partly billable" → the PM sets the billable split before it's applied.
  // Holds the decision step + chosen option + the live % the PM is dialing in.
  const [splitDraft, setSplitDraft] = useState<{
    decisionIdx: number;
    optionIndex: number;
    optionText: string;
    pct: number;
  } | null>(null);
  // Refs mirror amounts/skips so the actioned $ can be read synchronously at finish.
  const amountsRef = useRef<Record<number, number>>({});
  const skippedRef = useRef<Set<number>>(new Set());
  // Steps dropped by a decision branch (e.g. "our productivity" → no change order).
  // A ref so the recursive runner sees them synchronously; also folded into
  // skippedRef so the actioned-$ and outcome counts treat them as skipped.
  const branchSkipRef = useRef<Set<number>>(new Set());
  // Synchronous "no more pausing" flag for the recursive runner.
  const autoRef = useRef(false);
  // The step the runner is paused on for approval + the slide-up gate it shows.
  const [gatePanel, setGatePanel] = useState<{
    idx: number;
    category: GateCategory;
  } | null>(null);
  const [gateEditing, setGateEditing] = useState(false);
  // Steps the PM has already approved this run — never re-gate on re-entry.
  const gateClearedRef = useRef<Set<number>>(new Set());

  // What (if anything) this step must stop for: a decision, a write, a draft,
  // or money — unless we're running autonomously, the PM already cleared it, or
  // they've set that whole category to "auto".
  function gateFor(idx: number): GateCategory | null {
    if (autoRef.current) return null;
    if (gateClearedRef.current.has(idx)) return null;
    const step = flag.plan[idx];
    // Decision steps gate as "judgment" so the question appears on the left,
    // not inline in the right plan panel.
    if (step.decision) return autonomy?.judgment === "auto" ? null : "judgment";
    const g = stepGate(step);
    if (!g.needsGate || !g.category) return null;
    if (autonomy?.[g.category] === "auto") return null;
    return g.category;
  }

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
    // Glide past any steps a branch dropped.
    let n = idx + 1;
    while (n < flag.plan.length && branchSkipRef.current.has(n)) {
      setStep(n, "skipped");
      n++;
    }
    if (n >= flag.plan.length) {
      setPhase("done");
      onResolved(job, actionedDollars());
    } else setReviewIdx(n);
  };

  // A decision can reshape the plan: choosing option `oi` drops the step ids in
  // `decision.skips[oi]`. They render struck-through and never run — this is what
  // makes the plan specific to the PM's read of the situation.
  function applySkips(decisionIdx: number, optionIndex: number) {
    const ids = flag.plan[decisionIdx].decision?.skips?.[optionIndex];
    if (!ids?.length) return;
    ids.forEach((sid) => {
      const j = flag.plan.findIndex((p) => p.id === sid);
      if (j > decisionIdx) {
        branchSkipRef.current.add(j);
        skippedRef.current.add(j);
        setStep(j, "skipped");
        setConfirms((c) => ({ ...c, [j]: "Skipped — not taken on your call." }));
      }
    });
  }

  // A decision can also re-price a downstream financial step (e.g. "Partly
  // billable" bills only the change-tied slice on the change order). We write the
  // override into the same amounts state the manual edit uses, so the "targets $"
  // chip, the executed amount, and the recovered total all follow.
  function applyAdjust(decisionIdx: number, optionIndex: number) {
    const adj = flag.plan[decisionIdx].decision?.adjust?.[optionIndex];
    if (!adj?.length) return;
    adj.forEach(({ stepId, targetsDollars }) => {
      const j = flag.plan.findIndex((p) => p.id === stepId);
      if (j > decisionIdx) {
        amountsRef.current[j] = targetsDollars;
        setAmounts((a) => ({ ...a, [j]: targetsDollars }));
      }
    });
  }

  // The auto-runner: agent steps execute on their own; at a decision step it
  // PAUSES for the PM's call — unless autonomous mode is on, in which case it
  // takes the agent's recommended call and keeps going (like Claude does).
  function runAuto(idx: number) {
    if (idx >= flag.plan.length) {
      setPhase("done");
      onResolved(job, actionedDollars());
      return;
    }
    // A branch dropped this step — glide past it without running.
    if (branchSkipRef.current.has(idx)) {
      setStep(idx, "skipped");
      window.setTimeout(() => runAuto(idx + 1), 140);
      return;
    }
    const step = flag.plan[idx];
    // Writes / drafts / money / decisions pause for approval; reads run silently.
    const gate = gateFor(idx);
    if (gate) {
      setStep(idx, "awaiting");
      setAwaiting(idx);
      setGateEditing(false);
      setGatePanel({ idx, category: gate });
      return; // wait for approveGate() / skipGate() / turnAutonomous()
    }
    setStep(idx, "running");
    window.setTimeout(() => {
      if (step.decision) {
        const rec = step.decision.recommended;
        setConfirms((c) => ({
          ...c,
          [idx]: `→ ${step.decision!.options[rec]}`,
        }));
        applySkips(idx, rec); // autonomous mode takes the recommended branch
        applyAdjust(idx, rec);
        onNarrate?.(`→ ${step.decision.options[rec]}`);
      } else if (step.feedsBenchmark) {
        onNarrate?.(`↺ ${step.artifact?.trim() || step.label}`);
      } else {
        onNarrate?.(`✓ ${step.artifact?.trim() || step.label}`);
      }
      setStep(idx, "done");
      window.setTimeout(() => runAuto(idx + 1), 300);
    }, 780);
  }

  /** Approve the plan → run, pausing at each "your call" decision. */
  function approveAndRun() {
    autoRef.current = false;
    setPhase("executing");
    runAuto(0);
  }

  // Auto-start: when autoStart is true (default), begin executing after a short
  // beat so the plan panel has time to appear. When false, the parent drives
  // start() from the conversation once the user confirms.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!autoStart) return;
    const t = window.setTimeout(() => {
      if (!startedRef.current) {
        startedRef.current = true;
        approveAndRun();
      }
    }, 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Conversational plan edits (driven from the chat on the left) --------
  function targetStepFromText(s: string): number {
    if (/\bgc\b|letter|hand[- ]?off|submit to|to the gc/.test(s))
      return flag.plan.findIndex((p) => p.draft && !p.draft.internal);
    if (/brief|field|foreman|superintendent|\bpm\b|team|directive|internal/.test(s))
      return flag.plan.findIndex((p) => !!p.draft?.internal);
    if (/change[- ]?order|\bcor\b|\bco\b/.test(s))
      return flag.plan.findIndex((p) => /change order/i.test(p.label));
    if (/t&?m|ticket|billing/.test(s))
      return flag.plan.findIndex((p) => /t&m|ticket/i.test(p.label));
    if (/benchmark|estimat/.test(s))
      return flag.plan.findIndex((p) => !!p.feedsBenchmark);
    if (/budget|forecast|reforecast|eac/.test(s))
      return flag.plan.findIndex((p) => /budget|reforecast/i.test(p.label));
    return -1;
  }

  function applyPlanEdit(text: string): { ok: boolean; reply: string } {
    const s = text.toLowerCase();
    const moneyIdx = flag.plan.findIndex((p) => p.targetsDollars > 0);
    const verb = (label: string) => label.split(" · ")[0].toLowerCase();

    // Re-price the money step: "bill only $40k", "make it 50000", "cap at $30k"
    const amtMatch = s.match(/\$?\s*([\d][\d.,]*)\s*(k)?/);
    if (
      moneyIdx >= 0 &&
      amtMatch &&
      /\b(bill|charge|change|make|only|set|cap|reduce|just|lower|to)\b/.test(s)
    ) {
      let amt = Number(amtMatch[1].replace(/,/g, ""));
      if (amtMatch[2] === "k" || amt < 1000) amt = amt * 1000;
      amt = Math.round(amt);
      if (amt > 0) {
        if (steps[moneyIdx] === "done" || skippedRef.current.has(moneyIdx))
          return {
            ok: true,
            reply: `The ${verb(flag.plan[moneyIdx].label)} already went through this run — I can't reprice it now.`,
          };
        amountsRef.current[moneyIdx] = amt;
        setAmounts((a) => ({ ...a, [moneyIdx]: amt }));
        return {
          ok: true,
          reply: `Got it — I'll bill ${usd(amt)} on the ${verb(
            flag.plan[moneyIdx].label
          )} (was ${usd(
            flag.plan[moneyIdx].targetsDollars
          )}); the rest stays absorbed. Updated on the right.`,
        };
      }
    }

    // Drop a step: "skip the GC letter", "don't email the field", "drop the brief"
    if (
      /\b(skip|drop|don'?t|do not|no need|cancel|remove|leave out|hold off|without|forget)\b/.test(
        s
      )
    ) {
      const idx = targetStepFromText(s);
      if (idx < 0) return { ok: false, reply: "" };
      if (steps[idx] === "done")
        return {
          ok: true,
          reply: `${flag.plan[idx].label} already ran — too late to pull it back this round.`,
        };
      if (steps[idx] === "skipped" || branchSkipRef.current.has(idx))
        return { ok: true, reply: `${flag.plan[idx].label} is already off the plan.` };
      branchSkipRef.current.add(idx);
      skippedRef.current.add(idx);
      setStep(idx, "skipped");
      setConfirms((c) => ({ ...c, [idx]: "Skipped — your call." }));
      return {
        ok: true,
        reply: `Done — I'll skip ${flag.plan[
          idx
        ].label.toLowerCase()}. Took it off the plan on the right.`,
      };
    }

    return { ok: false, reply: "" };
  }

  useImperativeHandle(ref, () => ({ applyPlanEdit, start: approveAndRun, startAutonomously: runAutonomously }));

  /** Run the whole plan without stopping — agent takes every recommended call. */
  function runAutonomously() {
    autoRef.current = true;
    setPhase("executing");
    runAuto(0);
  }

  /** A decision is made — from an executing pause, or the step-through path. */
  function decide(idx: number, optionText: string, optionIndex: number) {
    if (refining) return;
    setGatePanel(null);
    gateClearedRef.current.add(idx);
    setConfirms((c) => ({ ...c, [idx]: `→ ${optionText}` }));
    setStep(idx, "done");
    onNarrate?.(`→ ${optionText}`);
    applySkips(idx, optionIndex); // reshape the plan to the PM's call
    applyAdjust(idx, optionIndex); // re-price the financial step if needed
    if (awaiting === idx) {
      setAwaiting(null);
      window.setTimeout(() => runAuto(idx + 1), 300);
    } else {
      advance(idx); // step-through (review) path
    }
  }

  // The financial step a decision option re-prices, plus its full (100%) $.
  function adjustTarget(decisionIdx: number, optionIndex: number) {
    const adj = flag.plan[decisionIdx].decision?.adjust?.[optionIndex]?.[0];
    if (!adj) return null;
    const stepIdx = flag.plan.findIndex((p) => p.id === adj.stepId);
    if (stepIdx < 0) return null;
    const full = flag.plan[stepIdx].targetsDollars;
    return { stepIdx, full, defaultPct: Math.round((adj.targetsDollars / full) * 100) };
  }

  // Picking a split option (e.g. "Partly billable") opens the % control instead
  // of deciding immediately — the PM dials in how much of the overage to bill.
  function chooseOption(decisionIdx: number, optionIndex: number, optionText: string) {
    if (refining) return;
    const t = adjustTarget(decisionIdx, optionIndex);
    if (t) {
      setSplitDraft({ decisionIdx, optionIndex, optionText, pct: t.defaultPct });
    } else {
      decide(decisionIdx, optionText, optionIndex);
    }
  }

  // Commit the PM's chosen split: re-price the financial step to that %, then
  // continue exactly as decide() would (we set the amount ourselves, so this
  // path doesn't call applyAdjust).
  function confirmSplit() {
    if (!splitDraft) return;
    setGatePanel(null);
    const { decisionIdx, optionIndex, optionText, pct } = splitDraft;
    const t = adjustTarget(decisionIdx, optionIndex);
    if (t) {
      const amt = Math.round((t.full * pct) / 100);
      amountsRef.current[t.stepIdx] = amt;
      setAmounts((a) => ({ ...a, [t.stepIdx]: amt }));
    }
    setConfirms((c) => ({ ...c, [decisionIdx]: `→ ${optionText} · billing ${pct}%` }));
    setStep(decisionIdx, "done");
    onNarrate?.(`→ ${optionText} · billing ${pct}%`);
    applySkips(decisionIdx, optionIndex);
    setSplitDraft(null);
    if (awaiting === decisionIdx) {
      setAwaiting(null);
      window.setTimeout(() => runAuto(decisionIdx + 1), 300);
    } else {
      advance(decisionIdx);
    }
  }

  /** From a pause (or the step-through path), hand the rest off autonomously. */
  function turnAutonomous() {
    if (refining) return;
    autoRef.current = true;
    const idx = awaiting != null ? awaiting : reviewIdx;
    setAwaiting(null);
    setGatePanel(null);
    setPhase("executing");
    runAuto(idx);
  }

  /** Approve a non-decision gate (a write / draft / money step) → run it now. */
  function approveGate() {
    if (!gatePanel) return;
    const idx = gatePanel.idx;
    gateClearedRef.current.add(idx);
    setGatePanel(null);
    setGateEditing(false);
    setAwaiting(null);
    runAuto(idx); // re-enter; gateFor() now clears it
  }

  /** Skip the gated step entirely. */
  function skipGate() {
    if (!gatePanel) return;
    const idx = gatePanel.idx;
    skippedRef.current.add(idx);
    setStep(idx, "skipped");
    setConfirms((c) => ({ ...c, [idx]: "Skipped — not taken on your call." }));
    onNarrate?.(`✓ Skipped ${flag.plan[idx].label.toLowerCase()} — your call`);
    setGatePanel(null);
    setGateEditing(false);
    setAwaiting(null);
    window.setTimeout(() => runAuto(idx + 1), 200);
  }

  /** "Don't ask again for {category}" → set it auto, then proceed this step. */
  function dontAskAgain() {
    if (!gatePanel) return;
    const { idx, category } = gatePanel;
    setCategoryAuto?.(category);
    if (flag.plan[idx].decision) {
      const rec = flag.plan[idx].decision!.recommended;
      chooseOption(idx, rec, flag.plan[idx].decision!.options[rec]);
    } else {
      approveGate();
    }
  }

  // Has the PM changed anything about this step (amount or instruction)?
  const isEdited = (idx: number) => {
    const step = flag.plan[idx];
    const note = (notes[idx] || "").trim();
    const editedAmt = amounts[idx];
    const amountChanged =
      step.targetsDollars > 0 &&
      editedAmt != null &&
      Math.round(editedAmt) !== Math.round(step.targetsDollars);
    return !!note || amountChanged;
  };

  // Ask the agent what the step becomes given the PM's edits → one-line confirm.
  async function reviseStep(idx: number): Promise<string> {
    const step = flag.plan[idx];
    const note = (notes[idx] || "").trim();
    const editedAmt = amounts[idx];
    const amountChanged =
      step.targetsDollars > 0 &&
      editedAmt != null &&
      Math.round(editedAmt) !== Math.round(step.targetsDollars);
    if (!note && !amountChanged) return step.artifact;
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
      return reply?.trim() || step.artifact;
    } catch {
      return `${amountChanged ? `Revised to ${usd(editedAmt!)}. ` : ""}${
        note ? `Noted: ${note}` : step.artifact
      }`;
    }
  }

  /** Show the PM the revised step before it runs (the third option on an edit). */
  async function previewRevision() {
    if (refining) return;
    const idx = reviewIdx;
    setRefining(true);
    const text = await reviseStep(idx);
    setRefining(false);
    setPreviews((p) => ({ ...p, [idx]: text }));
  }

  const clearPreview = () =>
    setPreviews((p) => {
      const next = { ...p };
      delete next[reviewIdx];
      return next;
    });

  /** Commit a step that's already been previewed — no second round-trip. */
  function runPreviewed() {
    const idx = reviewIdx;
    setStep(idx, "running");
    window.setTimeout(() => {
      setConfirms((c) => ({ ...c, [idx]: previews[idx] }));
      setStep(idx, "done");
      advance(idx);
    }, 480);
  }

  async function approveReviewStep() {
    if (refining) return;
    const idx = reviewIdx;
    setStep(idx, "running");
    let confirmation = flag.plan[idx].artifact;
    if (isEdited(idx)) {
      setRefining(true);
      confirmation = await reviseStep(idx);
      setRefining(false);
    } else {
      await sleep(600);
    }
    setConfirms((c) => ({ ...c, [idx]: confirmation }));
    setStep(idx, "done");
    advance(idx);
  }

  /** Open / ask a question about a single step (the double-click drill-in). */
  function toggleChat(idx: number) {
    setChatOpen((cur) => (cur === idx ? null : idx));
  }

  async function sendStepChat(idx: number) {
    const text = (chatDraft[idx] || "").trim();
    if (!text || chatBusy !== null) return;
    const step = flag.plan[idx];
    const history = stepMsgs[idx] || [];
    const next = [...history, { role: "user" as const, content: text }];
    setStepMsgs((m) => ({ ...m, [idx]: next }));
    setChatDraft((d) => ({ ...d, [idx]: "" }));
    setChatBusy(idx);
    try {
      const { reply } = await chat(
        [
          {
            role: "user",
            content: `I'm looking at the plan step "${step.label}" — ${step.detail}${
              step.targetsDollars > 0 ? ` (targets ${usd(step.targetsDollars)})` : ""
            }. ${text}`,
          },
        ],
        {
          mode: "margin-watch",
          jobContext: {
            jobName: job.name,
            jobNumber: job.number,
            costCode: `${flag.costCode} ${flag.costCodeName}`,
            step: step.label,
          },
        }
      );
      setStepMsgs((m) => ({
        ...m,
        [idx]: [
          ...next,
          { role: "assistant", content: reply?.trim() || "—" },
        ],
      }));
    } catch {
      setStepMsgs((m) => ({
        ...m,
        [idx]: [
          ...next,
          {
            role: "assistant",
            content: "I lost the connection for a second — try that again.",
          },
        ],
      }));
    } finally {
      setChatBusy(null);
    }
  }

  function copyDraft(idx: number, d: NonNullable<ActionStep["draft"]>) {
    const text = `To: ${d.to}\nSubject: ${d.subject}\n\n${d.body}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(idx);
    window.setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1600);
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

  // Benchmark steps run silently and are hidden from the visible plan list.
  const benchmarkIndices = new Set(
    flag.plan.map((p, i) => (p.feedsBenchmark ? i : -1)).filter((i) => i >= 0)
  );
  const benchmarkRan = flag.plan.some(
    (p, i) => p.feedsBenchmark && steps[i] === "done"
  );

  // High-level progress for the living-plan progress bar.
  // Benchmark steps run silently — excluded from visible counts.
  const total = flag.plan.length - benchmarkIndices.size;
  const doneCount = steps.filter(
    (s, i) => (s === "done" || s === "skipped") && !benchmarkIndices.has(i)
  ).length;
  const activeIdx = steps.findIndex((s) => s === "running" || s === "awaiting");
  const currentLabel =
    activeIdx >= 0
      ? flag.plan[activeIdx].label
      : phase === "review"
      ? flag.plan[reviewIdx]?.label ?? ""
      : "";
  const nextPendingIdx = steps.findIndex(
    (s, i) => s === "pending" && !benchmarkIndices.has(i)
  );
  const nextPendingLabel =
    nextPendingIdx >= 0 ? flag.plan[nextPendingIdx].label : "";
  const remainingCount = steps.filter(
    (s, i) => s === "pending" && !benchmarkIndices.has(i)
  ).length;

  // Outcome summary (reflects per-step edits/skips from the Review-each path).
  const ranCount = steps.filter((s, i) => s === "done" && !benchmarkIndices.has(i)).length;
  const skippedCount = steps.filter((s, i) => s === "skipped" && !benchmarkIndices.has(i)).length;
  const actionRan = actionIdx >= 0 && steps[actionIdx] === "done";
  const actionVerb = actionIdx >= 0 ? flag.plan[actionIdx].label.split(" · ")[0] : "";
  const actionAmt =
    actionIdx >= 0 ? amounts[actionIdx] ?? flag.plan[actionIdx].targetsDollars : 0;

  const gateStep = gatePanel ? flag.plan[gatePanel.idx] : null;
  const gateAmt =
    gatePanel && gateStep
      ? Math.round(amounts[gatePanel.idx] ?? gateStep.targetsDollars)
      : 0;
  // Use the step's own detail text — it has the actual context (what's changing,
  // what numbers, why). Fall back to a category-level description if missing.
  const gateAsk =
    !gatePanel || !gateStep
      ? ""
      : gateStep.detail ||
        (gatePanel.category === "money"
          ? `Approve to draft; I've sized it to the change-tied work, not the full overrun.`
          : gatePanel.category === "external-msg"
          ? "I've drafted this for the GC — give it a read. Approve and it's yours to send; nothing leaves the platform without you."
          : gatePanel.category === "internal-msg"
          ? "Here's the note for your team. Approve and it's ready for you to forward."
          : gatePanel.category === "estimating"
          ? `Ready to write the true ${flag.costCodeName} rate back to your estimating benchmark, so the next bid isn't light.`
          : "Ready to update your live budget and forecast. Approve and I'll write it.");

  return (
    <>
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-soft">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg",
              phase === "done"
                ? "bg-ink-100 text-ink-600"
                : "bg-ink-100 text-ink-600"
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
              <span className="text-sm font-semibold text-ink-700">
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
          <div className="tabular text-sm font-semibold text-ink-700">
            #{flag.rank}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        <p className="text-sm font-medium text-ink-800">{flag.summary}</p>

        {/* Compact one-line read — the full numbers tuck into Details */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
          <span className="tabular font-medium text-ink-700">
            {usdK(flag.marginAtRisk)} at risk
          </span>
          <span className="text-ink-300">·</span>
          <span className="tabular">
            margin {flag.marginNow}% → {flag.marginAtCompletion}%
          </span>
          <span className="text-ink-300">·</span>
          <span className="capitalize">{flag.recoverability} recoverability</span>
          <button
            onClick={() => setShowCodes((s) => !s)}
            className="ml-auto inline-flex items-center gap-0.5 font-medium text-ink-400 hover:text-ink-700"
          >
            {showCodes ? "Hide" : "Details"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                !showCodes && "-rotate-90"
              )}
            />
          </button>
        </div>

        {showCodes && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-ink-500">
              <Clock className="h-3 w-3 shrink-0 text-ink-400" />
              <span>
                First flagged{" "}
                <span className="font-medium text-ink-600">
                  {flag.detectedWeeksAgo} weeks ago
                </span>{" "}
                · drift widening · {atStakePts} pts at stake
              </span>
              <Sparkline data={flag.trend} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Over budget" value={`${flag.overPct}%`} tone="danger" />
              <Metric label="Projected overrun" value={usdK(flag.marginAtRisk)} tone="danger" />
              <Metric label="Recoverability" value={flag.recoverability} tone="brand" capitalize />
              <Metric label="Time to act" value={`${flag.weeksLeftToAct} wks`} tone="neutral" />
            </div>
            <CostCodeTable lines={job.costLines} driverCode={flag.costCode} />
          </div>
        )}

        {/* Plan */}
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-700">Plan</span>
            <span className="text-[11px] text-ink-400">
              {phase === "done"
                ? "Resolved"
                : phase === "proposed"
                ? "starting…"
                : `Step ${Math.min(doneCount + 1, total)} of ${total}`}
            </span>
          </div>

          {/* High-level progress — the agent driving the job to completion */}
          {phase !== "proposed" && (
            <div className="mb-2.5">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                <motion.div
                  className="bg-ink-600"
                  animate={{ width: `${(doneCount / total) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              {phase !== "done" && currentLabel && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-500">
                  {activeIdx >= 0 && steps[activeIdx] === "awaiting" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-500" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin text-ink-400" />
                  )}
                  {currentLabel}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            {flag.plan.map((step, i) => {
              const st = steps[i];
              const isReviewCurrent = phase === "review" && reviewIdx === i;
              const isAwaiting = st === "awaiting";
              // Benchmark steps run silently — never shown in the plan list.
              if (step.feedsBenchmark) return null;
              // Progressive reveal — the plan consolidates as the agent walks
              // you through it; upcoming steps stay hidden until reached.
              if (st === "pending" && !isReviewCurrent) return null;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    st === "skipped"
                      ? "border-ink-200 bg-ink-50 opacity-60"
                      : st === "done"
                      ? step.feedsBenchmark
                        ? "border-ink-200 bg-ink-50"
                        : "border-ink-200 bg-ink-50"
                      : st === "running"
                      ? "border-ink-300 bg-ink-50"
                      : isReviewCurrent || isAwaiting
                      ? "border-ink-300 bg-white ring-1 ring-ink-200"
                      : "border-ink-200 bg-white"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      <StepIcon
                        state={st}
                        idx={i}
                        loop={step.feedsBenchmark}
                        decision={!!step.decision}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-sm font-medium text-ink-800",
                              st === "skipped" && "line-through"
                            )}
                          >
                            {step.label}
                          </span>
                          {step.decision && (st === "pending" || st === "awaiting") && (
                            <span className="shrink-0 rounded-full border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-700">
                              your call
                            </span>
                          )}
                        </span>
                        {step.targetsDollars > 0 && (st === "awaiting" || st === "done") && (
                          <span className="tabular shrink-0 text-xs font-medium text-ink-500">
                            {usd(amounts[i] ?? step.targetsDollars)}
                          </span>
                        )}
                      </div>
                      {(st === "done" || st === "skipped") && (
                        <div
                          className={cn(
                            "mt-1 flex items-center gap-1 text-[11px] font-medium",
                            st === "skipped"
                              ? "text-ink-400"
                              : "text-ink-600"
                          )}
                        >
                          {st === "done" && step.feedsBenchmark && (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          {confirms[i] ?? step.artifact}
                        </div>
                      )}
                    </div>
                  </div>

                  {isReviewCurrent && !step.decision && (
                    <div className="mt-2.5 space-y-2 border-t border-ink-100 pt-2.5">
                      {previews[i] != null ? (
                        // The revised step the agent will now take — confirm or keep editing.
                        <div className="space-y-2.5">
                          <div className="rounded-lg border border-ink-200 bg-ink-50 p-2.5">
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
                              <PenLine className="h-3 w-3" /> Revised step — what it&apos;ll
                              now do
                            </div>
                            <p className="text-xs leading-relaxed text-ink-700">
                              {previews[i]}
                            </p>
                            {amounts[i] != null &&
                              Math.round(amounts[i]) !==
                                Math.round(step.targetsDollars) && (
                                <p className="tabular mt-1 text-[11px] text-ink-500">
                                  Amount: {usd(Math.round(amounts[i]))}{" "}
                                  <span className="text-ink-400">
                                    (was {usd(Math.round(step.targetsDollars))})
                                  </span>
                                </p>
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={runPreviewed}>
                              Run this step
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={clearPreview}
                            >
                              Keep editing
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                                    const v =
                                      e.target.value === ""
                                        ? 0
                                        : Number(e.target.value);
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
                            placeholder="Adjust this step or tell Margin Protection Agent how (optional)…"
                            className="h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-100"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={approveReviewStep} disabled={refining}>
                              {refining && previews[i] == null ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
                                </>
                              ) : (
                                "Approve & run"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={previewRevision}
                              disabled={refining || !isEdited(i)}
                              title={
                                isEdited(i)
                                  ? "See the revised step before it runs"
                                  : "Edit the amount or add an instruction first"
                              }
                            >
                              {refining ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revising…
                                </>
                              ) : (
                                "Preview revision"
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
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {nextPendingLabel && phase === "executing" && (
              <div className="flex items-center gap-1.5 px-1 pt-0.5 text-[11px] text-ink-400">
                <ChevronRight className="h-3 w-3" />
                Up next · {nextPendingLabel}
                {remainingCount > 1 ? ` · +${remainingCount - 1} more` : ""}
              </div>
            )}
          </div>
        </div>

        {phase === "proposed" && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-400">
            <Loader2 className="h-3 w-3 animate-spin text-ink-700" />
            Walking you through it…
          </div>
        )}

        {phase === "review" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              Step {reviewIdx + 1} of {flag.plan.length} — make the calls that are yours.
            </p>
            <button
              onClick={turnAutonomous}
              className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100"
            >
              Continue autonomously →
            </button>
          </div>
        )}

        {phase === "executing" && awaiting !== null && (
          <p className="mt-3 text-xs font-medium text-ink-700">
            Paused — your input is needed on the left.
          </p>
        )}

        {phase === "executing" && awaiting === null && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Margin Protection Agent is executing the plan…
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
                  Handled — Job {job.number}
                </div>
                <div className="text-xs text-emerald-600">
                  {actionRan && `${actionVerb} for ${usd(actionAmt)} · `}
                  {ranCount} of {total} steps run
                  {skippedCount > 0 && ` · ${skippedCount} skipped`}.
                </div>
                {benchmarkRan && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600/80">
                    <RefreshCw className="h-3 w-3" />
                    {flag.costCodeName} rate reinforced — next bid won't run light here.
                  </div>
                )}
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

    {/* Approval gate — portal above the conversation's chat bar; all agent→PM
        input lives on the left, the right panel is pure plan output. */}
    {gateSlot &&
      createPortal(
        <AnimatePresence>
          {gatePanel && gateStep && (
            <motion.div
              key="gate"
              className="px-4 pb-2 sm:px-6"
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 14, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
            >
              <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
                {/* Header — same for decisions and writes */}
                <div className="flex items-start gap-2.5 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                      {gateStep.decision
                        ? "Your call"
                        : `Your approval · ${GATE_META[gatePanel.category].label}`}
                    </div>
                    <div className="text-sm font-semibold text-ink-700">
                      {gateStep.label}
                    </div>
                  </div>
                </div>

                {gateStep.decision ? (
                  <>
                    {/* Decision body — question + options on the left */}
                    <div className="scroll-thin max-h-[40vh] overflow-y-auto px-4 py-3.5">
                      <p className="text-sm font-medium text-ink-700">
                        {gateStep.decision!.question}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {gateStep.decision!.options.map((opt, oi) => (
                          <button
                            key={opt}
                            onClick={() => chooseOption(gatePanel.idx, oi, opt)}
                            className={cn(
                              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                              splitDraft?.decisionIdx === gatePanel.idx &&
                                splitDraft?.optionIndex === oi
                                ? "border-ink-400 bg-ink-100 text-ink-700 ring-1 ring-ink-300"
                                : oi === gateStep.decision!.recommended
                                ? "border-ink-300 bg-ink-50 text-ink-700 hover:bg-ink-100"
                                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                            )}
                          >
                            {opt}
                            {gateStep.decision!.adjust?.[oi] && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                                set %
                              </span>
                            )}
                            {oi === gateStep.decision!.recommended && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                                rec
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Partial-bill control — PM dials in the billable split */}
                      {splitDraft?.decisionIdx === gatePanel.idx &&
                        (() => {
                          const t = adjustTarget(gatePanel.idx, splitDraft.optionIndex);
                          if (!t) return null;
                          const billed = Math.round((t.full * splitDraft.pct) / 100);
                          return (
                            <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-ink-700">
                                  Billable share of the {usdK(t.full)} overage
                                </span>
                                <span className="tabular font-semibold text-ink-700">
                                  {splitDraft.pct}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={splitDraft.pct}
                                onChange={(e) =>
                                  setSplitDraft((s) =>
                                    s ? { ...s, pct: Number(e.target.value) } : s
                                  )
                                }
                                className="mt-2 w-full accent-ink-700"
                              />
                              <div className="tabular mt-1.5 flex items-center justify-between text-[11px] text-ink-500">
                                <span>
                                  Bill{" "}
                                  <span className="font-semibold text-ink-700">
                                    {usd(billed)}
                                  </span>{" "}
                                  on the COR
                                </span>
                                <span>
                                  Absorb{" "}
                                  <span className="font-medium text-ink-500">
                                    {usd(t.full - billed)}
                                  </span>
                                </span>
                              </div>
                              <div className="mt-2.5 flex items-center gap-2">
                                <Button size="sm" onClick={confirmSplit}>
                                  Bill {splitDraft.pct}% · {usdK(billed)}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setSplitDraft(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                    <div className="flex items-center border-t border-ink-100 px-4 py-3">
                      <button
                        onClick={turnAutonomous}
                        className="text-[11px] font-medium text-ink-400 hover:text-ink-700"
                      >
                        Or let it run the rest autonomously →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Write / draft / money gate body */}
                    <div className="scroll-thin max-h-[40vh] overflow-y-auto px-4 py-3.5">
                      <p className="text-sm leading-relaxed text-ink-700">{gateAsk}</p>

                      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2 text-xs text-ink-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-700" />
                        <span>{GATE_META[gatePanel.category].risk}</span>
                      </div>

                      {gatePanel.category === "money" && (
                        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-ink-400">
                            Amount to commit
                          </div>
                          {gateEditing ? (
                            <span className="mt-1 flex w-fit items-center rounded-md border border-ink-200 bg-white px-2">
                              <span className="text-ink-400">$</span>
                              <input
                                type="number"
                                min={0}
                                value={amounts[gatePanel.idx] ?? Math.round(gateStep.targetsDollars)}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? 0 : Number(e.target.value);
                                  amountsRef.current[gatePanel.idx] = v;
                                  setAmounts((a) => ({ ...a, [gatePanel.idx]: v }));
                                }}
                                className="tabular h-7 w-32 bg-transparent px-1 text-right text-sm text-ink-800 outline-none"
                              />
                            </span>
                          ) : (
                            <div className="tabular mt-0.5 text-lg font-semibold text-ink-700">
                              {usd(gateAmt)}
                            </div>
                          )}
                        </div>
                      )}

                      {gateStep.draft && (
                        <div className="mt-3 rounded-lg border border-ink-200 bg-white p-3">
                          <div className="space-y-0.5 border-b border-ink-100 pb-2 text-[11px]">
                            <div>
                              <span className="text-ink-400">To </span>
                              <span className="text-ink-600">{gateStep.draft.to}</span>
                            </div>
                            <div>
                              <span className="text-ink-400">Subject </span>
                              <span className="font-medium text-ink-700">
                                {gateStep.draft.subject}
                              </span>
                            </div>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-600">
                            {gateStep.draft.body}
                          </pre>
                          <button
                            onClick={() => copyDraft(gatePanel.idx, gateStep.draft!)}
                            className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-600 hover:border-ink-300 hover:text-ink-700"
                          >
                            {copied === gatePanel.idx ? (
                              <>
                                <Check className="h-3 w-3 text-ink-600" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {(gatePanel.category === "budget" ||
                        gatePanel.category === "estimating") &&
                        gateStep.systems && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {gateStep.systems.map((s, si) => (
                              <SystemChip key={si} system={s} />
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3">
                      <Button size="sm" onClick={approveGate}>
                        Approve
                      </Button>
                      {(gatePanel.category === "money" || gateStep.draft) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setGateEditing((e) => !e)}
                        >
                          {gateEditing ? "Done" : "Edit"}
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={skipGate}>
                        Skip
                      </Button>
                      <button
                        onClick={dontAskAgain}
                        className="ml-auto text-right text-[11px] font-medium text-ink-400 hover:text-ink-700"
                      >
                        Don&apos;t ask again for{" "}
                        {GATE_META[gatePanel.category].label.toLowerCase()}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        gateSlot
      )}
    </>
  );
});

function StepIcon({
  state,
  idx,
  loop,
  decision,
}: {
  state: StepState;
  idx: number;
  loop?: boolean;
  decision?: boolean;
}) {
  if (state === "done")
    return (
      <div
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-white",
          loop ? "bg-ink-500" : "bg-ink-600"
        )}
      >
        {loop ? <RefreshCw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      </div>
    );
  if (state === "running")
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-500 text-white">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  if (state === "skipped")
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-300 bg-ink-100 text-ink-400">
        <X className="h-3 w-3" />
      </div>
    );
  if (state === "awaiting")
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink-400 bg-ink-50 text-[10px] font-semibold text-ink-600">
        {idx + 1}
      </div>
    );
  return (
    <div
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
        decision
          ? "border-ink-300 text-ink-700"
          : "border-ink-300 text-ink-400"
      )}
    >
      {idx + 1}
    </div>
  );
}

/** A system this step touches — read (pulls data) vs write (changes a record). */
function SystemChip({
  system,
}: {
  system: { name: string; mode: "read" | "write"; note?: string };
}) {
  const write = system.mode === "write";
  return (
    <span
      title={`${write ? "Writes to" : "Reads from"} ${system.name}${
        system.note ? ` — ${system.note}` : ""
      }`}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
        write
          ? "border-ink-300 bg-ink-100 text-ink-600"
          : "border-ink-200 bg-ink-50 text-ink-500"
      )}
    >
      {write ? <PenLine className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
      <span className="font-medium">{system.name}</span>
      {system.note && <span className="text-ink-400">· {system.note}</span>}
    </span>
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
            ? "text-ink-700"
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
