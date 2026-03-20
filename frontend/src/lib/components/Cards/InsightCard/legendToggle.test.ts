import { InsightVizNode, NodeKind } from '~/queries/schema/schema-general'
import { ChartDisplayType } from '~/types'

import {
    canToggleLegendInInsightQuery,
    getLegendToggleText,
    isLegendEnabledInInsightQuery,
    toggleLegendInInsightQuery,
} from './legendToggle'

describe('legendToggle', () => {
    describe('canToggleLegendInInsightQuery', () => {
        it('returns true for trends line graph', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph },
                },
            } as any

            expect(canToggleLegendInInsightQuery(query)).toBe(true)
        })

        it('returns false for world map', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.WorldMap },
                },
            } as any

            expect(canToggleLegendInInsightQuery(query)).toBe(false)
        })

        it('returns false for funnels', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.FunnelsQuery,
                    funnelsFilter: { funnelVizType: 'steps' },
                },
            } as any

            expect(canToggleLegendInInsightQuery(query)).toBe(false)
        })

        it('returns true for lifecycle', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.LifecycleQuery,
                },
            } as any

            expect(canToggleLegendInInsightQuery(query)).toBe(true)
        })

        it('returns false for trends table display', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsTable },
                },
            } as any

            expect(canToggleLegendInInsightQuery(query)).toBe(false)
        })

        it('returns false for non-insight-viz query', () => {
            const query = { kind: NodeKind.DataVisualizationNode } as any
            expect(canToggleLegendInInsightQuery(query)).toBe(false)
        })
    })

    describe('toggleLegendInInsightQuery', () => {
        it('sets showLegend true when unset', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph },
                },
            } as any

            const next = toggleLegendInInsightQuery(query) as InsightVizNode
            const src = next.source
            expect(src.kind).toBe(NodeKind.TrendsQuery)
            if (src.kind === NodeKind.TrendsQuery) {
                expect(src.trendsFilter?.showLegend).toBe(true)
            }
        })

        it('toggles showLegend off', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph, showLegend: true },
                },
            } as any

            const next = toggleLegendInInsightQuery(query) as InsightVizNode
            const src = next.source
            expect(src.kind).toBe(NodeKind.TrendsQuery)
            if (src.kind === NodeKind.TrendsQuery) {
                expect(src.trendsFilter?.showLegend).toBe(false)
            }
        })

        it('updates stickiness filter', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.StickinessQuery,
                    stickinessFilter: { display: ChartDisplayType.ActionsLineGraph },
                },
            } as any

            const next = toggleLegendInInsightQuery(query) as InsightVizNode
            const src = next.source
            expect(src.kind).toBe(NodeKind.StickinessQuery)
            if (src.kind === NodeKind.StickinessQuery) {
                expect(src.stickinessFilter?.showLegend).toBe(true)
            }
        })

        it('updates lifecycle filter', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.LifecycleQuery,
                    lifecycleFilter: {},
                },
            } as any

            const next = toggleLegendInInsightQuery(query) as InsightVizNode
            const src = next.source
            expect(src.kind).toBe(NodeKind.LifecycleQuery)
            if (src.kind === NodeKind.LifecycleQuery) {
                expect(src.lifecycleFilter?.showLegend).toBe(true)
            }
        })
    })

    describe('getLegendToggleText', () => {
        it('returns hide when legend on', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph, showLegend: true },
                },
            } as any

            expect(getLegendToggleText(query)).toBe('Hide legend')
            expect(isLegendEnabledInInsightQuery(query)).toBe(true)
        })

        it('returns show when legend off', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph, showLegend: false },
                },
            } as any

            expect(getLegendToggleText(query)).toBe('Show legend')
        })

        it('after toggling unset legend, label reads hide', () => {
            const query = {
                kind: NodeKind.InsightVizNode,
                source: {
                    kind: NodeKind.TrendsQuery,
                    trendsFilter: { display: ChartDisplayType.ActionsLineGraph },
                },
            } as any

            const next = toggleLegendInInsightQuery(query)
            expect(getLegendToggleText(next)).toBe('Hide legend')
        })
    })
})
