import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Design-conformance tier: token/identity tests that prove the design was APPLIED.
// Separate from the standing src unit suite so the 53/53 wall is never touched.
export default defineConfig({
  test: {
    include: ["design-tests/**/*.design.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "../src") },
  },
});
