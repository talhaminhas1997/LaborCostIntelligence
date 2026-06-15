import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Isometric cube — the "cubit" mark. */}
      <path d="M16 3 L28 10 L16 17 L4 10 Z" fill="#ff5c35" />
      <path d="M4 10 L16 17 L16 29 L4 22 Z" fill="#c2410c" />
      <path d="M28 10 L16 17 L16 29 L28 22 Z" fill="#ff7a57" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`}>
      <Logo className="h-7 w-7" />
      <span className="text-lg font-semibold tracking-tight text-white">
        Cubit
      </span>
    </Link>
  );
}
