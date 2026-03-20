import { actions, kea, key, path, props, reducers, selectors } from 'kea'

import type { SparklineDatum, SparklineEvent, VolumeSparklineHoverPanel, VolumeSparklineHoverSelection } from './types'

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
        /** Bin or event hover; name kept for Kea selector typing (`[s.hoveredBin]`). */
        hoveredBin: [
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
            (s) => [s.hoveredBin],
            (sel: VolumeSparklineHoverSelection | null): number | null => (sel?.kind === 'bin' ? sel.index : null),
        ],
        hoveredDatum: [
            (s) => [s.hoveredBin],
            (sel: VolumeSparklineHoverSelection | null): SparklineDatum | null =>
                sel?.kind === 'bin' ? sel.datum : null,
        ],
        isBarHighlighted: [
            (s) => [s.hoveredBin],
            (sel: VolumeSparklineHoverSelection | null): boolean => sel?.kind === 'bin',
        ],
        hoverPanel: [
            (s) => [s.hoveredBin],
            (sel: VolumeSparklineHoverSelection | null): VolumeSparklineHoverPanel => hoverSelectionToPanel(sel),
        ],
    }),
])

function hoverSelectionToPanel(sel: VolumeSparklineHoverSelection | null): VolumeSparklineHoverPanel {
    if (sel == null) {
        return null
    }
    if (sel.kind === 'bin') {
        return { type: 'datum', data: sel.datum }
    }
    return { type: 'event', data: sel.event }
}
