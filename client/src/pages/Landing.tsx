import { motion } from "framer-motion";
import {
  ArrowRight,
  Activity,
  Eye,
  ListFilter,
  CheckCircle2,
  Workflow,
  GraduationCap,
  FileText,
  TrendingDown,
  AlertTriangle,
  Check,
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

const LOOP = [
  { icon: Eye, title: "Monitor", body: "Every active job's labor cost, in real time, off the payroll system." },
  { icon: ListFilter, title: "Surface", body: "Only the few cost creeps that matter — ranked by margin at risk." },
  { icon: CheckCircle2, title: "Approve", body: "You review the proposed plan. Nothing executes without your call." },
  { icon: Workflow, title: "Act", body: "The agent runs multi-step work: change order, reforecast, alert, budget." },
  { icon: GraduationCap, title: "Learn", body: "Actuals from each job sharpen the benchmarks." },
  { icon: TrendingDown, title: "Bid smarter", body: "Price the next job on what work actually costs you." },
];

const FEED = [
  "Flagged Job 412 rough-in 23% over budget → drafted change order",
  "Reforecast Job 207 margin after ductwork labor overrun",
  "Caught labor under-recovery on Job 132 → $34k under-billed T&M",
  "Updated live budget on Job 88 finish/devices rework",
  "Learned actuals from completed Job 51 → tightened electrical rough-in benchmark",
  "Rebaselined Job 189 cost-to-complete on switchgear hours",
  "Flagged margin erosion on Job 207 → alerted PM with variance summary",
  "Closed change order on Job 145 → recovered 3.1 margin points",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-ink-50/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark onClick={() => navigate("/")} />
          <nav className="flex items-center gap-6 text-sm text-ink-600">
            <a href="#loop" className="hidden hover:text-ink-900 sm:inline">The loop</a>
            <a href="#feed" className="hidden hover:text-ink-900 sm:inline">Agent activity</a>
            <Button size="sm" onClick={() => navigate("/app")}>
              Try the demo
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid bg-grid-fade absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
          <motion.div {...fadeUp}>
            <Badge tone="brand">
              <Activity className="h-3.5 w-3.5" />
              The job-cost intelligence layer for construction
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
            className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-600"
          >
            Cubit watches every active job&apos;s labor cost in real time,
            surfaces the creep that quietly erodes margin — only what matters —
            and takes multi-step action to protect it, on your approval. Then it
            bids your next job smarter.
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
              Meet Margin Watch — the always-on agent for your portfolio.
            </span>
          </motion.div>

          {/* Hero portfolio teaser */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-16"
          >
            <PortfolioTeaser />
          </motion.div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp} className="grid gap-10 lg:grid-cols-2">
            <div>
              <Badge tone="danger">The problem</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                You win the job. The margin leaks after.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-600">
                A contractor running tens — or hundreds — of concurrent jobs
                can&apos;t watch every cost code. Labor cost creep is invisible
                until closeout, and by then the margin&apos;s already gone. The
                cost reports tell you what happened; they can&apos;t tell you
                while there&apos;s still time to act.
              </p>
            </div>
            <div className="flex items-center">
              <MarginErosionChart />
            </div>
          </motion.div>
        </div>
      </section>

      {/* The loop */}
      <section id="loop" className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp}>
            <Badge tone="brand">The product is a loop</Badge>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight">
              A closed loop that protects margin — and compounds.
            </h2>
            <p className="mt-3 max-w-2xl text-ink-600">
              Monitoring is the wedge. Every other step builds on it, and the
              loop closes back into a sharper bid.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((step, i) => (
              <motion.div
                key={step.title}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                className="relative rounded-xl border border-ink-200 bg-white p-6 shadow-soft"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs text-ink-400">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                  {step.body}
                </p>
                {i < LOOP.length - 1 && (
                  <ArrowRight className="absolute right-4 top-6 hidden h-4 w-4 text-ink-300 lg:block" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent activity feed */}
      <section id="feed" className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <motion.div {...fadeUp}>
              <Badge tone="brand">Agent activity</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Real work, all job-cost, all the time.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-600">
                Cubit doesn&apos;t just alert. It drafts the change order,
                reforecasts the margin, alerts the PM, and updates the budget —
                multi-step actions you approve. Every item is about cost and
                margin. Nothing else.
              </p>
              <p className="mt-4 text-sm text-ink-500">{DISCLAIMER}</p>
            </motion.div>
            <motion.div {...fadeUp} className="space-y-2.5">
              {FEED.map((item, i) => (
                <motion.div
                  key={i}
                  {...fadeUp}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className="flex items-start gap-3 rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3"
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm text-ink-700">{item}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why only us */}
      <section className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp} className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Badge tone="brand">Why only us</Badge>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                We sit on the payroll. So we see true labor cost.
              </h2>
              <p className="mt-4 text-ink-600">
                Cost books are stale averages. Single-tenant ERPs only see your
                own jobs after the fact. Cubit reads burdened labor cost as the
                hours are booked — and tells you the three jobs that matter, not
                two hundred alerts.
              </p>
            </div>
            <div className="grid gap-4 lg:col-span-2 sm:grid-cols-3">
              {[
                { t: "Stale cost books", d: "Annual national averages, blind to this job.", bad: true },
                { t: "Single-tenant ERP", d: "Sees only your history, only at closeout.", bad: true },
                { t: "Cubit", d: "Live burdened labor cost, prioritized, with action.", bad: false },
              ].map((c) => (
                <div
                  key={c.t}
                  className={`rounded-xl border p-5 ${
                    c.bad
                      ? "border-ink-200 bg-white"
                      : "border-brand-200 bg-brand-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {c.bad ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      <Logo className="h-4 w-4" />
                    )}
                    <h3 className={`font-semibold ${c.bad ? "text-ink-700" : "text-brand-800"}`}>
                      {c.t}
                    </h3>
                  </div>
                  <p className={`mt-2 text-sm ${c.bad ? "text-ink-500" : "text-brand-700"}`}>
                    {c.d}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-ink-200 bg-gradient-to-b from-white to-brand-50">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <motion.h2
            {...fadeUp}
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            The cost-intelligence layer construction runs on.
          </motion.h2>
          <motion.p {...fadeUp} className="mx-auto mt-4 max-w-xl text-ink-600">
            Protect the margin on every job you&apos;ve won — then bid the next
            one on the truth.
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
          <span className="text-sm font-semibold text-ink-800">Margin Watch</span>
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
        <div className="px-2 pt-0.5 text-[11px] text-ink-400">+ 12 more tracking on budget</div>
      </div>

      <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
        Most jobs sit quiet. Cubit surfaces only the few that need you — ranked by
        margin at risk, each with a plan ready to approve.
      </p>
    </div>
  );
}

/* ---- Problem: a margin line eroding to a "too late" marker ---- */
function MarginErosionChart() {
  const pts = "0,20 60,28 120,30 180,44 240,60 300,96";
  return (
    <div className="w-full rounded-2xl border border-ink-200 bg-white p-6 shadow-soft">
      <div className="mb-3 flex items-center justify-between text-xs text-ink-500">
        <span>Projected margin</span>
        <span className="flex items-center gap-1 text-rose-600">
          <FileText className="h-3.5 w-3.5" /> Found at closeout
        </span>
      </div>
      <svg viewBox="0 0 300 110" className="w-full">
        <defs>
          <linearGradient id="erode" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fecaca" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fecaca" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,110 ${pts} 300,110`}
          fill="url(#erode)"
          stroke="none"
        />
        <polyline points={pts} fill="none" stroke="#e11d48" strokeWidth="2.5" />
        <circle cx="300" cy="96" r="4" fill="#e11d48" />
        <line x1="180" y1="0" x2="180" y2="110" stroke="#7c5cff" strokeDasharray="4 4" strokeWidth="1.5" />
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        <span>Award</span>
        <span className="text-brand-600">← Cubit acts here</span>
        <span>Closeout</span>
      </div>
    </div>
  );
}
