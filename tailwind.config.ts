import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Industrial slate base + a single sharp safety-orange accent.
        accent: {
          DEFAULT: "#ff5c35",
          soft: "#ff7a57",
          dim: "#c2410c",
        },
        ink: {
          950: "#080b11",
          900: "#0c1119",
          850: "#10172333",
          800: "#141d2b",
          700: "#1c2738",
          600: "#2a3950",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -28px rgba(0,0,0,0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
