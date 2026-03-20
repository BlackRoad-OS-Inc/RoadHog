import * as d3 from 'd3'

import type { SparklineDatum, SparklineEvent } from './types'

type EventGroupSel = d3.Selection<SVGGElement, SparklineEvent<string>, SVGGElement, SparklineEvent<string>>
type LabelGroupSel = d3.Selection<SVGGElement, SparklineEvent<string>, SVGGElement, SparklineEvent<string>>

export type VolumeSparklineEventLayoutOptions = {
    eventLabelHeight: number
    eventLabelPaddingX: number
    eventLabelPaddingY: number
    eventMinSpace: number
    borderRadius: number
}

const COLLISION_TICKS = 500

export function renderVolumeSparklineEventMarkers(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    events: SparklineEvent<string>[],
    xScale: d3.ScaleTime<number, number>,
    chartHeight: number,
    width: number,
    options: VolumeSparklineEventLayoutOptions,
    interactive: boolean,
    onHoverChange?: (index: number | null, datum: SparklineDatum | null) => void,
    onEventHoverChange?: (event: SparklineEvent<string> | null) => void
): void {
    if (events.length === 0) {
        return
    }

    svg.selectAll<SVGGElement, SparklineEvent<string>>('g.volume-sparkline-event')
        .data(events)
        .join('g')
        .attr('class', 'volume-sparkline-event')
        .each(function () {
            const selection = d3.select(this as SVGGElement) as unknown as EventGroupSel
            selection.selectAll('*').remove()
            selection
                .append('g')
                .attr('class', 'label')
                .call((sel) => buildVolumeSparklineEventLabelContent(sel as unknown as LabelGroupSel, xScale, options))
        })

    spreadSparklineEventPillLabels(svg, 'g.volume-sparkline-event g.label', options, width)

    svg.selectAll<SVGGElement, SparklineEvent<string>>('g.volume-sparkline-event').each(function (d) {
        const selection = d3.select(this as SVGGElement) as unknown as EventGroupSel
        selection.call(buildEventLine, xScale, chartHeight, width)
        selection.call(buildEventAnchor, xScale, chartHeight)

        selection.style('cursor', 'default')
        if (interactive) {
            selection
                .on('mouseover', () => {
                    onHoverChange?.(null, null)
                    onEventHoverChange?.(d)
                })
                .on('mouseout', () => {
                    onEventHoverChange?.(null)
                })
        }
    })
}

export function buildVolumeSparklineEventLabelContent(
    selection: LabelGroupSel,
    xScale: d3.ScaleTime<number, number>,
    options: VolumeSparklineEventLayoutOptions
): void {
    const paddingX = options.eventLabelPaddingX
    const paddingY = options.eventLabelPaddingY
    const baseLine = options.eventLabelHeight / 2

    const text = selection
        .append('text')
        .attr('class', 'font-semibold')
        .attr('x', (d) => xScale(d.date))
        .attr('y', baseLine)
        .attr('fill', 'white')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', '10px')
        .text((d) => d.payload)

    const textNodes = text.nodes()

    selection
        .insert('rect', 'text')
        .attr('x', (_, i) => textNodes[i].getBBox().x - paddingX)
        .attr('y', (_, i) => textNodes[i].getBBox().y - paddingY)
        .attr('width', (_, i) => textNodes[i].getBBox().width + paddingX * 2)
        .attr('height', (_, i) => textNodes[i].getBBox().height + paddingY * 2)
        .attr('rx', options.borderRadius)
        .attr('ry', options.borderRadius)
        .attr('fill', (d) => d.color || 'black')
}

type MovingLabelNode = {
    x: number
    y: number
    vx: number
    vy: number
    radius: number
}

/** Run collision + boundary forces on all labels so pills separate horizontally; keep baseline Y fixed. */
export function spreadSparklineEventPillLabels(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    labelSelector: string,
    options: VolumeSparklineEventLayoutOptions,
    contentWidth: number
): void {
    const labelNodes = svg.selectAll<SVGGElement, SparklineEvent<string>>(labelSelector).nodes()
    if (labelNodes.length <= 1) {
        return
    }

    const movingNodes: MovingLabelNode[] = labelNodes.map((node) => {
        const bbox = node.getBBox()
        const center = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }
        return {
            x: center.x,
            y: center.y,
            vx: 0,
            vy: 0,
            radius: bbox.width / 2 + options.eventMinSpace,
        }
    })

    const initialY = movingNodes.map((n) => n.y)
    const clonedNodes = movingNodes.map((n) => ({ ...n }))

    const simulation = d3
        .forceSimulation(movingNodes)
        .velocityDecay(0.9)
        .force(
            'collision',
            d3.forceCollide<MovingLabelNode>().radius((d) => d.radius)
        )
        .force('boundaries', forceBoundaries(movingNodes, -10, contentWidth + 10))

    simulation.stop()
    for (let i = 0; i < COLLISION_TICKS; i++) {
        simulation.tick(1)
        movingNodes.forEach((node, index) => {
            node.y = initialY[index] ?? node.y
            node.vy = 0
        })
    }

    movingNodes.forEach((node, index) => {
        const deltaX = node.x - clonedNodes[index].x
        const deltaY = node.y - clonedNodes[index].y
        d3.select(labelNodes[index])
            .attr('transform', `translate(${deltaX}, ${deltaY})`)
            .attr('dx', deltaX)
            .attr('dy', deltaY)
    })
}

function buildEventAnchor(selection: EventGroupSel, xScale: d3.ScaleTime<number, number>, contentHeight: number): void {
    selection
        .append('circle')
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', contentHeight)
        .attr('r', 6)
        .attr('fill', 'white')
        .attr('stroke', (d) => d.color || 'black')
        .attr('stroke-width', 2)
}

function buildEventLine(
    selection: EventGroupSel,
    xScale: d3.ScaleTime<number, number>,
    contentHeight: number,
    contentWidth: number
): void {
    selection
        .insert('line', 'g.label')
        .attr('x1', (d) => xScale(d.date))
        .attr('y1', contentHeight)
        .attr('x2', (_, index) => {
            const labelNode = selection
                .selectAll('.label')
                .nodes()
                .find((_, i) => i === index) as SVGGElement
            const dx = parseFloat(labelNode.getAttribute('dx') || '0')
            const labelBbox = labelNode.getBBox()
            return labelBbox?.x + dx + labelBbox?.width / 2 || 0
        })
        .attr('y2', 5)
        .attr('stroke-width', 2)
        .attr('stroke', (d) => {
            const xPos = xScale(d.date)
            if (xPos < 0 || xPos > contentWidth) {
                return 'transparent'
            }
            return d.color || 'black'
        })
}

function forceBoundaries(
    nodes: { x: number; y: number; vx: number; vy: number; radius: number }[],
    minX: number,
    maxX: number
) {
    return () => {
        nodes.forEach((node) => {
            node.vy = 0
            if (node.x + node.radius > maxX) {
                node.vx += maxX - (node.x + node.radius)
            } else if (node.x - node.radius < minX) {
                node.vx += minX - (node.x - node.radius)
            }
        })
    }
}
