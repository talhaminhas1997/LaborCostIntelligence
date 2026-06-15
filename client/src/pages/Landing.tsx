import { useEffect, useRef, useState } from "react";
import { motion, animate, useInView } from "framer-motion";
import { ArrowRight, Radar } from "lucide-react";
import { Wordmark, DISCLAIMER } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { navigate } from "@/App";

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
  { label: "Schedule / % complete (Procore / PMS)", live: false },
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

/* ---- Section 3 data: the problem, big numbers ----
 * All three from McKinsey Global Institute, "Reinventing Construction: A Route
 * to Higher Productivity" (Feb 2017) — the authoritative source on construction
 * productivity. The earlier labor/margin figures (Construction Cost Accounting,
 * CFMA, Projul, NCHRP) were dropped: vague or unverifiable provenance. */
const STATS = [
  {
    render: (t: number) => `${Math.round(1 * t)}%`,
    caption:
      "construction's average annual productivity growth over two decades — a third of the wider economy's",
    source: "McKinsey Global Institute · Reinventing Construction, 2017",
  },
  {
    render: (t: number) => `${Math.round(80 * t)}%`,
    caption:
      "how far over budget large projects run — while finishing ~20% behind schedule",
    source: "McKinsey Global Institute · Reinventing Construction, 2017",
  },
  {
    render: (t: number) => `$${(1.6 * t).toFixed(1)}T`,
    caption:
      "annual value lost to the productivity gap — about 2% of global GDP",
    source: "McKinsey Global Institute · Reinventing Construction, 2017",
  },
];

