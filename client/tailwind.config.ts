import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Restrained purple accent on a light, Vercel-clean surface.
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#7c5cff",
          600: "#6938ef",
          700: "#5b28d6",
          800: "#4a1fb0",
          900: "#3c1c8c",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e7ecf3",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        // Miter deep maroon — the dark brand base. Used for the dark headline
        // tone and any dark surfaces (panels/footer) via white/alpha overlays.
        maroon: {
          DEFAULT: "#260F14",
          900: "#260F14",
        },
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12)",
        lift: "0 1px 3px rgba(15,23,42,0.06), 0 16px 40px -16px rgba(15,23,42,0.18)",
        glow: "0 0 0 1px rgba(124,92,255,0.25), 0 12px 32px -10px rgba(124,92,255,0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
