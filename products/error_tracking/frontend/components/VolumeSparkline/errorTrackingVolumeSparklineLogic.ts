import { actions, kea, key, path, props, reducers, selectors } from 'kea'

import type { errorTrackingVolumeSparklineLogicType } from './errorTrackingVolumeSparklineLogicType'
import type { SparklineDatum } from './types'

export interface ErrorTrackingVolumeSparklineLogicProps {
    sparklineKey: string
}

export const errorTrackingVolumeSparklineLogic = kea<errorTrackingVolumeSparklineLogicType>([
    path((key) => [
        'products',
        'error_tracking',
        'components',
        'VolumeSparkline',
        'errorTrackingVolumeSparklineLogic',
        key,
    ]),
    props({} as ErrorTrackingVolumeSparklineLogicProps),
    key(({ sparklineKey }) => sparklineKey),

    actions({
        setHoveredBin: (payload: { index: number; datum: SparklineDatum } | null) => ({ payload }),
    }),

    reducers({
        hoveredBin: [
            null as { index: number; datum: SparklineDatum } | null,
            {
                setHoveredBin: (_, { payload }) => payload,
            },
        ],
    }),

    selectors({
        hoveredIndex: [(s) => [s.hoveredBin], (hoveredBin): number | null => hoveredBin?.index ?? null],
        hoveredDatum: [(s) => [s.hoveredBin], (hoveredBin): SparklineDatum | null => hoveredBin?.datum ?? null],
        isBarHighlighted: [(s) => [s.hoveredBin], (hoveredBin): boolean => hoveredBin != null],
    }),
])
