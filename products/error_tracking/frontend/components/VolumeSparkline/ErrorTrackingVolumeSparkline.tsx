import { useActions, useMountedLogic, useValues } from 'kea'
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

type VolumeSparklineCoreProps = {
    data: SparklineData
    layout: VolumeSparklineLayout
    xAxis?: VolumeSparklineXAxisMode
    className?: string
    interactive: boolean
    onHoverChange?: (index: number | null, datum: SparklineDatum | null) => void
    events?: SparklineEvent<string>[]
    onEventHoverChange?: (event: SparklineEvent<string> | null) => void
}

type BaseVolumeProps = {
    data: SparklineData
    layout: VolumeSparklineLayout
    xAxis?: VolumeSparklineXAxisMode
    className?: string
}

export type ErrorTrackingVolumeSparklineProps =
    | (BaseVolumeProps & { interactive?: false; events?: SparklineEvent<string>[] })
    | (BaseVolumeProps & {
          interactive: true
          sparklineKey: string
          events?: SparklineEvent<string>[]
          onEventHoverChange?: (event: SparklineEvent<string> | null) => void
      })
    | (BaseVolumeProps & {
          interactive: true
          onHoverChange: (index: number | null, datum: SparklineDatum | null) => void
          events?: SparklineEvent<string>[]
          onEventHoverChange?: (event: SparklineEvent<string> | null) => void
      })

/** D3 volume bars. With `sparklineKey`, mounts Kea hover for the issues table; with `onHoverChange`, parent-controlled (issue detail). */
export function ErrorTrackingVolumeSparkline(props: ErrorTrackingVolumeSparklineProps): JSX.Element {
    if (props.interactive) {
        if ('sparklineKey' in props && props.sparklineKey) {
            return <VolumeSparklineWithLogic {...props} />
        }
        if ('onHoverChange' in props) {
            return (
                <VolumeSparklineCore
                    data={props.data}
                    layout={props.layout}
                    xAxis={props.xAxis}
                    className={props.className}
                    interactive
                    onHoverChange={props.onHoverChange}
                    events={props.events}
                    onEventHoverChange={props.onEventHoverChange}
                />
            )
        }
        throw new Error(
            'ErrorTrackingVolumeSparkline: interactive requires sparklineKey (Kea) or onHoverChange (controlled)'
        )
    }
    const { data, layout, xAxis, className, events } = props
    return (
        <VolumeSparklineCore
            data={data}
            layout={layout}
            xAxis={xAxis}
            className={className}
            interactive={false}
            events={events}
        />
    )
}

function VolumeSparklineWithLogic(
    props: Extract<ErrorTrackingVolumeSparklineProps, { interactive: true; sparklineKey: string }>
): JSX.Element {
    const { sparklineKey, data, layout, xAxis, className, events, onEventHoverChange } = props
    const mountedLogic = useMountedLogic(errorTrackingVolumeSparklineLogic({ sparklineKey }))
    const { setHoveredBin } = useActions(mountedLogic)

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

    return (
        <VolumeSparklineCore
            data={data}
            layout={layout}
            xAxis={xAxis}
            className={className}
            interactive
            onHoverChange={onHoverChange}
            events={events}
            onEventHoverChange={onEventHoverChange}
        />
    )
}

function VolumeSparklineCore({
    data,
    layout,
    xAxis = 'none',
    className,
    interactive,
    onHoverChange,
    events = [],
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

    // Slightly wider bars / tighter gaps vs 0.72 (roughly ~1px less gap at typical bin widths)
    const barWidthFraction = layout === 'compact' ? 0.78 : 0.9
    const roundedTopOnly = layout === 'compact'

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
            interactive,
            barWidthFraction,
            roundedTopOnly,
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
        interactive,
        barWidthFraction,
        roundedTopOnly,
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

/** Subscribe to hover state for `sparklineKey` (mounts the keyed logic; pair with interactive `ErrorTrackingVolumeSparkline`). */
export function useErrorTrackingVolumeSparklineHover(sparklineKey: string): {
    hoveredIndex: number | null
    hoveredDatum: SparklineDatum | null
    isBarHighlighted: boolean
} {
    useMountedLogic(errorTrackingVolumeSparklineLogic({ sparklineKey }))
    const logic = errorTrackingVolumeSparklineLogic({ sparklineKey })
    return useValues(logic)
}
