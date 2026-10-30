// unreleasedSlayerMap — the Slayer areas on the Maps tab, lazily loaded, and the Map pins overlay's
// feed of the same areas (UnreleasedSlayerOverlayFeed). (The file name is from the retired review
// gate; every build draws the layer.)

import { type ComponentType, type JSX, Suspense, lazy, memo } from 'react'
import type { ZoneShort } from '@shared/maps'
import type { MapViewport } from './features/maps/useMapViewport'
import { useOverlayOpen } from './lib/useOverlayOpen'

const LazyLayer = lazy(() => import('./features/slayer/SlayerMapLayer'))
const LazyOverlayPublisher = lazy(() => import('./features/slayer/SlayerOverlayPublisher'))

export default function UnreleasedSlayerMap({
  zone,
  vp
}: {
  zone: ZoneShort
  vp: MapViewport
}): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyLayer zone={zone} vp={vp} />
    </Suspense>
  )
}

/** The publisher while the Map pins overlay is open; closed, nothing is read or written. */
function SlayerOverlayFeedGate({ Publisher }: { Publisher: ComponentType }): JSX.Element | null {
  if (!useOverlayOpen('mapPins')) return null
  return (
    <Suspense fallback={null}>
      <Publisher />
    </Suspense>
  )
}

/**
 * The Map pins overlay's Achievements areas (shared/slayerOverlay.ts). Mounted once, in
 * AppCelebrations, so it runs on every tab; memo'd, so that component's re-renders stop here.
 */
export const UnreleasedSlayerOverlayFeed = memo(function UnreleasedSlayerOverlayFeed(): JSX.Element {
  return <SlayerOverlayFeedGate Publisher={LazyOverlayPublisher} />
})
