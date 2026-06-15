import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Upload,
  Sparkles,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Logo, DISCLAIMER } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { AnalysisResults } from "@/components/bid/AnalysisResults";
import { chat, extract, analyze } from "@/lib/api";
import { cn, fmt, usd, type DistributiveOmit } from "@/lib/utils";
import type {
  AnalyzeResult,
  ChatMessage,
  ExtractResult,
  Learning,
} from "@/lib/types";

const TAKEOFF_EXPLAINER =
  "A takeoff is your phase-by-phase labor quantity list — it breaks scope into work types (rough-in, panel, finish, etc.) with estimated hours. Usually a PDF export from your estimating software or a spreadsheet.";

const SAMPLE =
  "Commercial tenant improvement, 18,000 sq ft office build-out in Mountain West. Electrical rough-in and finish: branch wiring, panel upgrade, lighting, fire alarm tie-in. 6-person crew, ~10 week schedule. Blended rate $78/hr.";

type Entry =
  | { id: number; kind: "agent"; text: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "typing" };

export default function BidCopilot({ learnings }: { learnings: Learning[] }) {
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  const [entries, setEntries] = useState<Entry[]>(() => [
    {
      id: nextId(),
      kind: "agent",
      text: "Let's pressure-test a bid before it goes out. Describe the job you're pricing — trade, rough size, scope, and crew — and I'll pull a phase-by-phase takeoff into the panel on the right, then benchmark it against actuals from your own jobs. Or start with one of the options below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [estimate, setEstimate] = useState<ExtractResult | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const reanalyzeTimer = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  const push = (e: DistributiveOmit<Entry, "id">) =>
    setEntries((prev) => [...prev, { ...e, id: nextId() } as Entry]);

  function chatHistory(): ChatMessage[] {
    const msgs: ChatMessage[] = [];
    for (const e of entries) {
      if (e.kind === "user") msgs.push({ role: "user", content: e.text });
      else if (e.kind === "agent")
        msgs.push({ role: "assistant", content: e.text });
    }
    while (msgs.length && msgs[0].role === "assistant") msgs.shift();
    return msgs.slice(-10);
  }

  async function runAnalyze(est: ExtractResult) {
    setAnalyzing(true);
    try {
      const result = await analyze({
        trade: est.trade,
        region: est.region,
        scope: est.scope,
        phases: est.phases,
        blendedRate: est.blendedRate,
      });
      setAnalysis(result);
      return result;
    } catch {
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  }

  async function runExtract(
    payload: { text?: string; fileBase64?: string; mimeType?: string },
    opts: { autoAnalyze?: boolean } = { autoAnalyze: true }
  ) {
    setExtracting(true);
    setAnalysis(null);
    push({ kind: "typing" } as Entry);
    try {
      const est = await extract(payload);
      setEstimate(est);
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      const total = est.phases.reduce((s, p) => s + p.hours, 0);
      push({
        kind: "agent",
        text: `Here's the takeoff — ${est.phases.length} phases by cost code, ${fmt(
          total
        )} hours total at ${usd(est.blendedRate)}/hr. ${
          opts.autoAnalyze
            ? "Benchmarking it against actuals from your jobs now…"
            : "Edit anything on the right, then run the benchmark."
        }`,
      });
      if (opts.autoAnalyze) {
        const result = await runAnalyze(est);
        if (result) {
          push({
            kind: "agent",
            text:
              result.verdict === "light"
                ? `Heads up — ${result.headline.toLowerCase()}. The risk is undercosting the bid; I've laid out where it's light and a defensible number on the right.`
                : result.verdict === "heavy"
                ? `${result.headline} — there may be room to sharpen it. Details on the right.`
                : `${result.headline}. The phases hold up against comparable jobs — details on the right.`,
          });
        }
      }
    } catch {
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      push({
        kind: "agent",
        text: "I couldn't read that one — try pasting the scope as text and I'll build the takeoff from it.",
      });
    } finally {
      setExtracting(false);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending || extracting) return;
    setInput("");
    push({ kind: "user", text: q });

    // A detailed description drives the takeoff.
    if (q.length >= 80) {
      await runExtract({ text: q });
      return;
    }

    setSending(true);
    push({ kind: "typing" } as Entry);
    try {
      const history = [...chatHistory(), { role: "user", content: q } as ChatMessage];
      const { reply } = await chat(history, {
        mode: "bid",
        jobContext: estimate
          ? { trade: estimate.trade, region: estimate.region, scope: estimate.scope }
          : undefined,
      });
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      push({ kind: "agent", text: reply });
    } catch {
      setEntries((prev) => prev.filter((e) => e.kind !== "typing"));
      push({
        kind: "agent",
        text: "Paste the job scope in a sentence or two and I'll build the takeoff for you.",
      });
    } finally {
      setSending(false);
    }
  }

  function trySample() {
    if (extracting) return;
    push({ kind: "user", text: "Try a sample job." });
    push({
      kind: "agent",
      text: `${TAKEOFF_EXPLAINER} Loading a sample electrical tenant-improvement job and building its takeoff now.`,
    });
    void runExtract({ text: SAMPLE });
  }

  function uploadTakeoff() {
    push({ kind: "user", text: "Upload my takeoff." });
    push({
      kind: "agent",
      text: `${TAKEOFF_EXPLAINER} Pick a PDF, image, or spreadsheet export and I'll pull the phases out of it.`,
    });
    setTimeout(() => fileRef.current?.click(), 150);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    push({ kind: "user", text: `Uploaded ${file.name}` });
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      void runExtract({ fileBase64: base64, mimeType: file.type || "application/pdf" });
    };
    reader.readAsDataURL(file);
  }

  function editHours(index: number, hours: number) {
    if (!estimate) return;
    const next = {
      ...estimate,
      phases: estimate.phases.map((p, i) => (i === index ? { ...p, hours } : p)),
    };
    setEstimate(next);
    scheduleReanalyze(next);
  }

  function editRate(rate: number) {
    if (!estimate) return;
    const next = { ...estimate, blendedRate: rate };
    setEstimate(next);
    scheduleReanalyze(next);
  }

  function scheduleReanalyze(est: ExtractResult) {
    if (!analysis) return; // only live-update once results exist
    if (reanalyzeTimer.current) window.clearTimeout(reanalyzeTimer.current);
    reanalyzeTimer.current = window.setTimeout(() => runAnalyze(est), 650);
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Chat panel */}
      <div className="flex min-h-0 flex-col border-r border-ink-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-2.5 sm:px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-900">Bid Co-pilot</div>
            <div className="text-[11px] text-ink-500">
              Closing the loop · benchmarks from your jobs
            </div>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {entries.map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {e.kind === "agent" && <AgentBubble text={e.text} />}
                  {e.kind === "user" && <UserBubble text={e.text} />}
                  {e.kind === "typing" && <Typing />}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-ink-200 px-4 py-3 sm:px-6">
          {!estimate && (
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                onClick={trySample}
                disabled={extracting}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Try a sample job
              </button>
              <button
                onClick={uploadTakeoff}
                disabled={extracting}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" /> Upload my takeoff
              </button>
            </div>
          )}
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the job you're bidding…"
              className="h-11 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11"
              disabled={sending || extracting}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.xls,image/*,application/pdf"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </div>

      {/* Right panel */}
      <div className="scroll-thin min-h-0 overflow-y-auto bg-ink-50 px-4 py-5 sm:px-6">
        {!estimate ? (
          <EmptyPanel learnings={learnings} />
        ) : (
          <div className="space-y-5">
            <EstimateForm
              estimate={estimate}
              analyzing={analyzing}
              hasAnalysis={!!analysis}
              onEditHours={editHours}
              onEditRate={editRate}
              onAnalyze={() => runAnalyze(estimate)}
            />
            {analyzing && !analysis && <AnalyzingSkeleton />}
            {analysis && <AnalysisResults data={analysis} />}
            <LearningsPanel learnings={learnings} compact />
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------- right-panel pieces */

function EmptyPanel({ learnings }: { learnings: Learning[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white/60 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-200 bg-white">
          <FileSpreadsheet className="h-6 w-6 text-brand-500" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-ink-800">
          Your takeoff lands here
        </h3>
        <p className="mt-2 max-w-sm text-sm text-ink-500">
          Describe the job in the chat, try the sample, or upload a takeoff. I&apos;ll
          extract the phases by cost code, then benchmark them so you don&apos;t
          undercost the bid.
        </p>
      </div>
      <div className="mt-5">
        <LearningsPanel learnings={learnings} />
      </div>
    </div>
  );
}

function EstimateForm({
  estimate,
  analyzing,
  hasAnalysis,
  onEditHours,
  onEditRate,
  onAnalyze,
}: {
  estimate: ExtractResult;
  analyzing: boolean;
  hasAnalysis: boolean;
  onEditHours: (i: number, hours: number) => void;
  onEditRate: (rate: number) => void;
  onAnalyze: () => void;
}) {
  const total = estimate.phases.reduce((s, p) => s + (Number(p.hours) || 0), 0);
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">
            Takeoff · {estimate.phases.length} phases
          </h3>
          <p className="text-xs text-ink-500">
            {estimate.trade} · {estimate.region}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {estimate.source === "fallback" && (
            <span className="text-[11px] text-ink-400">parsed locally</span>
          )}
          <Badge tone="brand">Editable</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[64px_1fr_96px] gap-2 px-1 text-[10px] uppercase tracking-wide text-ink-400">
          <span>Code</span>
          <span>Phase</span>
          <span className="text-right">Hours</span>
        </div>
        {estimate.phases.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-[64px_1fr_96px] items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/50 px-2 py-1.5"
          >
            <span className="font-mono text-[11px] text-ink-400">
              {p.costCode || "—"}
            </span>
            <span className="truncate text-sm text-ink-700">{p.name}</span>
            <input
              type="number"
              min={0}
              value={p.hours}
              onChange={(e) =>
                onEditHours(i, e.target.value === "" ? 0 : Number(e.target.value))
              }
              className="tabular h-8 w-full rounded-md border border-ink-200 bg-white px-2 text-right text-sm outline-none focus:border-brand-400"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <label className="flex items-center gap-2 text-xs text-ink-500">
          Blended rate
          <span className="flex items-center rounded-md border border-ink-200 bg-white px-2">
            <span className="text-ink-400">$</span>
            <input
              type="number"
              min={0}
              value={estimate.blendedRate}
              onChange={(e) =>
                onEditRate(e.target.value === "" ? 0 : Number(e.target.value))
              }
              className="tabular h-8 w-14 bg-transparent px-1 text-right text-sm outline-none"
            />
            <span className="text-ink-400">/hr</span>
          </span>
        </label>
        <div className="tabular text-sm text-ink-600">
          Total <span className="font-semibold text-ink-900">{fmt(total)} hrs</span>
        </div>
      </div>

      {!hasAnalysis && (
        <Button onClick={onAnalyze} disabled={analyzing} className="mt-4 w-full">
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Benchmarking…
            </>
          ) : (
            "Benchmark this bid"
          )}
        </Button>
      )}
      {hasAnalysis && (
        <p className="mt-3 text-[11px] text-ink-400">
          Edit any hours above — the benchmark re-runs automatically.
        </p>
      )}
    </div>
  );
}

function LearningsPanel({
  learnings,
  compact,
}: {
  learnings: Learning[];
  compact?: boolean;
}) {
  const resolved = learnings.filter((l) => l.source === "resolved").length;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-brand-600" />
        <h4 className="text-sm font-semibold text-ink-800">
          Benchmarks · learned from your jobs
        </h4>
      </div>
      <p className="mt-1 text-xs text-ink-500">
        These bands come from actuals on {learnings.length} of your jobs
        {resolved > 0 && (
          <>
            {" "}
            — including <span className="font-medium text-brand-600">{resolved} you
            just protected in Margin Watch</span>
          </>
        )}
        .
      </p>
      <div className={cn("mt-3 space-y-1.5", compact && "max-h-40 overflow-y-auto scroll-thin")}>
        {learnings.map((l) => (
          <div
            key={l.id}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              l.source === "resolved"
                ? "border-brand-200 bg-brand-50/60"
                : "border-ink-100 bg-ink-50/50"
            )}
          >
            <ArrowRight
              className={cn(
                "mt-0.5 h-3 w-3 shrink-0",
                l.source === "resolved" ? "text-brand-500" : "text-ink-300"
              )}
            />
            <span className="text-ink-600">{l.text}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] italic text-ink-400">{DISCLAIMER}</p>
    </div>
  );
}

function AnalyzingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="shimmer h-28 rounded-xl border border-ink-200 bg-white" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="shimmer h-24 rounded-xl border border-ink-200 bg-white" />
        <div className="shimmer h-24 rounded-xl border border-ink-200 bg-white" />
      </div>
      <p className="text-center text-sm text-ink-400">
        Reasoning over benchmarks…
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- chat bubbles */

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-ink-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-ink-700 shadow-soft">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white">
        <Logo className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-ink-200 bg-white px-4 py-3 shadow-soft">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-ink-300"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}
