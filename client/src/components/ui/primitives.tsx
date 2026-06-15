import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-200 bg-ink-50",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "danger" | "warn" | "success";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-600 border-ink-200",
    brand: "bg-maroon/5 text-maroon border-maroon/20",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/** Small horizontal benchmark band with a "your value" marker. */
export function BenchmarkBar({
  value,
  low,
  high,
  status,
}: {
  value: number;
  low: number;
  high: number;
  status: "light" | "heavy" | "on-target";
}) {
  const span = Math.max(high - low, 1);
  const min = Math.min(low, value) - span * 0.3;
  const max = Math.max(high, value) + span * 0.3;
  const range = Math.max(max - min, 1);
  const pct = (v: number) => `${((v - min) / range) * 100}%`;
  const markerColor =
    status === "light"
      ? "bg-rose-500"
      : status === "heavy"
      ? "bg-amber-500"
      : "bg-emerald-500";
  return (
    <div className="relative h-7">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-100" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald-200"
        style={{ left: pct(low), width: `${((high - low) / range) * 100}%` }}
      />
      <div
        className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-emerald-400"
        style={{ left: pct(low) }}
      />
      <div
        className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-emerald-400"
        style={{ left: pct(high) }}
      />
      <div
        className={cn(
          "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white",
          markerColor
        )}
        style={{ left: pct(value) }}
      />
    </div>
  );
}
