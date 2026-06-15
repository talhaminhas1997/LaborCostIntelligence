import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Calculator } from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { navigate } from "@/App";
import { cn } from "@/lib/utils";
import { SEED_LEARNINGS } from "@/lib/seed";
import type { Learning } from "@/lib/types";
import MarginWatch from "./MarginWatch";
import BidCopilot from "./BidCopilot";

type View = "margin-watch" | "bid";

export default function AppPage() {
  const [view, setView] = useState<View>("margin-watch");
  // The loop: lessons resolved by the Cost Risk Agent feed the Bid Co-pilot's benchmarks.
  const [learnings, setLearnings] = useState<Learning[]>(SEED_LEARNINGS);
  const addLearning = (l: Learning) =>
    setLearnings((prev) =>
      prev.some((x) => x.id === l.id) ? prev : [l, ...prev]
    );

  return (
    <div className="flex min-h-screen flex-col bg-ink-50 text-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Wordmark onClick={() => navigate("/")} />

          {/* View toggle — the Cost Risk Agent is the default/first act */}
          <div className="flex items-center rounded-xl border border-ink-200 bg-ink-100 p-1">
            <ToggleBtn
              active={view === "margin-watch"}
              onClick={() => setView("margin-watch")}
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Cost Risk Agent"
            />
            <ToggleBtn
              active={view === "bid"}
              onClick={() => setView("bid")}
              icon={<Calculator className="h-4 w-4" />}
              label="Bid Co-pilot"
            />
          </div>

          <div className="hidden w-[120px] justify-end text-right text-xs text-ink-400 sm:flex">
            {view === "margin-watch" ? "Act one · protect" : "Act two · bid"}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          {view === "margin-watch" ? (
            <MarginWatch onOpenBid={() => setView("bid")} onLearn={addLearning} />
          ) : (
            <BidCopilot learnings={learnings} />
          )}
        </motion.div>
      </main>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all sm:px-4",
        active
          ? "bg-white text-brand-700 shadow-sm"
          : "text-ink-500 hover:text-ink-800"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
