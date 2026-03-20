import * as d3 from 'd3'

import { VOLUME_SPARKLINE_X_AXIS_RESERVE_PX } from './sparklineDomain'
import type { SparklineData, SparklineDatum, SparklineEvent, VolumeSparklineXAxisMode } from './types'
import { renderVolumeSparklineEventMarkers } from './volumeSparklineEvents'

const STRIPE_CELL = 12

export type VolumeSparklineRenderArgs = {
    data: SparklineData
    width: number
    height: number
    xAxis: VolumeSparklineXAxisMode
    backgroundColor: string
    hoverBackgroundColor: string
    axisColor: string
    borderRadius: number
    minBarHeight: number
    eventLabelHeight: number
    interactive: boolean
    /** Fraction of each bin width used for the bar (rest is gap). Default 0.9. */
    barWidthFraction?: number
    /** Top corners rounded with `borderRadius`; bottom flush to chart / x-axis. */
    roundedTopOnly?: boolean
    onHoverChange?: (index: number | null, datum: SparklineDatum | null) => void
    /** First seen / last seen / current — issue detail only */
    events?: SparklineEvent<string>[]
    onEventHoverChange?: (event: SparklineEvent<string> | null) => void
    eventLabelPaddingX?: number
    eventLabelPaddingY?: number
    eventMinSpace?: number
}

/** Flat bottom, rounded top only (quadratic corners). */
function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
    if (w <= 0 || h <= 0) {
        return ''
    }
    const rr = Math.min(Math.max(r, 0), w / 2, h / 2)
    if (rr <= 0) {
        return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`
    }
    return `M ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} L ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} Z`
}

function hashColorId(color: string): string {
    let h = 0
    for (let i = 0; i < color.length; i++) {
        h = (h * 31 + color.charCodeAt(i)) | 0
    }
    return `spike-${(h >>> 0).toString(36)}`
}

function spikeBarFill(d: SparklineDatum, defaultColor: string, patternIdFor: (c: string) => string): string {
    if (d.animated && d.color) {
        return `url(#${patternIdFor(d.color)})`
    }
    return d.color || defaultColor
}

function ensureStripePatterns(
    defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
    animatedColors: string[]
): (color: string) => string {
    const idByColor = new Map<string, string>()
    for (const color of animatedColors) {
        if (!idByColor.has(color)) {
            const id = hashColorId(color)
            idByColor.set(color, id)

            const pattern = defs
                .append('pattern')
                .attr('id', id)
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('width', STRIPE_CELL)
                .attr('height', STRIPE_CELL)

            pattern.append('rect').attr('width', STRIPE_CELL).attr('height', STRIPE_CELL).attr('fill', color)

            pattern
                .append('path')
                .attr(
                    'd',
                    `M-1,1 l2,-2 M0,${STRIPE_CELL} l${STRIPE_CELL},-${STRIPE_CELL} M${STRIPE_CELL - 1},${STRIPE_CELL + 1} l2,-2`
                )
                .attr('stroke', 'rgba(255,255,255,0.4)')
                .attr('stroke-width', (STRIPE_CELL * Math.SQRT2) / 4)

            pattern
                .append('animateTransform')
                .attr('attributeName', 'patternTransform')
                .attr('type', 'translate')
                .attr('from', '0 0')
                .attr('to', `0 -${STRIPE_CELL}`)
                .attr('dur', '1.5s')
                .attr('repeatCount', 'indefinite')
        }
    }
    return (color: string) => idByColor.get(color) ?? hashColorId(color)
}

/**
 * Full redraw of the volume sparkline (bars + optional time axis). Intended to be called from a React effect.
 */
