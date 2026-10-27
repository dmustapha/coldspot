import type { Config } from "tailwindcss";

// COLDSPOT identity: roles live as CSS vars in globals.css (OKLCH + color-mix
// alpha ladder); Tailwind maps names onto the vars so markup stays semantic.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--void)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-dim": "var(--ink-dim)",
        "ink-faint": "var(--ink-faint)",
        accent: "var(--accent)",
        "accent-hi": "var(--accent-hi)",
        "accent-deep": "var(--accent-deep)",
        ice: "var(--ice)",
        "ice-deep": "var(--ice-deep)",
        jade: "var(--jade)",
        garnet: "var(--garnet)",
        // alpha rungs as first-class utilities (bg-ink-06, border-accent-30 ...)
        "ink-04": "var(--ink-04)",
        "ink-06": "var(--ink-06)",
        "ink-08": "var(--ink-08)",
        "ink-12": "var(--ink-12)",
        "ink-18": "var(--ink-18)",
        "ink-30": "var(--ink-30)",
        "ink-45": "var(--ink-45)",
        "ink-70": "var(--ink-70)",
        "accent-08": "var(--accent-08)",
        "accent-12": "var(--accent-12)",
        "accent-18": "var(--accent-18)",
        "accent-30": "var(--accent-30)",
        "accent-50": "var(--accent-50)",
        "ice-10": "var(--ice-10)",
        "ice-16": "var(--ice-16)",
        "ice-28": "var(--ice-28)",
        "ice-45": "var(--ice-45)",
        "jade-12": "var(--jade-12)",
        "jade-25": "var(--jade-25)",
        "garnet-12": "var(--garnet-12)",
        "garnet-25": "var(--garnet-25)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
        chip: "6px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.22, 1, 0.36, 1)",
        back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
