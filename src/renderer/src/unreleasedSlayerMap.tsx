// unreleasedSlayerMap — the UNRELEASED gate's reach into the Maps tab, for the Slayer areas.
//
// unreleasedSlayer.tsx's arrangement, for the layer instead of the tab: the lazy const compiles to
// `null` in a build without the flag, so the dynamic `import()` is dead code and the Maps tab
// carries nothing of `features/slayer/**`. The map renders this unconditionally and gets `null`.

import { type JSX, Suspense, lazy } from 'react'
import type { ZoneShort } from '@shared/maps'
import { UNRELEASED } from './devFlags'
import type { MapViewport } from './features/maps/useMapViewport'

const LazyLayer = UNRELEASED ? lazy(() => import('./features/slayer/SlayerMapLayer')) : null

export default function UnreleasedSlayerMap({
  zone,
  vp
}: {
  zone: ZoneShort
  vp: MapViewport
}): JSX.Element | null {
  if (!LazyLayer) return null
  return (
    <Suspense fallback={null}>
      <LazyLayer zone={zone} vp={vp} />
    </Suspense>
  )
}