export function renderVolumeSparkline(svgEl: SVGSVGElement, args: VolumeSparklineRenderArgs): void {
    const {
        data,
        width,
        height,
        xAxis,
        backgroundColor,
        hoverBackgroundColor,
        axisColor,
        borderRadius,
        minBarHeight,
        eventLabelHeight,
        interactive,
        barWidthFraction = 0.9,
        roundedTopOnly = false,
        onHoverChange,
        events = [],
        onEventHoverChange,
        eventLabelPaddingX = 5,
        eventLabelPaddingY = 3,
        eventMinSpace = 2,
    } = args

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    if (width <= 0 || height <= 0 || data.length < 2) {
        return
    }

    const axisReserve = VOLUME_SPARKLINE_X_AXIS_RESERVE_PX[xAxis]
    const chartHeight = Math.max(1, height - axisReserve)

    const occurrences = data
    const timeDiff = Math.abs(occurrences[1].date.getTime() - occurrences[0].date.getTime())
    const extent = d3.extent(occurrences.map((d) => d.date)) as [Date, Date]
    const maxDate = new Date(extent[1])
    maxDate.setTime(extent[1].getTime() + timeDiff)

    const xScale = d3.scaleTime().domain([extent[0], maxDate]).range([0, width])

    const maxValue = d3.max(occurrences.map((d) => d.value)) || 0
    const yScale = d3
        .scaleLinear()
        .domain([0, maxValue || 1])
        .range([chartHeight - minBarHeight, eventLabelHeight])

    const animatedColors = [...new Set(occurrences.filter((d) => d.animated && d.color).map((d) => d.color as string))]

    const defs = svg.append('defs')
    const patternIdFor = ensureStripePatterns(defs, animatedColors)

    const xTicks = d3.timeTicks(extent[0], maxDate, 8)
    const xAxisFull = d3.axisBottom(xScale).tickValues(xTicks).tickSize(0).tickPadding(5)

    const bandwidth = xScale(occurrences[1].date) - xScale(occurrences[0].date)
    const flushBottom = !roundedTopOnly && borderRadius === 0

    // Align with bottom of bars (flush to chartHeight).
    const axisLineY = chartHeight
    const showAxisHover = (xAxis === 'minimal' || xAxis === 'full') && interactive

    if (xAxis === 'minimal') {
        svg.append('line')
            .attr('class', 'volume-sparkline-x-axis-baseline')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', axisLineY)
            .attr('y2', axisLineY)
            .attr('stroke', 'currentColor')
            .attr('stroke-opacity', 0.22)
            .attr('pointer-events', 'none')
    }

    const barGroups = svg
        .selectAll<SVGGElement, SparklineDatum>('g.volume-bar')
        .data(occurrences)
        .join('g')
        .attr('class', 'volume-bar')
        .style('cursor', 'default')

    barGroups.each(function (d, i) {
        const g = d3.select(this)
        const binLeft = xScale(d.date)
        const barW = bandwidth * barWidthFraction
        const barX = binLeft + (bandwidth - barW) / 2

        let barTop: number
        let barHeight: number
        let clipBottomPx = 0

        if (roundedTopOnly) {
            barTop = yScale(d.value)
            barHeight = d.value > 0 ? chartHeight - yScale(d.value) : 0
        } else if (flushBottom) {
            barTop = yScale(d.value)
            barHeight = d.value > 0 ? chartHeight - yScale(d.value) : 0
        } else {
            barTop = yScale(d.value) + borderRadius
            barHeight = d.value > 0 ? chartHeight - yScale(d.value) : 0
            clipBottomPx = borderRadius + 1
        }

        const fill = spikeBarFill(d, backgroundColor, patternIdFor)

        if (roundedTopOnly && barHeight > 0) {
            const dPath = roundedTopBarPath(barX, barTop, barW, barHeight, borderRadius)
            g.append('path').attr('class', 'bar-main').attr('d', dPath).style('fill', fill)

            g.append('path')
                .attr('class', 'bar-hover-overlay')
                .attr('d', dPath)
                .style('fill', 'black')
                .style('opacity', 0)
                .style('pointer-events', 'none')
        } else {
            const main = g
                .append('rect')
                .attr('class', 'bar-main')
                .attr('x', barX)
                .attr('y', barTop)
                .attr('width', barW)
                .attr('height', barHeight)
                .style('fill', fill)

            if (clipBottomPx > 0) {
                main.style('clip-path', `inset(0 0 ${clipBottomPx}px 0)`)
            }
            main.attr('rx', borderRadius).attr('ry', borderRadius)

            g.append('rect')
                .attr('class', 'bar-hover-overlay')
                .attr('x', barX)
                .attr('y', barTop)
                .attr('width', barW)
                .attr('height', barHeight)
                .style('fill', 'black')
                .style('opacity', 0)
                .style('pointer-events', 'none')
                .style('clip-path', clipBottomPx > 0 ? `inset(0 0 ${clipBottomPx}px 0)` : null)
                .attr('rx', borderRadius)
                .attr('ry', borderRadius)
        }

        const maxDomain = Math.max(...yScale.domain())
        const hitBottomPad = flushBottom || roundedTopOnly ? 0 : borderRadius
        g.append('rect')
            .attr('class', 'bar-hit')
            .attr('x', binLeft)
            .attr('y', yScale(maxDomain))
            .attr('width', bandwidth)
            .attr('height', chartHeight - yScale(maxDomain) + hitBottomPad)
            .style('fill', 'transparent')
            .style('pointer-events', interactive ? 'all' : 'none')

        if (!interactive) {
            return
        }

        g.on('mouseover', () => {
            onEventHoverChange?.(null)
            onHoverChange?.(i, d)
            if (showAxisHover) {
                const axis = svg.select('.volume-sparkline-x-axis-hover')
                // Only underline the x-axis segment on empty bins; non-empty bins use bar fill only
                if (d.value === 0) {
                    axis.attr('x1', barX)
                        .attr('x2', barX + barW)
                        .attr('stroke-opacity', 0.55)
                } else {
                    axis.attr('stroke-opacity', 0)
                }
            }
            if (d.animated && d.color) {
                // Dark overlay darkens stripes; white overlay lightens to match solid-bar hover
                g.select('.bar-hover-overlay').style('fill', 'white').style('opacity', 0.22)
            } else {
                g.select('.bar-main').style('fill', hoverBackgroundColor)
            }
        })

        g.on('mouseout', () => {
            g.select('.bar-hover-overlay').style('opacity', 0).style('fill', 'black')
            g.select('.bar-main').style('fill', spikeBarFill(d, backgroundColor, patternIdFor))
        })
    })

    if (xAxis === 'full') {
        svg.append('g').attr('transform', `translate(0,${chartHeight})`).style('color', axisColor).call(xAxisFull)
    }

    // After the full axis so the segment paints above the domain line; minimal mode has no axis group
    if (showAxisHover) {
        svg.append('line')
            .attr('class', 'volume-sparkline-x-axis-hover')
            .attr('x1', 0)
            .attr('x2', 0)
            .attr('y1', axisLineY)
            .attr('y2', axisLineY)
            .attr('stroke', 'currentColor')
            .attr('stroke-opacity', 0)
            .attr('stroke-width', 2.5)
            .attr('pointer-events', 'none')
    }

    if (events.length > 0) {
        renderVolumeSparklineEventMarkers(
            svg,
            events,
            xScale,
            chartHeight,
            width,
            {
                eventLabelHeight,
                eventLabelPaddingX,
                eventLabelPaddingY,
                eventMinSpace,
                borderRadius,
            },
            interactive,
            onHoverChange,
            onEventHoverChange
        )
    }

    if (interactive) {
        svg.on('mouseleave', () => {
            onEventHoverChange?.(null)
            onHoverChange?.(null, null)
            if (showAxisHover) {
                svg.select('.volume-sparkline-x-axis-hover').attr('stroke-opacity', 0)
            }
            svg.selectAll<SVGGElement, SparklineDatum>('g.volume-bar').each(function (d) {
                const g = d3.select(this)
                g.select('.bar-hover-overlay').style('opacity', 0).style('fill', 'black')
                g.select('.bar-main').style('fill', spikeBarFill(d, backgroundColor, patternIdFor))
            })
        })
    }
}
