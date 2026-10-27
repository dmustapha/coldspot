# COLDSPOT — production image. Monolithic Next.js 15 (UI + /api/*) on :3100.
# Target: linux/arm64 (OCI Ampere A1.Flex, aarch64). Build this ON the VM (or
# `docker build --platform linux/arm64`) — never `next build` on the dev host.
#
# oracledb runs in THIN mode (pure JS/TS over TCP + mTLS wallet from disk, see
# src/adapters/oracle/db.ts) — NO Oracle Instant Client, NO thick-mode system libs.
# The ADB wallet is NOT baked in; it is bind-mounted read-only at runtime (see compose).

# ---- deps: install the full dependency tree once (cached on package*.json) ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci = reproducible install from the lockfile. oracledb's prebuilt THIN-mode
# binary resolves for linux/arm64 from npm; no native toolchain needed.
RUN npm ci

# ---- builder: compile the standalone server (isolated from the host .next) ----
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Produces .next/standalone (server.js + traced node_modules incl. oracledb) and .next/static.
RUN npm run build

# ---- runner: minimal runtime, non-root ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nextjs

# Standalone server + its traced node_modules (oracledb lands here via the build trace).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Runtime-read data the app opens by path. These travel in the image because they are
# seed/reference artifacts, not secrets:
#   - vendor/meterless/**  : vendored Meterless engines (H-MEM / scout-intent)
#   - data/seed/**         : TYPE-2 endorsement + seed CSVs
#   - submission/hero-run/**: pre-baked hero-run evidence the UI reads
# The standalone trace does NOT copy data read via fs at runtime, so copy them explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/vendor/meterless ./vendor/meterless
COPY --from=builder --chown=nextjs:nodejs /app/data/seed ./data/seed
COPY --from=builder --chown=nextjs:nodejs /app/submission/hero-run ./submission/hero-run

# Trust Ledger dir: the APPEND target (LEDGER_DIR=/app/evidence/ledger). Created owned by
# the app user; a named volume is mounted here at runtime so the earned ledger survives
# container restarts (see docker-compose.yml). We seed the dir so the path exists even
# before the volume mount materializes.
RUN mkdir -p /app/evidence/ledger && chown -R nextjs:nodejs /app/evidence

USER nextjs
EXPOSE 3100
# server.js is the Next standalone entrypoint; honors PORT + HOSTNAME above.
CMD ["node", "server.js"]
