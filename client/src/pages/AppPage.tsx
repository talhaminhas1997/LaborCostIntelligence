import { Wordmark } from "@/components/Brand";
import { navigate } from "@/App";
import MarginWatch from "./MarginWatch";

export default function AppPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50 text-maroon">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Wordmark onClick={() => navigate("/")} />
          <div className="text-xs text-ink-400">On Miter data · always-on</div>
        </div>
      </header>

      <main className="flex-1">
        <MarginWatch />
      </main>
    </div>
  );
}
