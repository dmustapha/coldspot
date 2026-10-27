// File: src/lib/replay.ts
// Replay-mode flag for the hosted demo. The public deploy is APP-ONLY by design (no Zetaris on the
// micro), so a live-mutation control there would fail closed with a raw 5xx. When this flag is set
// (micro only, via NEXT_PUBLIC_REPLAY_MODE=1), the console surfaces present a clean signpost instead
// of firing the live resolve, and point the judge at the earned /demo replay. Local dev leaves the
// flag unset and keeps full live behavior.
//
// NEXT_PUBLIC_ env is inlined at build time, so this is a plain module-scope const (client-safe).
export const REPLAY_MODE = process.env.NEXT_PUBLIC_REPLAY_MODE === "1";
