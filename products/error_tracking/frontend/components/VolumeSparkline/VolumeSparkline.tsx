import { useActions } from 'kea'
import { useCallback, useEffect, useRef } from 'react'
import { match } from 'ts-pattern'
import useResizeObserver from 'use-resize-observer'

import { cn } from 'lib/utils/css-classes'

import { useSparklineOptions } from '../../hooks/use-sparkline-options'
import { errorTrackingVolumeSparklineLogic } from './errorTrackingVolumeSparklineLogic'
import type { SparklineData, SparklineDatum, SparklineEvent, VolumeSparklineXAxisMode } from './types'
import { renderVolumeSparkline } from './volumeSparklineRender'

export type { VolumeSparklineXAxisMode } from './types'

type VolumeSparklineLayout = 'compact' | 'detailed'

export type VolumeSparklineProps = {
    data: SparklineData
    layout: VolumeSparklineLayout
    // Keyed Kea store for bar / event hover
    sparklineKey: string
    xAxis?: VolumeSparklineXAxisMode
    className?: string
    events?: SparklineEvent<string>[]
}

export function VolumeSparkline({
    sparklineKey,
    data,
    layout,
    xAxis,
    className,
    events,
}: VolumeSparklineProps): JSX.Element {
    const { setHoveredBin, setHoveredEvent } = useActions(errorTrackingVolumeSparklineLogic({ sparklineKey }))

    const onHoverChange = useCallback(
        (index: number | null, datum: SparklineDatum | null) => {
            if (index == null || datum == null) {
                setHoveredBin(null)
            } else {
                setHoveredBin({ index, datum })
            }
        },
        [setHoveredBin]
    )

    const onEventHoverChange = useCallback(
        (e: SparklineEvent<string> | null) => {
            setHoveredEvent(e)
        },
        [setHoveredEvent]
    )

    return (
        <VolumeSparklineCore
            data={data}
            layout={layout}
            xAxis={xAxis}
            className={className}
            events={events}
            onHoverChange={onHoverChange}
            onEventHoverChange={onEventHoverChange}
        />
    )
}

type VolumeSparklineCoreProps = {
    data: SparklineData
    layout: VolumeSparklineLayout
    xAxis?: VolumeSparklineXAxisMode
    className?: string
    events?: SparklineEvent<string>[]
    onHoverChange: (index: number | null, datum: SparklineDatum | null) => void
    onEventHoverChange: (event: SparklineEvent<string> | null) => void
}

function VolumeSparklineCore({
    data,
    layout,
    xAxis = 'none',
    className,
    events = [],
    onHoverChange,
    onEventHoverChange,
}: VolumeSparklineCoreProps): JSX.Element {
    const svgRef = useRef<SVGSVGElement>(null)
    const { height, width, ref: containerRef } = useResizeObserver({ box: 'content-box' })

    const chartStyle = useSparklineOptions(
        match(layout)
            .with('compact', () => ({ minBarHeight: 2, borderRadius: 3, eventLabelHeight: 0 }))
            .with('detailed', () => ({
                minBarHeight: 10,
                borderRadius: 4,
                eventLabelHeight: events.length > 0 ? 20 : 0,
            }))
            .exhaustive(),
        [layout, events.length]
    )

    const barWidthFraction = layout === 'compact' ? 0.78 : 0.9

    useEffect(() => {
        const svg = svgRef.current
        if (!svg || width == null || height == null) {
            return
        }

        renderVolumeSparkline(svg, {
            data,
            width,
            height,
            xAxis,
            backgroundColor: chartStyle.backgroundColor,
            hoverBackgroundColor: chartStyle.hoverBackgroundColor,
            axisColor: chartStyle.axisColor,
            borderRadius: chartStyle.borderRadius,
            minBarHeight: chartStyle.minBarHeight,
            eventLabelHeight: chartStyle.eventLabelHeight,
            barWidthFraction,
            onHoverChange,
            events,
            onEventHoverChange,
            eventLabelPaddingX: chartStyle.eventLabelPaddingX,
            eventLabelPaddingY: chartStyle.eventLabelPaddingY,
            eventMinSpace: chartStyle.eventMinSpace,
        })
    }, [
        data,
        width,
        height,
        xAxis,
        chartStyle.backgroundColor,
        chartStyle.hoverBackgroundColor,
        chartStyle.axisColor,
        chartStyle.borderRadius,
        chartStyle.minBarHeight,
        chartStyle.eventLabelHeight,
        chartStyle.eventLabelPaddingX,
        chartStyle.eventLabelPaddingY,
        chartStyle.eventMinSpace,
        barWidthFraction,
        onHoverChange,
        events,
        onEventHoverChange,
    ])

    const paddingClass = match(layout)
        .with('compact', () => 'p-1')
        .with('detailed', () => 'p-4')
        .exhaustive()

    return (
        <div
            ref={containerRef}
            className={cn('h-full w-full min-h-0 min-w-0 overflow-hidden', paddingClass, className)}
        >
            <svg ref={svgRef} className="block overflow-visible" height="100%" width="100%" />
        </div>
    )
}
