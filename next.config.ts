import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: emit a self-contained .next/standalone/server.js with only the traced
  // runtime deps, so the production Docker image ships ~node_modules-free (lean ARM image, fast
  // cold boot on the A1.Flex). The multi-stage Dockerfile copies .next/standalone + .next/static
  // + public and runs `node server.js`.
  output: "standalone",
  // node-oracledb is a native addon that require()s Node built-ins (stream/buffer) and reads the
  // ADB wallet from disk — it must load from node_modules at runtime, never be bundled. Marking it
  // external keeps it out of the client/edge module graph (instrumentation.ts pulls it for the boot
  // pre-warm; the edge compilation does not honor serverExternalPackages under webpack, which 500'd
  // every route with "Can't resolve 'stream'"). Turbopack — the dev/build engine for this app — honors
  // serverExternalPackages for the instrumentation hook correctly, so `next dev/build --turbopack` is green.
  serverExternalPackages: ["oracledb"],
  // Hide the Next dev-mode indicator so judge/demo captures from `next dev` carry no dev badge
  // (production builds never show it). Pre-demo polish — COLDSPOT review, 2026-10-26.
  devIndicators: false,
};

export default nextConfig;
