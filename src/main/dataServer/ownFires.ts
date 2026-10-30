// ownFires.ts — alert definitions the APP adds to the engine's set for its own use, and the takers
// that claim their fires before anything sounds. Two users today: the screenshot capture's macro
// line (ipc/shotCapture.ts; owner, 2026-10-21: "stay faithful to the log reading only") and the
// `/who` rows for friends online (main/whoWatch.ts). The engine is what reads the live log, and a
// raw alert is its existing way to say a line came by, live only (a replayed line never fires).
// These defs are not in the store, so they are never listed, edited, reset or shared with the
// player's alerts, and a fire taken here makes no sound.
//
// A registration, not an import, so the engine host does not load the capture's reader
// (desktopCapturer, OCR): definePush.ts's pattern.

import type { AlertDef } from '../../shared/types'
import type { FireMessage } from '../../shared/dataServer/protocol.generated'
import { pushAppKnowledge, type DefineOp } from './definePush'

const owners = new Map<string, { defs: AlertDef[]; take: (fire: FireMessage) => boolean }>()

/** Install one owner's defs and taker (replacing that owner's earlier ones), and hand the engine the new set. */
export function setOwnFires(owner: string, defs: AlertDef[], take: (fire: FireMessage) => boolean): void {
  owners.set(owner, { defs, take })
  pushAppKnowledge('alerts.define')
}

/** A define's params as sent: `alerts.define` gets the app's own defs after the player's. */
export function withOwnDefs<P>(op: DefineOp, params: P): P {
  if (op !== 'alerts.define' || owners.size === 0) return params
  const { defs } = params as { defs: AlertDef[] }
  return { ...params, defs: [...defs, ...[...owners.values()].flatMap((o) => o.defs)] }
}

/** True when the fire is one of the app's own and was taken: it is not an alert to play. */
export const takeOwnFire = (fire: FireMessage): boolean => [...owners.values()].some((o) => o.take(fire))
