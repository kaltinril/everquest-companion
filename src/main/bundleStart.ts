// bundleStart.ts — the instant this bundle began evaluating, ms since process start.
//
// The ZEROTH import of index.ts: no imports of its own, no side effect but reading the clock, so
// it evaluates before any module of ours and before channel.ts (which remains the first module
// that DOES anything). What it separates: `storeLoaded` is "process start to the store open", and
// without this stamp Electron's own boot, the evaluation of this bundle and the store's open are
// one number (perf.ts `noteEvaluationMarks`; audit item 16).

export const BUNDLE_START_MS = performance.now()