/* ---- Section 4 data: the agent loop ---- */
const OBJECTIVES = [
  {
    n: "01",
    kicker: "SEE",
    variant: "see" as const,
    title: "Total cost visibility",
    objective: "See everything, miss nothing.",
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
            <a href="#agent" className="hidden transition-colors hover:text-maroon sm:inline">The agent</a>
            <a href="#problem" className="hidden transition-colors hover:text-maroon sm:inline">The problem</a>
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
            Your proactive cost agent watches labor cost on every job, surfaces
            only what needs your judgment, and — on your approval — handles the
            fix before the margin&apos;s gone.
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

      {/* 2 — Cost Agent */}
      <section id="agent" className="border-t border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <motion.div {...fadeUp} className="text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400">
              Cost Agent
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
              <ul className="mt-5 space-y-3.5">
                {INPUTS.map((inp) => (
                  <li key={inp.label} className="flex items-center gap-2.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        inp.live ? "bg-brand-500" : "bg-ink-300"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        inp.live ? "text-ink-800" : "text-ink-400"
                      }`}
                    >
                      {inp.label}
                    </span>
                    {inp.live ? (
                      <span className="ml-auto text-[9px] font-semibold tracking-[0.15em] text-brand-600">
                        LIVE
                      </span>
                    ) : (
                      <span className="ml-auto rounded border border-ink-200 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.15em] text-ink-400">
                        SOON
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-ink-100 pt-4 text-[11px] leading-relaxed text-ink-400">
                Schedule / % complete sharpens the cost-at-completion forecast —
                read as a signal, never managed.
              </p>
            </div>

            <Connector />

            {/* AGENT — node diagram */}
            <AgentDiagram />

            <Connector />

            {/* WHAT YOU GET */}
            <div className="rounded-2xl border border-ink-200 bg-white p-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
                What you get
              </div>

              {/* TODAY — lit */}
              <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Today · Ops
                </div>
                <ul className="space-y-3">
                  {VALUE_TODAY.map((v) => (
                    <li key={v.label}>
                      <div className="text-sm font-semibold text-maroon">
                        {v.label}
                      </div>
                      <div className="text-xs text-ink-500">{v.desc}</div>
                    </li>
                  ))}
                </ul>
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
        </div>
      </section>

      {/* 3 — The problem (big numbers) */}
      <section id="problem" className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <motion.div {...fadeUp}>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-ink-400">
              The problem
            </p>
            <h2 className="mt-5 max-w-3xl text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-maroon sm:text-5xl">
              Margin leaks{" "}
              <span className="text-brand-600">where no one&apos;s looking.</span>
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink-500">
              Jobs don&apos;t bleed margin in the abstract — they bleed when they
              fall behind. Schedule slippage shows up as labor burning faster
              than the budget assumed, and by the time it&apos;s visible at
              closeout, the margin&apos;s gone.
            </p>
          </motion.div>
          <div className="mt-16 grid grid-cols-1 gap-y-12 sm:grid-cols-3 lg:flex lg:divide-x lg:divide-ink-200">
            {STATS.map((s, i) => (
              <Stat key={i} {...s} delay={i * 0.08} />
            ))}
          </div>
          <p className="mt-12 text-xs text-ink-400">
            Informed by conversations with project managers, project engineers,
            and owners.
          </p>
        </div>
      </section>

      {/* 4 — What the agent does (the loop) */}
      <section id="how" className="border-t border-ink-200 bg-ink-50">
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
                className="flex flex-col rounded-2xl border border-ink-200 bg-white p-8"
              >
                {/* numbered label */}
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-400">
                  {o.n} · {o.kicker}
                </div>

                {/* minimal node diagram */}
                <CardDiagram variant={o.variant} />

                <h3 className="mt-8 text-xl font-bold tracking-tight text-maroon">
                  {o.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {o.objective}
                </p>

                <ul className="mt-6 space-y-1.5 border-t border-ink-200 pt-5">
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

          <motion.p {...fadeUp} className="mt-10 text-sm text-ink-500">
            Today: the ops team. Next: smarter bids for preconstruction, a live
            margin roll-up for finance.
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
            See Cost Agent work a live portfolio — surface the risks
            that matter and take the fix to done, on your approval.
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

      <footer className="border-t border-ink-200 bg-ink-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-10 text-sm text-ink-400 sm:flex-row">
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
      <ArrowRight className="h-5 w-5 text-ink-300" />
    </div>
  );
}

/* ---- Minimal node-and-connector diagram with one glowing focal node ---- */
const SPOKES = [18, 74, 132, 200, 258, 312];
function AgentDiagram() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative aspect-square w-56 sm:w-60">
        {/* concentric hairline rings */}
        <div className="absolute inset-0 rounded-full border border-ink-200" />
        <div className="absolute inset-[20%] rounded-full border border-dashed border-ink-200" />
        {/* spokes + satellite nodes */}
        {SPOKES.map((deg, i) => (
          <div
            key={deg}
            className="absolute left-1/2 top-1/2 h-px w-[42%] origin-left"
            style={{ transform: `rotate(${deg}deg)` }}
          >
            <div className="h-px w-full bg-ink-200" />
            <span
              className={`absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full border ${
                i < 2
                  ? "border-brand-400 bg-brand-500"
                  : "border-ink-300 bg-white"
              }`}
            />
          </div>
        ))}
        {/* glowing focal node */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="node-pulse relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white">
            <Radar className="h-6 w-6" />
          </div>
        </div>
      </div>
      <div className="mt-5 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-maroon">
          Cost Agent
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-wide text-ink-400">
          monitor · surface · act
        </div>
      </div>
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

      {variant === "act" && (
        <>
          <circle cx="30" cy="40" r="3.5" fill={DIA_LINE} />
          <line x1="34" y1="40" x2="104" y2="40" stroke={DIA_LINE} strokeWidth="1.2" />
          <line x1="122" y1="40" x2="192" y2="40" stroke={DIA_LINE} strokeWidth="1.2" />
          <rect x="201" y="33" width="14" height="14" rx="2" transform="rotate(45 208 40)" stroke={DIA_BRAND} strokeWidth="1.5" fill="white" />
          <line x1="220" y1="40" x2="286" y2="40" stroke={DIA_LINE} strokeWidth="1.2" />
          <circle cx="292" cy="40" r="4" fill={DIA_MAROON} />
          <Focal cx={112} cy={40} />
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
      className="lg:flex-1 lg:px-8 lg:first:pl-0 lg:last:pr-0"
    >
      <div className="tabular text-5xl font-extrabold tracking-[-0.03em] text-maroon sm:text-6xl">
        {render(t)}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-500">{caption}</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-400">
        {source}
      </p>
    </motion.div>
  );
}

