"use client";

import type { AnalyzeResult, Status } from "@/lib/types";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US");
const usd = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US");

const STATUS_STYLE: Record<
  Status,
  { tag: string; text: string; bar: string; chip: string }
> = {
  light: {
    tag: "Light",
    text: "text-red-300",
    bar: "bg-red-500",
    chip: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  heavy: {
    tag: "Heavy",
    text: "text-amber-300",
    bar: "bg-amber-400",
    chip: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  "on-target": {
    tag: "On target",
    text: "text-emerald-300",
    bar: "bg-emerald-400",
    chip: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
};

const DISCLAIMER =
  "Illustrative benchmark data — production version uses live cross-contractor payroll data.";

function PhaseRow({
  p,
}: {
  p: AnalyzeResult["phases"][number];
}) {
  const s = STATUS_STYLE[p.status];
  // Build a 0..1 scale spanning the band (padded) so we can place markers.
  const lo = p.benchmarkLow;
  const hi = p.benchmarkHigh;
  const span = Math.max(hi - lo, 1);
  const min = Math.min(lo, p.yourHours) - span * 0.25;
  const max = Math.max(hi, p.yourHours) + span * 0.25;
  const range = Math.max(max - min, 1);
  const pct = (v: number) => `${((v - min) / range) * 100}%`;
  const bandLeft = pct(lo);
  const bandWidth = `${((hi - lo) / range) * 100}%`;
  const yourPos = pct(p.yourHours);

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-white">{p.name}</div>
          <div className="tabular mt-0.5 text-sm text-slate-400">
            You: <span className="text-slate-200">{fmt(p.yourHours)} hrs</span>
            <span className="mx-2 text-slate-600">·</span>
            Benchmark{" "}
            <span className="text-slate-200">
              {fmt(lo)}–{fmt(hi)} hrs
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${s.chip}`}
        >
          {s.tag}
        </span>
      </div>

      {/* Band visualization */}
      <div className="relative mt-4 h-9">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/5" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald-400/30"
          style={{ left: bandLeft, width: bandWidth }}
        />
        {/* benchmark band edge ticks */}
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-emerald-400/50"
          style={{ left: bandLeft }}
        />
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-emerald-400/50"
          style={{ left: `calc(${bandLeft} + ${bandWidth})` }}
        />
        {/* your marker */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: yourPos }}
        >
          <div className={`h-4 w-4 rounded-full ring-4 ring-ink-900 ${s.bar}`} />
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.note}</p>
    </div>
  );
}

export function ResultsPanel({ data }: { data: AnalyzeResult }) {
  const v = data.verdict;
  const verdictAccent =
    v === "light"
      ? "text-red-400"
      : v === "heavy"
      ? "text-amber-300"
      : "text-emerald-400";

  return (
    <div className="animate-rise space-y-5">
      {/* ===== Verdict headline ===== */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 sm:p-7 ${
          v === "light"
            ? "border-red-500/30 bg-red-500/[0.07]"
            : v === "heavy"
            ? "border-amber-400/30 bg-amber-400/[0.06]"
            : "border-emerald-400/30 bg-emerald-400/[0.06]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-medium uppercase tracking-wider text-slate-300">
            Verdict
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 font-medium capitalize text-slate-300">
            Confidence: {data.confidence}
          </span>
          {data.source === "fallback" && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-500">
              local model
            </span>
          )}
        </div>
        <h2
          className={`mt-4 text-3xl font-semibold tracking-tight sm:text-4xl ${verdictAccent}`}
        >
          {data.headline}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          {data.rationale}
        </p>
      </div>

      {/* ===== Recommended number ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-300">
            Recommended labor
          </div>
          <div className="tabular mt-2 text-4xl font-semibold text-white">
            {usd(data.recommended.cost)}
          </div>
          <div className="tabular mt-1 text-sm text-slate-400">
            {fmt(data.recommended.hours)} hrs @ {usd(data.recommended.blendedRate)}/hr
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Estimate vs. recommended
          </div>
          <div
            className={`tabular mt-2 text-4xl font-semibold ${
              data.percentDelta < 0 ? "text-red-400" : data.percentDelta > 0 ? "text-amber-300" : "text-emerald-400"
            }`}
          >
            {data.percentDelta > 0 ? "+" : ""}
            {data.percentDelta}%
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {data.percentDelta < 0
              ? "Your estimate is under the recommended number."
              : data.percentDelta > 0
              ? "Your estimate is over the recommended number."
              : "Your estimate matches the recommended number."}
          </div>
        </div>
      </div>

      {/* ===== Rework gap ===== */}
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-6">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-300" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 7v4m0 3h.01M10 2.5 1.8 16.5h16.4L10 2.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="font-semibold text-white">Rework gap</h3>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Your assumption
            </div>
            <p className="mt-1 text-sm text-slate-300">
              {data.reworkGap.yourAssumption}
            </p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Benchmark typical
            </div>
            <p className="mt-1 text-sm text-slate-300">
              {data.reworkGap.benchmarkTypical}
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-amber-400/15 pt-3 text-sm text-amber-200/80">
          {data.reworkGap.note}
        </p>
      </div>

      {/* ===== Per-phase breakdown ===== */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-white">Phase breakdown</h3>
          <span className="text-xs text-slate-500">
            ● your hours vs benchmark band
          </span>
        </div>
        <div className="space-y-3">
          {data.phases.map((p, i) => (
            <PhaseRow key={`${p.name}-${i}`} p={p} />
          ))}
        </div>
      </div>

      <p className="text-xs italic text-slate-500">{DISCLAIMER}</p>

      {/* ===== Stage 2 preview ===== */}
      <div className="rounded-2xl border border-white/10 bg-ink-900/30 p-6 opacity-70">
        <div className="flex items-center gap-2">
          <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Stage 2 preview
          </span>
        </div>
        <h3 className="mt-3 font-semibold text-slate-200">
          Once you win the bid, Cubit tracks actuals vs. estimate live.
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Burdened payroll hours flow straight back against this estimate, so you
          see erosion the week it happens — not at closeout.
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Rough-in · week 4 of 10</span>
            <span className="tabular">62% of estimate burned</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-accent-dim to-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
