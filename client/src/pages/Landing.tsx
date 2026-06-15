import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, Radar, HardHat, Activity, Check } from "lucide-react";
import { Wordmark, DISCLAIMER } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { navigate } from "@/App";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5 },
};

/* ---- Section 2 data: inputs → agent → value ----
 * Almost everything is LIVE because Miter already integrates it (Procore, Sage
 * 300 CRE, Sage Intacct, Vista, NetSuite, HCSS, etc.). The only genuine SOON is
 * a dedicated CPM schedule (P6 / Autodesk Build aren't Miter integrations yet)
 * for a fully schedule-aware EAC. */
const INPUTS = [
  { label: "Real-time cost-coded actuals + budget (Miter)", live: true },
  { label: "Job costs, cost codes & GL (Sage 300 CRE, Sage Intacct, Vista)", live: true },
  { label: "Jobs, activities & timesheets (Procore, HCSS)", live: true },
  { label: "CPM schedule / % complete (Primavera P6, Autodesk Build)", live: false },
];

/* Today's value, framed as jobs-to-be-done. */
const JTBD = [
  "Watches every job's cost so you don't have to",
  "Surfaces only what needs your judgment",
  "Does the multi-step fix on your say-so",
];

/* The live agent feed — actions tick in, newest on top. Every line is something
 * the agent actually produces in the app (flag, draft, surface, catch,
 * reforecast), grounded in the seed jobs — drafts/forecasts, never outcomes it
 * can't achieve without your approval. */
const FEED = [
  "Flagged Job 412 — rough-in 23% over budget, $86.9K at risk",
  "Drafted change order on Job 412 to capture the out-of-scope rough-in",
  "Reforecast Job 207 — bid ran light; wrote the gap back to your estimate",
  "Caught under-billed T&M on Job 132 — $31K recoverable, billing drafted",
  "Reforecast Job 88 cost-to-complete at the corrected production rate",
];

const VALUE_SOON = [
  { label: "Preconstruction", desc: "bid on what work really costs" },
  { label: "Finance", desc: "live margin & WIP across the portfolio" },
];

/* ---- Section 3 data: the problem, big numbers ----
 * #1: McKinsey Global Institute, "Reinventing Construction" (2017) — industry-
 * wide, size-neutral. #2: CFMA Construction Financial Benchmarker — contractor
 * net margins run thin single digits (avg ~5%). The megaproject "80% over
 * budget" figure was dropped: it describes large capital projects, not Miter's
 * specialty/SMB buyer. */
const STATS = [
  {
    value: "1%",
    caption: "construction's annual productivity growth — a third of the wider economy",
    source: "McKinsey · Reinventing Construction, 2017",
  },
  {
    value: "5%",
    caption: "a typical contractor's net margin — one over-run job can erase it",
    source: "CFMA Construction Financial Benchmarker",
  },
];

/* ---- "Miter gives you / the agent adds" — the credibility strip ---- */
const MITER_GIVES = [
  "Real-time cost-coded actuals vs budget",
  "Fully-burdened costs",
  "Portfolio job-cost reports",
];
const AGENT_ADDS = [
  "Forecasts where each job lands — EAC, schedule-aware",
  "Triages to the few jobs that matter, ranked",
  "Watches autonomously — no dashboard to open",
  "Takes the multi-step fix, on your approval",
];

