export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <path d="M16 3 L28 10 L16 17 L4 10 Z" fill="#7c5cff" />
      <path d="M4 10 L16 17 L16 29 L4 22 Z" fill="#5b28d6" />
      <path d="M28 10 L16 17 L16 29 L28 22 Z" fill="#a78bfa" />
    </svg>
  );
}

export function Wordmark({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex items-center gap-2.5 ${className}`}
    >
      <Logo className="h-7 w-7" />
      <span className="text-lg font-semibold tracking-tight text-ink-900">
        Cubit
      </span>
    </button>
  );
}

export const DISCLAIMER =
  "Illustrative figures — production uses live cross-contractor payroll data (v1 single-tenant: your own job history).";
