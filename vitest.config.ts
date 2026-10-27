import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Default (offline) tier: unit tests only — no live Zetaris/NIM/Oracle.
// Integration tests (*.int.test.ts) are excluded here and run via vitest.int.config.ts.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts", "src/**/*.live.test.ts", "node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
