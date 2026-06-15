import Link from "next/link";
import { Wordmark, Logo } from "@/components/Brand";

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      {/* ===== Nav ===== */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <nav className="flex items-center gap-6 text-sm text-slate-300">
          <a href="#how" className="hidden hover:text-white sm:inline">
            How it works
          </a>
          <a href="#why" className="hidden hover:text-white sm:inline">
            Why only us
          </a>
          <Link
            href="/app"
            className="rounded-md border border-white/15 bg-white/5 px-4 py-2 font-medium text-white transition hover:border-accent/60 hover:bg-accent/10"
          >
            Open the tool
          </Link>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative">
        <div className="bg-grid bg-grid-fade absolute inset-0 -z-10" />
        <div
          className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-accent/10 via-transparent to-transparent"
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Pre-bid labor intelligence · for trade contractors
          </div>

          <h1 className="mt-7 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
            The labor cost intelligence layer for{" "}
            <span className="text-accent">construction</span>.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            Cubit tells contractors what a job will{" "}
            <span className="font-semibold text-white">actually</span> cost in
            labor — before they bid — powered by cross-contractor payroll data
            only a system-of-record could have.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3.5 text-base font-semibold text-ink-950 shadow-lg shadow-accent/20 transition hover:bg-accent-soft"
            >
              Try the demo
              <svg
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <span className="text-sm text-slate-400">
              No signup. Runs a live estimate analysis in seconds.
            </span>
          </div>

          {/* Stat strip */}
          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 border-t border-white/10 pt-8 sm:grid-cols-3">
            {[
              { k: "Burdened", v: "True labor cost", s: "wages + burden + crew mix" },
              { k: "Cross-contractor", v: "Hundreds of crews", s: "not a single-tenant cost book" },
              { k: "Pre-bid", v: "Before you commit", s: "catch the gap, not the loss" },
            ].map((x) => (
              <div key={x.k}>
                <dt className="text-xs uppercase tracking-wider text-accent">
                  {x.k}
                </dt>
                <dd className="mt-1 text-lg font-semibold text-white">{x.v}</dd>
                <dd className="text-sm text-slate-400">{x.s}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how" className="border-t border-white/5 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-accent">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            From rough estimate to defensible bid in three steps.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Drop in your estimate",
                d: "Trade, region, scope, and your phase-by-phase hours at your blended rate. The numbers you were about to bid.",
              },
              {
                n: "02",
                t: "We reason over benchmarks",
                d: "Cubit pressure-tests each phase against how comparable crews actually book hours for this scope — flagging what's light, heavy, or on target.",
              },
              {
                n: "03",
                t: "Bid with a defensible number",
                d: "Get a recommended hours total, the rework gap you're likely missing, and a plain-English rationale you can stand behind.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-white/10 bg-ink-800/60 p-6 shadow-panel"
              >
                <div className="font-mono text-sm text-accent">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold text-white">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Why only us ===== */}
      <section id="why" className="relative border-t border-white/5">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-accent">
              Why only us
            </h2>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              We run the payroll. So we see the truth.
            </p>
            <p className="mt-6 text-base leading-relaxed text-slate-300">
              Cubit sits where the hours are actually recorded. Because we&apos;re
              the system-of-record for crews across{" "}
              <span className="font-semibold text-white">
                hundreds of contractors
              </span>
              , we see true{" "}
              <span className="font-semibold text-white">burdened</span> labor
              cost — real productivity, real crew mix, real overtime — across the
              market.
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              A stale cost book is an average from years ago. A single-tenant ERP
              only sees your own jobs. Neither can tell you whether the crew down
              the street just did this exact scope 12% under your number.{" "}
              <span className="font-semibold text-white">We can.</span>
            </p>
            <Link
              href="/app"
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-accent-soft"
            >
              Try the demo
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <div className="grid gap-4">
            {[
              {
                t: "Stale cost books",
                d: "National averages, updated annually, blind to your region and this scope.",
                bad: true,
              },
              {
                t: "Single-tenant ERPs",
                d: "Only ever see your own history. You can't benchmark against a market of one.",
                bad: true,
              },
              {
                t: "Cubit",
                d: "Live, burdened, cross-contractor productivity — because we run the payroll the hours are booked against.",
                bad: false,
              },
            ].map((c) => (
              <div
                key={c.t}
                className={`rounded-xl border p-5 ${
                  c.bad
                    ? "border-white/10 bg-ink-900/50"
                    : "border-accent/40 bg-accent/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {c.bad ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <Logo className="h-4 w-4" />
                  )}
                  <h3
                    className={`font-semibold ${
                      c.bad ? "text-slate-300" : "text-white"
                    }`}
                  >
                    {c.t}
                  </h3>
                </div>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    c.bad ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {c.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="border-t border-white/5 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Know the labor number before you sign the bid.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Run your estimate through Cubit and see exactly where it&apos;s light.
          </p>
          <Link
            href="/app"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-7 py-4 text-base font-semibold text-ink-950 shadow-lg shadow-accent/20 transition hover:bg-accent-soft"
          >
            Try the demo
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row">
          <Wordmark />
          <p>Prototype · Illustrative benchmark data · © Cubit</p>
        </div>
      </footer>
    </main>
  );
}
