import { useEffect, useRef, useState } from "react";
import { motion, animate, useInView } from "framer-motion";
import {
  ArrowRight,
  Activity,
  Eye,
  Workflow,
  GraduationCap,
  AlertTriangle,
  Check,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { Wordmark, Logo, DISCLAIMER } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { navigate } from "@/App";
import { usd, usdK } from "@/lib/utils";
import { flaggedJobs, calmJobs } from "@/lib/seed";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5 },
};

/* ---- Section 2 data: inputs → agent → value ---- */
const INPUTS = [
  { label: "Miter Payroll & Labor", live: true },
  { label: "Job budgets & cost codes", live: true },
  { label: "Procore / PMS — progress & change orders", live: false },
  { label: "Sage / Foundation ERP", live: false },
  { label: "Field time tracking", live: false },
];

const VALUE_TODAY = [
  { label: "Margin protected on live jobs", desc: "Caught before closeout" },
  { label: "Real-time cost control", desc: "Act while there's still time" },
  { label: "Only what matters", desc: "Ranked by margin at risk" },
];

const VALUE_SOON = [
  { label: "Preconstruction", desc: "bid on what work really costs" },
  { label: "Finance", desc: "live margin & WIP across the portfolio" },
];

/* ---- Section 3 data: the problem, big numbers ---- */
const STATS = [
  {
    render: (t: number) => `${Math.round(40 * t)}–${Math.round(60 * t)}%`,
    caption: "of a job's cost is labor — the largest, least controllable line",
    source: "Construction Cost Accounting",
  },
  {
    render: (t: number) => `${Math.round(5 * t)}–${Math.round(10 * t)}%`,
    caption: "typical contractor net margin — one bad job erases it",
    source: "CFMA benchmarks",
  },
  {
    render: (t: number) => `${Math.round(40 * t)}%`,
    caption: "of contractors underestimate labor by 10%+",
    source: "Projul",
  },
  {
    render: (t: number) => `$${Math.round(273 * t)}B`,
    caption: "lost yearly to estimating errors (up to 20% of project cost)",
    source: "NCHRP",
  },
];

