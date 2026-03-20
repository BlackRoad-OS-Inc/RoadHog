import { useValues } from 'kea'

import { errorTrackingVolumeSparklineLogic } from './errorTrackingVolumeSparklineLogic'
import type { SparklineDatum, VolumeSparklineHoverPanel } from './types'

/** Kea `useValues` typing for keyed sparkline logic — run `pnpm --filter=@posthog/frontend typegen:write` after logic changes to drop the assertion. */
export type VolumeSparklineHoverValues = {
    hoveredIndex: number | null
    hoveredDatum: SparklineDatum | null
    isBarHighlighted: boolean
    hoverPanel: VolumeSparklineHoverPanel
}

export function useVolumeSparklineHoverValues(sparklineKey: string): VolumeSparklineHoverValues {
    return useValues(errorTrackingVolumeSparklineLogic({ sparklineKey })) as VolumeSparklineHoverValues
}
