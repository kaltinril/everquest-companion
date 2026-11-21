// ============================================================================
// telemetry.ts — the `telemetry` block a settings file on disk carries, and nothing else.
// ============================================================================
//
// WHAT IS LEFT HERE (2026-11-20). This file was the usage-analytics contract: the event union,
// the bucket ladders and the batch shape the app sent to the original author's service. Usage
// analytics is removed from this project, and so is everything that used that contract.
//
// What remains is the one piece that describes files ALREADY ON PLAYERS' DISKS: schema migration
// 5 → 6 (`src/main/storeMigrations.ts`) writes a `telemetry` block into the settings file through
// `normalizeTelemetryPrefs`, and a migration is never edited after it ships. So the block's
// shape and its normalizer stay, byte for byte in what they produce, and nothing reads the
// block after the migration has written it.
//
// PURE. Zero imports: `storeMigrations.ts` reads this at `store.ts`'s module scope.

/** The three funnels the removed service counted. Kept as the normalizer's allowlist. */
export const TELEMETRY_FUNNELS = ['first-run', 'voice-install', 'feedback'] as const
export type TelemetryFunnel = (typeof TELEMETRY_FUNNELS)[number]

/** Each funnel's steps. Kept as the normalizer's allowlist, in the order it writes them. */
export const TELEMETRY_FUNNEL_STEPS: Readonly<Record<TelemetryFunnel, readonly string[]>> = {
  'first-run': [
    'installed',
    'logDetected',
    'firstParse',
    'firstNonOverviewView',
    'firstOverlayEnabled'
  ],
  'voice-install': ['engineSelected', 'downloadStarted', 'downloadCompleted', 'firstUtterance'],
  feedback: ['dialogOpened', 'sendPressed', 'sendFinished']
}

/** `crypto.randomUUID()` shape — the analyticsId's only permitted spelling. */
export const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------- prefs (persisted)
//
// The store blob behind schema migration 5 → 6.

export interface TelemetryPrefs {
  /** The old master switch. Nothing reads it. */
  enabled: boolean
  /** Whether the old first-run notice had rendered. Nothing reads it. */
  noticeShown: boolean
  /** The old rotatable anonymous id, or null. Nothing reads it and nothing mints one. */
  analyticsId: string | null
  /** The old once-ever funnel marks, as `"<funnel>:<step>"`. Nothing reads them. */
  funnelsDone: string[]
}

export const DEFAULT_TELEMETRY_PREFS: TelemetryPrefs = {
  enabled: true,
  noticeShown: false,
  analyticsId: null,
  funnelsDone: []
}

/** The one spelling of a once-ever mark. */
export function funnelStepMark(funnel: TelemetryFunnel, step: string): string {
  return `${funnel}:${step}`
}

/** Every mark that could ever be legal — the normalizer's allowlist. */
export function allFunnelStepMarks(): string[] {
  return TELEMETRY_FUNNELS.flatMap((funnel) =>
    TELEMETRY_FUNNEL_STEPS[funnel].map((step) => funnelStepMark(funnel, step))
  )
}

/** A plain object, or not. */
export function isTelemetryObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Defaulted field by field. Takes `unknown`: a hand edit, a downgrade or a share import can
 *  leave anything in this key, and a malformed id is DROPPED rather than repaired into
 *  something that is not a UUID. */
export function normalizeTelemetryPrefs(value: unknown): TelemetryPrefs {
  const v = isTelemetryObject(value) ? value : {}
  const id = v.analyticsId
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_TELEMETRY_PREFS.enabled,
    noticeShown:
      typeof v.noticeShown === 'boolean' ? v.noticeShown : DEFAULT_TELEMETRY_PREFS.noticeShown,
    analyticsId: typeof id === 'string' && UUID_V4_RE.test(id) ? id : null,
    // ALLOWLISTED, deduped and canonically ordered: an unrecognized mark (a hand edit, a
    // downgrade from a build with more steps) is DROPPED rather than carried.
    funnelsDone: normalizeFunnelsDone(v.funnelsDone)
  }
}

function normalizeFunnelsDone(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const held = new Set(value.filter((m): m is string => typeof m === 'string'))
  return allFunnelStepMarks().filter((mark) => held.has(mark))
}
