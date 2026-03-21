import { actions, kea, key, path, props, reducers, selectors } from 'kea'

import type { SparklineDatum, SparklineEvent, VolumeSparklineHoverSelection } from './types'

export interface ErrorTrackingVolumeSparklineLogicProps {
    sparklineKey: string
}

export const errorTrackingVolumeSparklineLogic = kea([
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
        setHoveredBin: (payload: unknown) => ({
            payload: payload as { index: number; datum: SparklineDatum } | null,
        }),
        setHoveredEvent: (payload: unknown) => ({
            payload: payload as SparklineEvent<string> | null,
        }),
    }),

    reducers({
        hoverSelection: [
            null as VolumeSparklineHoverSelection | null,
            {
                setHoveredBin: (_, { payload }): VolumeSparklineHoverSelection | null =>
                    payload == null ? null : { kind: 'bin', index: payload.index, datum: payload.datum },
                setHoveredEvent: (_, { payload }): VolumeSparklineHoverSelection | null =>
                    payload == null ? null : { kind: 'event', event: payload },
            },
        ],
    }),

    selectors({
        hoveredIndex: [
            (s) => [s.hoverSelection],
            (sel: VolumeSparklineHoverSelection | null): number | null => (sel?.kind === 'bin' ? sel.index : null),
        ],
        hoveredDatum: [
            (s) => [s.hoverSelection],
            (sel: VolumeSparklineHoverSelection | null): SparklineDatum | null =>
                sel?.kind === 'bin' ? sel.datum : null,
        ],
        isBarHighlighted: [
            (s) => [s.hoverSelection],
            (sel: VolumeSparklineHoverSelection | null): boolean => sel?.kind === 'bin',
        ],
    }),
])