/* ---- Section 4 data: the agent loop ---- */
type Objective = {
  n: string;
  kicker: string;
  variant: "see" | "act" | "learn";
  title: string;
  objective: string;
  footer: string[];
  badge?: string;
  body?: string;
};
const OBJECTIVES: Objective[] = [
  {
    n: "01",
    kicker: "SEE",
    variant: "see",
    title: "Cost-at-completion forecaster",
    objective: "Know where every job lands.",
    badge: "On Miter's data",
    body: "Builds on Miter's real-time, cost-coded actuals — already synced from your ERP and Procore. Adds what Miter doesn't: a continuous cost-at-completion forecast (EAC) with autonomous per-cost-code drift detection that runs with no one opening a dashboard — and a fully schedule-aware EAC as you connect a CPM schedule.",
    footer: ["Portfolio roll-up (WIP)", "Margin-protected tally", "Cash-flow forecast"],
  },
  {
    n: "02",
    kicker: "ACT",
    variant: "act" as const,
    title: "Governed agentic action",
    objective: "Fix it — with you in control.",
    footer: ["Approval gate", "Autonomy thresholds", "Audit trail"],
  },
  {
    n: "03",
    kicker: "LEARN",
    variant: "learn" as const,
    title: "Compounding intelligence",
    objective: "Get smarter every job.",
    footer: ["Own-job memory", "Cross-contractor benchmarks"],
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-ink-800">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark onClick={() => navigate("/")} />
          <nav className="flex items-center gap-7 text-sm text-ink-500">
            <a href="#problem" className="hidden transition-colors hover:text-maroon sm:inline">The problem</a>
            <a href="#agent" className="hidden transition-colors hover:text-maroon sm:inline">The agent</a>
            <a href="#how" className="hidden transition-colors hover:text-maroon sm:inline">How it works</a>
            <button
              onClick={() => navigate("/app")}
              className="group inline-flex items-center gap-1.5 font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              Try the demo
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </nav>
        </div>
      </header>

      {/* 1 — Hero (ops beachhead) */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-24 sm:pb-32 sm:pt-36">
          <motion.p
            {...fadeUp}
            className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400"
          >
            The labor cost intelligence layer for construction
          </motion.p>
          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-8 max-w-5xl text-[2.6rem] font-extrabold leading-[0.98] tracking-[-0.03em] text-maroon sm:text-7xl"
          >
            Stop sweating your margins.{" "}
            <span className="text-brand-600">Start running more jobs.</span>
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-500"
          >
            Miter shows you the numbers. The agent watches them on every job,
            surfaces only what needs your judgment, and — on your approval —
            runs the fix before the margin&apos;s gone.
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-10 flex items-center gap-5"
          >
            <button
              onClick={() => navigate("/app")}
              className="group inline-flex items-center gap-2 text-base font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              Try the demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <span className="h-4 w-px bg-ink-200" />
            <span className="text-sm text-ink-400">Live demo · no setup.</span>
          </motion.div>
        </div>
      </section>

      {/* 2 — The problem (minimal) */}
      <section id="problem" className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          <motion.p
            {...fadeUp}
            className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400"
          >
            The problem
          </motion.p>
          <motion.div
            {...fadeUp}
            className="mt-16 grid grid-cols-2 divide-x divide-ink-200"
          >
            {STATS.map((s) => (
              <Stat key={s.value} {...s} />
            ))}
          </motion.div>
          <motion.p
            {...fadeUp}
            className="mx-auto mt-16 max-w-2xl text-lg leading-relaxed text-ink-600 sm:text-xl"
          >
            The numbers already live in Miter. What&apos;s missing is the
            vigilance to watch every job, the judgment to rank them, and the
            hands to act — and no one can, on every job at once.
          </motion.p>
        </div>
      </section>

      {/* 3 — Margin Agent */}
      <section id="agent" className="border-t border-ink-200 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <motion.div {...fadeUp} className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400">
              Proactive cost intelligence
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-maroon sm:text-5xl">
              Always on. <span className="text-brand-600">On top of your stack.</span>
            </h2>
          </motion.div>

          <motion.div
            {...fadeUp}
            className="mt-16 grid items-center gap-10 lg:grid-cols-[1fr_auto_0.85fr_auto_1.05fr] lg:gap-6"
          >
            {/* INPUTS */}
            <div className="rounded-2xl border border-ink-200 bg-white p-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                Inputs
              </div>
              <ul className="mt-5 space-y-4">
                {INPUTS.map((inp, i) => (
                  <li key={inp.label} className="flex items-start gap-2.5">
                    <span
                      className={`signal-pulse mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        inp.live ? "bg-brand-500" : "bg-ink-300"
                      }`}
                      style={{ animationDelay: `${i * 0.4}s` }}
                    />
                    <span
                      className={`flex-1 text-sm leading-snug ${
                        inp.live ? "text-ink-800" : "text-ink-400"
                      }`}
                    >
                      {inp.label}
                    </span>
                    {inp.live ? (
                      <span className="mt-0.5 shrink-0 text-[9px] font-semibold tracking-[0.15em] text-brand-600">
                        LIVE
                      </span>
                    ) : (
                      <span className="mt-0.5 shrink-0 rounded border border-ink-200 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.15em] text-ink-400">
                        SOON
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-ink-100 pt-4 text-[11px] leading-relaxed text-ink-400">
                No new integrations — the agent runs on the stack Miter already
                connects. A CPM schedule sharpens the forecast; it&apos;s read
                as a signal, never managed.
              </p>
            </div>

            <Connector />

            {/* AGENT — node diagram */}
            <AgentDiagram />

            <Connector />

            {/* JOBS DONE — live agent feed */}
            <div className="rounded-2xl border border-ink-200 bg-white p-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                Jobs done
              </div>

              {/* TODAY — lit, framed as jobs-to-be-done */}
              <div className="mt-5 rounded-xl border border-brand-200 bg-neutral-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                  <span className="signal-pulse h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Today · Ops
                </div>
                <ul className="space-y-2">
                  {JTBD.map((j) => (
                    <li
                      key={j}
                      className="flex items-start gap-2 text-sm font-medium text-maroon"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                      {j}
                    </li>
                  ))}
                </ul>
                <AgentFeed />
              </div>

              {/* SOON — dimmed */}
              <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-4 opacity-70">
                <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
                  Soon · Across the project
                </div>
                <ul className="space-y-1.5">
                  {VALUE_SOON.map((v) => (
                    <li key={v.label} className="text-xs">
                      <span className="font-semibold text-ink-600">
                        {v.label}
                      </span>
                      <span className="text-ink-400"> — {v.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>

          {/* Scope: hold more without holding more stress */}
          <ScopeBand />
        </div>
      </section>

      {/* 4 — What the agent does (the loop) */}
      <section id="how" className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <motion.div {...fadeUp}>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400">
              What the agent does
            </p>
            <h2 className="mt-5 text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-maroon sm:text-5xl">
              See. Act. <span className="text-brand-600">Learn.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-ink-500">
              Three objectives, one closing loop — each compounds the others.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3 lg:items-stretch">
            {OBJECTIVES.map((o, i) => (
              <motion.div
                key={o.n}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 sm:p-8"
              >
                {/* numbered label + optional "on Miter's data" badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-400">
                    {o.n} · {o.kicker}
                  </div>
                  {o.badge && (
                    <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                      {o.badge}
                    </span>
                  )}
                </div>

                {/* minimal node diagram */}
                <CardDiagram variant={o.variant} />

                <h3 className="mt-8 text-xl font-bold tracking-tight text-maroon">
                  {o.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {o.objective}
                </p>
                {o.body && (
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                    {o.body}
                  </p>
                )}

                <ul className="mt-auto space-y-1.5 border-t border-ink-200 pt-5">
                  {o.footer.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-[13px] text-ink-500"
                    >
                      <span className="h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* Built on Miter — the credibility strip */}
          <motion.div {...fadeUp} className="mt-16">
            <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-ink-400">
              Built on Miter — not over it
            </p>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-ink-500">
              Runs on the integrations Miter already has — Procore, Sage, Vista,
              and more. No new plumbing.
            </p>
            <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-2">
              <div className="bg-neutral-50 p-7">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                  Miter gives you
                </div>
                <ul className="mt-4 space-y-2.5">
                  {MITER_GIVES.map((m) => (
                    <li key={m} className="flex items-start gap-2.5 text-sm text-ink-600">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-7">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-600">
                  Margin Agent adds
                </div>
                <ul className="mt-4 space-y-2.5">
                  {AGENT_ADDS.map((a) => (
                    <li key={a} className="flex items-start gap-2.5 text-sm font-medium text-maroon">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>

          <motion.p {...fadeUp} className="mt-12 max-w-3xl text-sm leading-relaxed text-ink-500">
            Margin Agent is the always-on employee you hire to protect margin
            across the whole job — labor-cost vigilance for ops today;
            estimating, finance, and every role that touches margin next.
          </motion.p>
          <p className="mt-3 text-xs text-ink-400">{DISCLAIMER}</p>
        </div>
      </section>

      {/* 5 — Closing CTA */}
      <section className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
          <motion.h2
            {...fadeUp}
            className="text-3xl font-extrabold leading-[1.04] tracking-[-0.02em] text-maroon sm:text-5xl"
          >
            Protect the margin on every job{" "}
            <span className="text-brand-600">you&apos;ve won.</span>
          </motion.h2>
          <motion.p {...fadeUp} className="mx-auto mt-5 max-w-xl text-lg text-ink-500">
            Put an always-on employee on your margin — Margin Agent surfaces the
            risks that matter and takes the fix to done, on your approval.
          </motion.p>
          <motion.div {...fadeUp} className="mt-9">
            <Button size="lg" onClick={() => navigate("/app")}>
              Try the demo <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
          <motion.div {...fadeUp} className="mx-auto mt-10 max-w-xl border-t border-ink-200 pt-6">
            <p className="text-sm font-semibold text-maroon">
              Priced per active job — so what you pay scales with the margin it
              protects.
            </p>
            <p className="mt-1.5 text-sm text-ink-400">
              About a dollar a day per job. A year per job costs a fraction of
              the margin saved on a single at-risk job.
            </p>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-10 text-sm text-ink-400 sm:flex-row">
          <Wordmark onClick={() => navigate("/")} />
          <p>Prototype · {DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}

/* ---- Animated connector track: a signal flowing toward the agent (lg only) ---- */
function Connector() {
  return (
    <div className="relative mx-auto hidden h-px w-12 lg:block">
      <div className="absolute inset-0 top-1/2 h-px -translate-y-1/2 bg-ink-200" />
      <span className="signal-flow absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-500" />
    </div>
  );
}

/* ---- Always-on radar: sweeping line, concentric pulse, signals feeding in ---- */
const SPOKES = [18, 74, 132, 200, 258, 312];
function AgentDiagram() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-square w-56 sm:w-60">
        {/* concentric hairline rings */}
        <div className="absolute inset-0 rounded-full border border-ink-200" />
        <div className="absolute inset-[20%] rounded-full border border-dashed border-ink-200" />
        <div className="absolute inset-[40%] rounded-full border border-ink-200" />
        {/* rotating sweep */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="radar-sweep absolute inset-0 rounded-full" />
        </div>
        {/* concentric pulse rippling out */}
        <div className="radar-ping absolute inset-0 rounded-full border border-brand-300/70" />
        {/* spokes: satellite node (pulse) + inbound particle */}
        {SPOKES.map((deg, i) => (
          <div
            key={deg}
            className="absolute left-1/2 top-1/2 h-px w-[42%] origin-left"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <div className="h-px w-full bg-ink-200" />
            <span
              className="signal-in absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-500"
              style={{ animationDelay: `${i * 0.45}s` }}
            />
            <span
              className={`signal-pulse absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full border ${
                i < 2 ? "border-brand-400 bg-brand-500" : "border-ink-300 bg-white"
              }`}
              style={{ animationDelay: `${i * 0.45}s` }}
            />
          </div>
        ))}
        {/* glowing focal node — two blinking eyes make the agent feel alive */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="node-pulse relative flex h-16 w-16 items-center justify-center gap-1.5 rounded-full bg-brand-600">
            <span className="agent-eye" />
            <span className="agent-eye" />
          </div>
        </div>
      </div>
      <div className="mt-5 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-maroon">
          <span className="signal-pulse h-1.5 w-1.5 rounded-full bg-brand-500" />
          Margin Agent
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-wide text-ink-400">
          monitor · surface · act
        </div>
      </div>
    </div>
  );
}

/* ---- Live agent feed: actions tick in, newest on top ---- */
function AgentFeed() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-40px" });
  const cursor = useRef(3);
  const uid = useRef(3);
  const [items, setItems] = useState(() =>
    FEED.slice(0, 3).map((text, id) => ({ id, text }))
  );

  useEffect(() => {
    if (reduce || !inView) return;
    const t = window.setInterval(() => {
      setItems((prev) => {
        const text = FEED[cursor.current % FEED.length];
        cursor.current += 1;
        return [{ id: uid.current++, text }, ...prev].slice(0, 3);
      });
    }, 2600);
    return () => window.clearInterval(t);
  }, [reduce, inView]);

  return (
    <div ref={ref} className="mt-4 border-t border-brand-200/70 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-600">
        <span className="signal-pulse h-1.5 w-1.5 rounded-full bg-brand-500" />
        Live
      </div>
      {/* Fixed height so ticking actions never resize the box. */}
      <ul className="h-[124px] space-y-1.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, position: "absolute" }}
              transition={{ duration: 0.35 }}
              className="flex items-start gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5"
            >
              <Activity className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" />
              <span className="text-[11px] leading-snug text-ink-600">
                {item.text}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

/* ---- Scope: one PM, five jobs alone vs thirty with the agent ---- */
const SCOPE_TOTAL = 30;
const SCOPE_LIT_ALONE = 5;

function ScopeBand() {
  return (
    <div className="mt-24 border-t border-ink-200 pt-16 sm:mt-32 sm:pt-20">
      <motion.h3
        {...fadeUp}
        className="text-center text-2xl font-extrabold tracking-[-0.02em] text-maroon sm:text-4xl"
      >
        Hold more without{" "}
        <span className="text-brand-600">holding more stress.</span>
      </motion.h3>
      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <ScopeCard state="alone" />
        <ScopeCard state="agent" />
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-ink-500">
        One agent watching every job means your judgment runs thirty as calmly
        as five.
      </p>
    </div>
  );
}

function ScopeCard({ state }: { state: "alone" | "agent" }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const isAgent = state === "agent";

  return (
    <div
      ref={ref}
      className={`rounded-2xl border p-6 ${
        isAgent ? "border-brand-200 bg-white" : "border-ink-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-maroon text-white">
          <HardHat className="h-5 w-5" />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
            {isAgent ? "With the agent" : "Alone"}
          </div>
          <div className="text-sm font-semibold text-maroon">
            {isAgent ? "All 30 jobs watched" : "~5 jobs you can really watch"}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-10 gap-1.5">
        {Array.from({ length: SCOPE_TOTAL }).map((_, i) => {
          if (!isAgent) {
            return (
              <span
                key={i}
                className={`aspect-square rounded-[3px] ${
                  i < SCOPE_LIT_ALONE ? "bg-brand-500" : "bg-ink-100"
                }`}
              />
            );
          }
          const lit = inView || reduce;
          const delay = i < SCOPE_LIT_ALONE ? 0 : 0.3 + (i - SCOPE_LIT_ALONE) * 0.03;
          return (
            <motion.span
              key={i}
              className="aspect-square rounded-[3px]"
              initial={{ backgroundColor: "#f1f5f9" }}
              animate={{ backgroundColor: lit ? "#7c5cff" : "#f1f5f9" }}
              transition={{ duration: 0.4, delay: reduce ? 0 : delay }}
            />
          );
        })}
      </div>

      {isAgent && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2">
          <span className="node-pulse relative flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
            <Radar className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-medium text-brand-700">
            Margin Agent · watching all 30
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- Per-card minimal node diagrams (one glowing focal node each) ---- */
const DIA_LINE = "#cbd5e1"; // ink-300
const DIA_BRAND = "#6938ef"; // brand-600
const DIA_MAROON = "#260f14";

function Focal({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="15" fill={DIA_BRAND} opacity="0.12" />
      <circle cx={cx} cy={cy} r="7.5" fill={DIA_BRAND} />
    </>
  );
}

function CardDiagram({ variant }: { variant: "see" | "act" | "learn" }) {
  // ACT is the human-in-the-loop step — show it explicitly: agent proposes,
  // you approve, the work gets done.
  if (variant === "act") return <ActDiagram />;

  return (
    <svg
      viewBox="0 0 320 80"
      preserveAspectRatio="xMidYMid meet"
      className="mt-7 h-[84px] w-full"
      fill="none"
      aria-hidden
    >
      <defs>
        <marker
          id={`arw-${variant}`}
          markerWidth="7"
          markerHeight="7"
          refX="3.5"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" fill={DIA_BRAND} />
        </marker>
      </defs>

      {variant === "see" && (
        <>
          {[20, 40, 60].map((y) => (
            <line key={y} x1="28" y1={y} x2="202" y2="40" stroke={DIA_LINE} strokeWidth="1.2" />
          ))}
          {[20, 40, 60].map((y) => (
            <circle key={`n${y}`} cx="24" cy={y} r="3.5" fill={DIA_LINE} />
          ))}
          <line x1="220" y1="40" x2="286" y2="40" stroke={DIA_LINE} strokeWidth="1.2" strokeDasharray="3 4" />
          <circle cx="292" cy="40" r="3.5" fill={DIA_LINE} />
          <Focal cx={210} cy={40} />
        </>
      )}

      {variant === "learn" && (
        <>
          <line x1="130" y1="48" x2="214" y2="48" stroke={DIA_LINE} strokeWidth="1.2" />
          <circle cx="220" cy="48" r="4" fill={DIA_LINE} />
          <path d="M222,42 C232,8 116,6 116,38" stroke={DIA_BRAND} strokeWidth="1.5" markerEnd={`url(#arw-${variant})`} />
          <Focal cx={120} cy={48} />
        </>
      )}
    </svg>
  );
}

/* ---- ACT diagram: the human in the loop — agent proposes, you approve, done ---- */
function ActDiagram() {
  return (
    <div className="mt-7 flex h-[84px] items-center justify-center gap-1 sm:gap-2">
      <FlowNode tone="agent" label="Agent" icon={<Radar className="h-4 w-4" />} />
      <ArrowRight className="mt-3 h-4 w-4 shrink-0 self-start text-ink-300" />
      <FlowNode tone="human" label="You approve" icon={<HardHat className="h-4 w-4" />} />
      <ArrowRight className="mt-3 h-4 w-4 shrink-0 self-start text-ink-300" />
      <FlowNode tone="done" label="Done" icon={<Check className="h-4 w-4" />} />
    </div>
  );
}

function FlowNode({
  tone,
  label,
  icon,
}: {
  tone: "agent" | "human" | "done";
  label: string;
  icon: ReactNode;
}) {
  const ring =
    tone === "agent"
      ? "node-pulse bg-brand-600 text-white"
      : tone === "human"
      ? "border-2 border-brand-500 bg-white text-brand-600"
      : "bg-maroon text-white";
  return (
    <div className="flex w-[58px] flex-col items-center gap-2 sm:w-[72px]">
      <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${ring}`}>
        {icon}
      </div>
      <span
        className={`text-center text-[9px] uppercase tracking-[0.1em] ${
          tone === "human" ? "font-semibold text-brand-600" : "text-ink-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ---- A single static stat (constant box, no count-up jitter) ---- */
function Stat({
  value,
  caption,
  source,
}: {
  value: string;
  caption: string;
  source: string;
}) {
  return (
    <div className="px-3 sm:px-6">
      <div className="tabular text-5xl font-extrabold tracking-[-0.03em] text-maroon sm:text-6xl">
        {value}
      </div>
      <p className="mx-auto mt-4 max-w-[16rem] text-sm leading-relaxed text-ink-500">
        {caption}
      </p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-400">
        {source}
      </p>
    </div>
  );
}

