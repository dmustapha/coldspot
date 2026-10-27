import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Integration tier: hits live Zetaris / NIM / Oracle. Needs .env.local exported.
export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    exclude: ["node_modules/**"],
    environment: "node",
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