/* ---- Section 4 data: the agent loop ---- */
const OBJECTIVES = [
  {
    n: "01",
    icon: Eye,
    kicker: "SEE",
    title: "Total cost visibility",
    objective: "See everything, miss nothing.",
    body: "Watches every active job's labor cost in real time and surfaces only the few risks that matter — ranked by margin at risk — in one live portfolio view.",
    footer: ["Portfolio roll-up (WIP)", "Margin-protected tally", "Cash-flow forecast"],
  },
  {
    n: "02",
    icon: Workflow,
    kicker: "ACT",
    title: "Governed agentic action",
    objective: "Fix it — with you in control.",
    body: "For a flagged risk, the agent proposes and executes the multi-step fix — draft change order, reforecast, alert PM, update budget — on your approval, within limits you set, fully logged.",
    footer: ["Approval gate", "Autonomy thresholds", "Audit trail"],
    hero: true,
    actions: [
      "Flagged Job 412 rough-in 23% over → drafted change order",
      "Caught labor under-recovery on Job 132 → $34k under-billed",
      "Closed change order on Job 145 → recovered 3.1 margin points",
    ],
  },
  {
    n: "03",
    icon: GraduationCap,
    kicker: "LEARN",
    title: "Compounding intelligence",
    objective: "Get smarter every job.",
    body: "Every completed job's actuals sharpen the benchmarks, so the next bid is priced on what work really costs — your own history first, then the whole Miter network.",
    footer: ["Own-job memory", "Cross-contractor benchmarks"],
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-ink-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark onClick={() => navigate("/")} />
          <nav className="flex items-center gap-6 text-sm text-ink-600">
            <a href="#agent" className="hidden hover:text-ink-900 sm:inline">The agent</a>
            <a href="#problem" className="hidden hover:text-ink-900 sm:inline">The problem</a>
            <a href="#how" className="hidden hover:text-ink-900 sm:inline">How it works</a>
            <Button size="sm" onClick={() => navigate("/app")}>
              Try the demo
            </Button>
          </nav>
        </div>
      </header>

      {/* 1 — Hero (ops beachhead) */}
      <section className="relative overflow-hidden">
        <div className="bg-grid bg-grid-fade absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
          <motion.div {...fadeUp}>
            <Badge tone="brand">
              <Activity className="h-3.5 w-3.5" />
              The labor cost intelligence layer for construction
            </Badge>
          </motion.div>
          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
          >
            Stop margin from leaking on jobs you&apos;ve already{" "}
            <span className="text-brand-600">won</span>.
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 max-w-3xl text-lg leading-relaxed text-ink-600"
          >
            Built for the ops team running the work: the Cost Risk Agent watches
            every active job&apos;s labor cost in real time, surfaces only the
            risks that matter, and — on your approval — takes the multi-step fix
            all the way to done.
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            <Button size="lg" onClick={() => navigate("/app")}>
              Try the demo <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-ink-500">
              Live demo on a seeded portfolio — no setup.
            </span>
          </motion.div>

          {/* Hero portfolio card */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-16"
          >
            <PortfolioTeaser />
          </motion.div>
        </div>
      </section>

      {/* 2 — The Cost Risk Agent (dark command-center band) */}
      <section
        id="agent"
        className="relative overflow-hidden border-y border-white/10 bg-[#0a0a12] text-white"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,92,255,0.18),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_50%_45%,rgba(45,212,191,0.10),transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <motion.div {...fadeUp} className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_2px_rgba(45,212,191,0.6)]" />
              The Cost Risk Agent
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Always on. On top of your stack.
            </h2>
          </motion.div>

          <motion.div
            {...fadeUp}
            className="mt-14 grid items-center gap-8 lg:grid-cols-[1fr_auto_0.9fr_auto_1.05fr]"
          >
            {/* INPUTS */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Inputs
              </div>
              <ul className="mt-4 space-y-3">
                {INPUTS.map((inp) => (
                  <li key={inp.label} className="flex items-center gap-2.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        inp.live
                          ? "bg-teal-400 shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]"
                          : "bg-white/20"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        inp.live ? "text-white/85" : "text-white/40"
                      }`}
                    >
                      {inp.label}
                    </span>
                    {inp.live ? (
                      <span className="ml-auto text-[9px] font-semibold tracking-[0.15em] text-teal-300/80">
                        LIVE
                      </span>
                    ) : (
                      <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.15em] text-white/35">
                        SOON
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <Connector />

            {/* AGENT — radar */}
            <RadarVisual />

            <Connector />

            {/* WHAT YOU GET */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                What you get
              </div>

              {/* TODAY — lit */}
              <div className="mt-4 rounded-xl border border-teal-400/30 bg-teal-400/[0.07] p-4 shadow-[0_0_24px_-8px_rgba(45,212,191,0.4)]">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  Today · Ops
                </div>
                <ul className="space-y-3">
                  {VALUE_TODAY.map((v) => (
                    <li key={v.label}>
                      <div className="text-sm font-semibold text-white">
                        {v.label}
                      </div>
                      <div className="text-xs text-white/55">{v.desc}</div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* SOON — dimmed */}
              <div className="mt-4 rounded-xl border border-white/[0.07] p-4 opacity-60">
                <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Soon · Across the project
                </div>
                <ul className="space-y-1.5">
                  {VALUE_SOON.map((v) => (
                    <li key={v.label} className="text-xs">
                      <span className="font-semibold text-white/55">
                        {v.label}
                      </span>
                      <span className="text-white/35"> — {v.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3 — The problem (big numbers) */}
      <section id="problem" className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp}>
            <Badge tone="danger">The problem</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Margin leaks where no one&apos;s looking.
            </h2>
          </motion.div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Stat key={i} {...s} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </section>

      {/* 4 — What the agent does (the loop) */}
      <section id="how" className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp}>
            <Badge tone="brand">What the agent does</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              See. Act. Learn.
            </h2>
            <p className="mt-3 max-w-2xl text-ink-600">
              Three objectives, one closing loop — each compounds the others.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-start">
            {OBJECTIVES.map((o, i) => (
              <motion.div
                key={o.n}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className={
                  o.hero
                    ? "relative rounded-2xl border-2 border-brand-300 bg-gradient-to-b from-brand-50 to-white p-6 shadow-glow lg:-mt-3"
                    : "relative rounded-2xl border border-ink-200 bg-white p-6 shadow-soft"
                }
              >
                {o.hero && (
                  <div className="absolute -top-3 left-6 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-soft">
                    The ops beachhead · live today
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      o.hero
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-600"
                    }`}
                  >
                    <o.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-ink-400">{o.n}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  <span className="font-mono text-sm text-brand-600">
                    {o.kicker}
                  </span>
                  <span className="text-ink-300"> · </span>
                  {o.title}
                </h3>
                <p className="mt-1 text-sm font-semibold text-ink-800">
                  {o.objective}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {o.body}
                </p>

                {o.actions && (
                  <div className="mt-4 space-y-1.5">
                    {o.actions.map((a) => (
                      <div
                        key={a}
                        className="flex items-start gap-2 rounded-lg border border-brand-100 bg-white/70 px-3 py-2"
                      >
                        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                        <span className="text-xs text-ink-700">{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-1.5 border-t border-ink-100 pt-4">
                  {o.footer.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium text-ink-600"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.p {...fadeUp} className="mt-8 text-sm text-ink-500">
            Today: the ops team. Next: smarter bids for preconstruction, a live
            margin roll-up for finance.
          </motion.p>
          <p className="mt-3 text-xs text-ink-400">{DISCLAIMER}</p>
        </div>
      </section>

      {/* 5 — Closing CTA */}
      <section className="border-t border-ink-200 bg-gradient-to-b from-white to-brand-50">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <motion.h2
            {...fadeUp}
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Protect the margin on every job you&apos;ve won.
          </motion.h2>
          <motion.p {...fadeUp} className="mx-auto mt-4 max-w-xl text-ink-600">
            See the Cost Risk Agent work a live portfolio — surface the risks
            that matter and take the fix to done, on your approval.
          </motion.p>
          <motion.div {...fadeUp} className="mt-8">
            <Button size="lg" onClick={() => navigate("/app")}>
              Try the demo <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-ink-500 sm:flex-row">
          <Wordmark onClick={() => navigate("/")} />
          <p>Prototype · {DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}

/* ---- Connector arrow between the three panels (lg only) ---- */
function Connector() {
  return (
    <div className="hidden items-center justify-center lg:flex">
      <ArrowRight className="h-5 w-5 text-white/25" />
    </div>
  );
}

/* ---- The radar / pulse visual at the center of the agent band ---- */
function RadarVisual() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-square w-52 sm:w-56">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.12),transparent_70%)]" />
        {/* concentric rings */}
        <div className="absolute inset-0 rounded-full border border-teal-400/15" />
        <div className="absolute inset-[15%] rounded-full border border-teal-400/15" />
        <div className="absolute inset-[30%] rounded-full border border-teal-400/15" />
        {/* cross hairs */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-teal-400/10" />
        <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-teal-400/10" />
        {/* sweeping line */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="radar-sweep absolute inset-0 rounded-full" />
        </div>
        {/* pulse */}
        <div className="radar-ping absolute inset-0 rounded-full border border-teal-300/40" />
        {/* blips */}
        <span className="absolute left-[68%] top-[34%] h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_8px_2px_rgba(45,212,191,0.7)]" />
        <span className="absolute left-[32%] top-[62%] h-1 w-1 rounded-full bg-brand-400 shadow-[0_0_6px_1px_rgba(167,139,250,0.7)]" />
        {/* center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-teal-400/30 bg-[#0a0a12]/80 text-teal-300">
            <Radar className="h-5 w-5" />
          </div>
          <span className="mt-2 max-w-[88px] text-[10px] font-semibold uppercase leading-tight tracking-[0.15em] text-white/80">
            Cost Risk Agent
          </span>
        </div>
      </div>
      <div className="mt-4 font-mono text-[11px] tracking-wide text-teal-300/70">
        monitor · surface · act
      </div>
    </div>
  );
}

/* ---- A single count-up stat block (animates on scroll into view) ---- */
function Stat({
  render,
  caption,
  source,
  delay = 0,
}: {
  render: (t: number) => string;
  caption: string;
  source: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, 1, {
      duration: 1.2,
      delay,
      ease: "easeOut",
      onUpdate: (v) => setT(v),
    });
    return () => controls.stop();
  }, [inView, delay]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="rounded-xl border border-ink-200 bg-white p-6 shadow-soft"
    >
      <div className="tabular text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
        {render(t)}
      </div>
      <div className="mt-3 h-px w-8 bg-brand-300" />
      <p className="mt-3 text-sm leading-relaxed text-ink-600">{caption}</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-400">
        {source}
      </p>
    </motion.div>
  );
}

/* ---- Hero teaser: a calm portfolio with one job lighting up ---- */
function PortfolioTeaser() {
  const flag = flaggedJobs()[0];
  const quiet = calmJobs().slice(0, 3);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200 bg-white p-4 shadow-lift sm:p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4" />
          <span className="text-sm font-semibold text-ink-800">
            Cost Risk Agent
          </span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
          </span>
        </div>
        <span className="tabular text-xs text-ink-500">
          {usd(214000)} protected · 16 jobs monitored
        </span>
      </div>

      {/* The one that needs you */}
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
        Needs you
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-800">
              Job {flag.number} · {flag.name}
            </div>
            <div className="truncate text-xs text-ink-500">
              {flag.flag!.costCodeName} {flag.flag!.overPct}% over budget
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="tabular text-sm font-semibold text-rose-600">
            {usdK(flag.flag!.marginAtRisk)} at risk
          </span>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            Plan ready
          </span>
        </div>
      </motion.div>

      {/* The quiet majority */}
      <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
        On budget
      </div>
      <div className="space-y-1">
        {quiet.map((job, i) => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.08 }}
            className="flex items-center justify-between rounded-md px-2 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-2.5 w-2.5" />
              </span>
              <span className="truncate text-xs text-ink-600">
                Job {job.number} · {job.name}
              </span>
            </div>
            <span className="tabular shrink-0 text-[11px] text-ink-400">
              on budget
            </span>
          </motion.div>
        ))}
        <div className="px-2 pt-0.5 text-[11px] text-ink-400">
          + 12 more tracking on budget
        </div>
      </div>

      <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
        Most jobs sit quiet. The agent surfaces only the few that need you —
        ranked by margin at risk, each with a plan ready to approve.
      </p>
    </div>
  );
}
