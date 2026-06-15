"use client";

import { useState } from "react";
import { Wordmark } from "@/components/Brand";
import { ResultsPanel } from "@/components/ResultsPanel";
import type { AnalyzeResult, PhaseInput, Trade } from "@/lib/types";

const TRADES: Trade[] = ["Electrical", "Mechanical/HVAC", "Concrete", "Plumbing"];

const DEFAULT_SCOPE =
  "Commercial tenant improvement, 18,000 sq ft office build-out. Electrical rough-in and finish: branch wiring, panel upgrade, lighting, fire alarm tie-in. 6-person crew, ~10 week schedule.";

const DEFAULT_PHASES: PhaseInput[] = [
  { name: "Rough-in", hours: 1200 },
  { name: "Panel/Service", hours: 240 },
  { name: "Finish/Devices", hours: 880 },
  { name: "Fire Alarm", hours: 160 },
];

const DISCLAIMER =
  "Illustrative benchmark data — production version uses live cross-contractor payroll data.";

export default function AppPage() {
  const [trade, setTrade] = useState<Trade>("Electrical");
  const [region, setRegion] = useState("Mountain West");
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [phases, setPhases] = useState<PhaseInput[]>(DEFAULT_PHASES);
  const [blendedRate, setBlendedRate] = useState<number>(78);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalHours = phases.reduce((s, p) => s + (Number(p.hours) || 0), 0);
  const totalCost = totalHours * (Number(blendedRate) || 0);

  function updatePhase(i: number, patch: Partial<PhaseInput>) {
    setPhases((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
    );
  }
  function addPhase() {
    setPhases((prev) => [...prev, { name: "", hours: 0 }]);
  }
  function removePhase(i: number) {
    setPhases((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade,
          region,
          scope,
          phases: phases.filter((p) => p.name.trim()),
          blendedRate: Number(blendedRate) || 78,
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data: AnalyzeResult = await res.json();
      setResult(data);
      // Scroll results into view on small screens.
      requestAnimationFrame(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(
        "Couldn't reach the analyzer. Please try again — your inputs are saved."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Wordmark />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 sm:inline">
              Pre-bid estimate analyzer
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ===== Inputs ===== */}
          <section className="lg:sticky lg:top-24 lg:self-start">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Validate your labor estimate
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Enter the bid you&apos;re about to submit. Cubit reasons over
              benchmarks to find where it&apos;s light.
            </p>

            <div className="mt-6 space-y-5 rounded-2xl border border-white/10 bg-ink-800/40 p-5 shadow-panel">
              {/* Trade + Region */}
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Trade
                  </span>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value as Trade)}
                    className="w-full rounded-md border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60"
                  >
                    {TRADES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Region
                  </span>
                  <input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60"
                  />
                </label>
              </div>

              {/* Scope */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Scope description
                </span>
                <textarea
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-md border border-white/10 bg-ink-900 px-3 py-2.5 text-sm leading-relaxed text-white outline-none focus:border-accent/60"
                />
              </label>

              {/* Phases table */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Labor estimate by phase
                  </span>
                  <span className="tabular text-xs text-slate-500">
                    {totalHours.toLocaleString()} hrs
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_92px_28px] gap-2 px-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Phase</span>
                    <span className="text-right">Hours</span>
                    <span />
                  </div>
                  {phases.map((p, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_92px_28px] items-center gap-2"
                    >
                      <input
                        value={p.name}
                        placeholder="Phase name"
                        onChange={(e) =>
                          updatePhase(i, { name: e.target.value })
                        }
                        className="w-full rounded-md border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent/60"
                      />
                      <input
                        type="number"
                        min={0}
                        value={p.hours}
                        onChange={(e) =>
                          updatePhase(i, {
                            hours: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                        className="tabular w-full rounded-md border border-white/10 bg-ink-900 px-3 py-2 text-right text-sm text-white outline-none focus:border-accent/60"
                      />
                      <button
                        onClick={() => removePhase(i)}
                        aria-label="Remove phase"
                        className="flex h-8 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addPhase}
                  className="mt-2 text-xs font-medium text-accent hover:text-accent-soft"
                >
                  + Add phase
                </button>
              </div>

              {/* Blended rate */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Blended labor rate
                </span>
                <div className="flex items-center rounded-md border border-white/10 bg-ink-900 px-3 focus-within:border-accent/60">
                  <span className="text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    min={0}
                    value={blendedRate}
                    onChange={(e) =>
                      setBlendedRate(
                        e.target.value === "" ? 0 : Number(e.target.value)
                      )
                    }
                    className="tabular w-full bg-transparent px-2 py-2.5 text-sm text-white outline-none"
                  />
                  <span className="text-sm text-slate-500">/hr</span>
                </div>
              </label>

              <div className="tabular flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                <span className="text-slate-400">Your estimate total</span>
                <span className="font-semibold text-white">
                  ${Math.round(totalCost).toLocaleString()}
                </span>
              </div>

              <button
                onClick={analyze}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3.5 text-sm font-semibold text-ink-950 shadow-lg shadow-accent/20 transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950/40 border-t-ink-950" />
                    Reasoning over benchmarks…
                  </>
                ) : (
                  "Analyze estimate"
                )}
              </button>
              {error && (
                <p className="text-sm text-red-300">{error}</p>
              )}
              <p className="text-[11px] italic leading-relaxed text-slate-500">
                {DISCLAIMER}
              </p>
            </div>
          </section>

          {/* ===== Results ===== */}
          <section id="results">
            {result ? (
              <ResultsPanel data={result} />
            ) : loading ? (
              <LoadingSkeleton />
            ) : (
              <EmptyState />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-ink-900/20 p-10 text-center">
      <div className="rounded-xl border border-white/10 bg-ink-800/60 p-4">
        <svg className="h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 3v18h18M7 14l3-4 3 3 4-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-white">
        Your analysis lands here
      </h2>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Fill in the estimate on the left and hit{" "}
        <span className="font-medium text-slate-200">Analyze estimate</span>.
        Cubit will pressure-test every phase against benchmark bands and return a
        defensible labor number.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-40 animate-pulse-bar rounded-2xl border border-white/10 bg-ink-800/50" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-32 animate-pulse-bar rounded-2xl border border-white/10 bg-ink-800/50" />
        <div className="h-32 animate-pulse-bar rounded-2xl border border-white/10 bg-ink-800/50" />
      </div>
      <div className="h-28 animate-pulse-bar rounded-2xl border border-white/10 bg-ink-800/50" />
      <p className="text-center text-sm text-slate-500">
        Reasoning over benchmarks…
      </p>
    </div>
  );
}
