// jsonChunks.ts — a big JSON document, handed from a worker to main in slices.
//
// WHY NOT POST THE PARSED OBJECT. A worker that parses the 18 MB spell-resist cache and posts the
// result does not take the work off the main thread: the structured-clone deserialization of
// that object graph is 223 ms on the receiving side, TWICE what `JSON.parse` of the same bytes
// costs there (measured 2026-11-06 on the owner's cache; the 14 MB resist ledger: 92 ms against
// 44 ms). What IS cheap to receive is a string. So the worker parses, re-serializes the bulk of
// the document in ~512 KB pieces, and posts those; main parses one piece per event-loop turn
// (`jsonChunkRead.ts`), a few milliseconds each, with IPC and timers running in between. The CPU
// total is the same; the longest uninterruptible block goes from ~130 ms to ~5 ms.
//
// PURE: no Electron, no fs. The worker entry (`jsonChunkWorker.ts`) and the resist table worker
// both speak this protocol; main receives it through `jsonChunkRead.ts`.

/** Target size of one chunk's JSON text. Parses in ~3 ms at 170 MB/s. */
export const JSON_CHUNK_BYTES = 512 * 1024

/**
 * Which part of the document is the bulk. `key` names a top-level property: an OBJECT is sliced by
 * entries (each chunk is a partial object), an ARRAY with `each` names the property of every element
 * that holds its rows (each element is posted once without them, then its rows in array chunks).
 * `expectHead` lists top-level fields that must equal the given values, else the document is stale
 * and nothing is sliced.
 */
export interface JsonChunkPlan {
  key: string
  each?: string
  expectHead?: Record<string, unknown>
}

export type JsonChunkMessage =
  /** The top-level object with `key` removed. Always first on success. */
  | { kind: 'head'; head: Record<string, unknown> }
  /** `each` mode: one element of the array, minus its rows. */
  | { kind: 'item'; index: number; item: Record<string, unknown> }
  /** A partial object (`{...}`) or, in `each` mode, an array (`[...]`) of element `index`'s rows. */
  | { kind: 'chunk'; index?: number; json: string }
  | { kind: 'done' }
  | { kind: 'error'; stage: 'read' | 'parse' | 'stale' | 'shape'; error: string; code?: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Entries of `obj`, as JSON object texts of about `maxBytes` each. */
export function* chunkEntries(obj: Record<string, unknown>, maxBytes = JSON_CHUNK_BYTES): Generator<string> {
  let parts: string[] = []
  let size = 0
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    const part = `${JSON.stringify(k)}:${JSON.stringify(v)}`
    parts.push(part)
    size += part.length + 1
    if (size >= maxBytes) {
      yield `{${parts.join(',')}}`
      parts = []
      size = 0
    }
  }
  if (parts.length > 0) yield `{${parts.join(',')}}`
}

/** Elements of `arr`, as JSON array texts of about `maxBytes` each. */
export function* chunkArray(arr: readonly unknown[], maxBytes = JSON_CHUNK_BYTES): Generator<string> {
  let parts: string[] = []
  let size = 0
  for (const v of arr) {
    const part = JSON.stringify(v === undefined ? null : v)
    parts.push(part)
    size += part.length + 1
    if (size >= maxBytes) {
      yield `[${parts.join(',')}]`
      parts = []
      size = 0
    }
  }
  if (parts.length > 0) yield `[${parts.join(',')}]`
}

function stale(head: Record<string, unknown>, expect: Record<string, unknown> | undefined): string | null {
  if (expect === undefined) return null
  for (const [k, v] of Object.entries(expect)) if (head[k] !== v) return `${k}: ${String(head[k])} is not ${String(v)}`
  return null
}

/** The whole protocol for one parsed document, in order. The caller posts each message. */
export function* chunkMessages(parsed: unknown, plan: JsonChunkPlan): Generator<JsonChunkMessage> {
  if (!isRecord(parsed)) {
    yield { kind: 'error', stage: 'shape', error: 'not a JSON object' }
    return
  }
  const { [plan.key]: bulk, ...head } = parsed
  const why = stale(head, plan.expectHead)
  if (why !== null) {
    yield { kind: 'error', stage: 'stale', error: why }
    return
  }
  if (plan.each === undefined) {
    if (!isRecord(bulk)) {
      yield { kind: 'error', stage: 'shape', error: `${plan.key} is not an object` }
      return
    }
    yield { kind: 'head', head }
    for (const json of chunkEntries(bulk)) yield { kind: 'chunk', json }
  } else {
    if (!Array.isArray(bulk)) {
      yield { kind: 'error', stage: 'shape', error: `${plan.key} is not an array` }
      return
    }
    yield { kind: 'head', head }
    yield* eachItems(bulk, plan.each)
  }
  yield { kind: 'done' }
}

function* eachItems(bulk: unknown[], each: string): Generator<JsonChunkMessage> {
  for (const [index, element] of bulk.entries()) {
    if (!isRecord(element)) continue
    const { [each]: rows, ...item } = element
    yield { kind: 'item', index, item }
    if (Array.isArray(rows)) for (const json of chunkArray(rows)) yield { kind: 'chunk', index, json }
  }
}
