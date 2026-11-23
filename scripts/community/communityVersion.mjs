// How the fork's release versions sort: the old 0.1.0-test.N line, then plain 0.1.N from 0.1.55 on.
//
// This is semver's order, the one the updater uses: the core numbers first, then a plain version
// above any prerelease of the same core. It is kept as a sort key so the notes generator and its
// test agree. Any other shape throws: a version this cannot place must stop the release.

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-test\.(\d+))?$/

/** [major, minor, patch, 1 for a plain version or 0 for a -test.N one, N]. */
export function versionKey(v) {
  const m = VERSION.exec(v)
  if (!m) throw new Error(`not a community version: ${v}`)
  const plain = m[4] === undefined
  return [Number(m[1]), Number(m[2]), Number(m[3]), plain ? 1 : 0, plain ? 0 : Number(m[4])]
}

/** Array.sort comparator: the newest version first. */
export function newerFirst(a, b) {
  const ka = versionKey(a)
  const kb = versionKey(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]
  return 0
}
