import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { BenchmarkBar, Badge } from "@/components/ui/primitives";
import { DISCLAIMER } from "@/components/Brand";
import { cn, fmt, usd } from "@/lib/utils";
import type { AnalyzeResult, Status } from "@/lib/types";

const STATUS_CHIP: Record<Status, { tone: "danger" | "warn" | "success"; label: string }> = {
  light: { tone: "danger", label: "Light" },
  heavy: { tone: "warn", label: "Heavy" },
  "on-target": { tone: "success", label: "On target" },
};

export function AnalysisResults({ data }: { data: AnalyzeResult }) {
  const v = data.verdict;
  const verdictTone =
    v === "light"
      ? { wrap: "border-rose-200 bg-rose-50", text: "text-rose-700", icon: ShieldAlert }
      : v === "heavy"
      ? { wrap: "border-amber-200 bg-amber-50", text: "text-amber-700", icon: TriangleAlert }
      : { wrap: "border-emerald-200 bg-emerald-50", text: "text-emerald-700", icon: ShieldCheck };
  const Icon = verdictTone.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Verdict */}
      <div className={cn("rounded-xl border p-5", verdictTone.wrap)}>
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", verdictTone.text)} />
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">Verdict</Badge>
            <Badge tone="neutral" className="capitalize">
              Confidence: {data.confidence}
            </Badge>
            {data.source === "fallback" && (
              <span className="text-[11px] text-ink-400">local model</span>
            )}
          </span>
        </div>
        <h3 className={cn("mt-3 text-2xl font-semibold tracking-tight", verdictTone.text)}>
          {data.headline}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{data.rationale}</p>
      </div>

      {/* Recommended bid + delta */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
            Recommended labor bid
          </div>
          <div className="tabular mt-1 text-3xl font-semibold text-ink-900">
            {usd(data.recommended.cost)}
          </div>
          <div className="tabular mt-0.5 text-sm text-ink-500">
            {fmt(data.recommended.hours)} hrs @ {usd(data.recommended.blendedRate)}/hr
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
            Your bid vs. recommended
          </div>
          <div
            className={cn(
              "tabular mt-1 text-3xl font-semibold",
              data.percentDelta < 0
                ? "text-rose-600"
                : data.percentDelta > 0
                ? "text-amber-600"
                : "text-emerald-600"
            )}
          >
            {data.percentDelta > 0 ? "+" : ""}
            {data.percentDelta}%
          </div>
          <div className="mt-0.5 text-sm text-ink-500">
            {data.percentDelta < 0
              ? "Under the defensible number — undercosting risk."
              : data.percentDelta > 0
              ? "Over the defensible number."
              : "Right on the defensible number."}
          </div>
        </div>
      </div>

      {/* Rework gap */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 text-amber-600" />
          <h4 className="text-sm font-semibold text-ink-800">Rework gap</h4>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-400">
              Your assumption
            </div>
            <p className="mt-0.5 text-sm text-ink-700">{data.reworkGap.yourAssumption}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-400">
              Benchmark typical
            </div>
            <p className="mt-0.5 text-sm text-ink-700">{data.reworkGap.benchmarkTypical}</p>
          </div>
        </div>
        <p className="mt-3 border-t border-amber-200/70 pt-2.5 text-sm text-amber-700">
          {data.reworkGap.note}
        </p>
      </div>

      {/* Per-phase */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink-800">Phase breakdown</h4>
          <span className="text-[11px] text-ink-400">your hours vs benchmark band</span>
        </div>
        <div className="space-y-2.5">
          {data.phases.map((p, i) => {
            const chip = STATUS_CHIP[p.status];
            return (
              <div
                key={`${p.name}-${i}`}
                className="rounded-lg border border-ink-200 bg-white p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {p.costCode && (
                        <span className="font-mono text-[10px] text-ink-400">
                          {p.costCode}
                        </span>
                      )}
                      <span className="text-sm font-medium text-ink-800">{p.name}</span>
                    </div>
                    <div className="tabular mt-0.5 text-xs text-ink-500">
                      You: <span className="text-ink-700">{fmt(p.yourHours)} hrs</span>
                      <span className="mx-1.5 text-ink-300">·</span>
                      Benchmark{" "}
                      <span className="text-ink-700">
                        {fmt(p.benchmarkLow)}–{fmt(p.benchmarkHigh)} hrs
                      </span>
                    </div>
                  </div>
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                </div>
                <div className="mt-2.5">
                  <BenchmarkBar
                    value={p.yourHours}
                    low={p.benchmarkLow}
                    high={p.benchmarkHigh}
                    status={p.status}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">{p.note}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] italic text-ink-400">{DISCLAIMER}</p>
    </motion.div>
  );
}
