import { action } from '@storybook/addon-actions'
import { Meta, StoryObj } from '@storybook/react'
import * as d3 from 'd3'

import { dayjs } from 'lib/dayjs'

import { ErrorTrackingVolumeSparkline } from './ErrorTrackingVolumeSparkline'
import type { SparklineData, SparklineEvent } from './types'

const meta: Meta<typeof ErrorTrackingVolumeSparkline> = {
    title: 'ErrorTracking/ErrorTrackingVolumeSparkline',
    parameters: {
        layout: 'centered',
        viewMode: 'story',
    },
    component: ErrorTrackingVolumeSparkline,
}

export default meta

type Story = StoryObj<typeof ErrorTrackingVolumeSparkline>

const resolution = 60

export const DetailedFullAxisWithEvents: Story = {
    args: {
        data: buildData(),
        layout: 'detailed',
        xAxis: 'full',
        interactive: false,
        events: buildEvents('2022-01-05', '2022-01-10'),
        className: 'w-[800px] h-[200px]',
    },
}

export const DetailedOverlappingEventDates: Story = {
    args: {
        data: buildData(),
        layout: 'detailed',
        xAxis: 'full',
        interactive: false,
        events: buildEvents('2022-01-05', '2022-01-05'),
        className: 'w-[800px] h-[200px]',
    },
}

export const DetailedMostlyZeros: Story = {
    args: {
        data: buildData(0, 0),
        layout: 'detailed',
        xAxis: 'full',
        interactive: false,
        className: 'w-[800px] h-[200px]',
    },
}

export const DetailedZerosAndOnes: Story = {
    args: {
        data: buildData(0, 1),
        layout: 'detailed',
        xAxis: 'full',
        interactive: false,
        className: 'w-[800px] h-[200px]',
    },
}

export const EventsBeforeDataRange: Story = {
    args: {
        data: buildData(0, 1000, '2022-02-01', '2022-03-01'),
        layout: 'detailed',
        xAxis: 'full',
        interactive: false,
        events: buildEvents('2022-01-01', '2022-01-02'),
        className: 'w-[800px] h-[200px]',
    },
}

export const CompactIssuesList: Story = {
    args: {
        data: buildData(),
        layout: 'compact',
        xAxis: 'minimal',
        interactive: false,
        className: 'w-[200px] h-10',
    },
}

export const InteractiveControlled: Story = {
    args: {
        data: buildData(),
        layout: 'detailed',
        xAxis: 'full',
        interactive: true,
        onHoverChange: action('hover-bin'),
        events: buildEvents('2022-01-05', '2022-01-10'),
        onEventHoverChange: action('hover-event'),
        className: 'w-[800px] h-[200px]',
    },
}

function buildData(
    minValue: number = 0,
    maxValue: number = 1000,
    minDate: string = '2022-01-01',
    maxDate: string = '2022-02-01'
): SparklineData {
    const generator = d3.randomLcg(42)
    const dayJsStart = dayjs(minDate)
    const dayJsEnd = dayjs(maxDate)
    const binSize = dayJsEnd.diff(dayJsStart, 'seconds') / resolution
    return new Array(resolution).fill(0).map((_, index) => {
        return {
            value: Math.round(generator() * (maxValue - minValue) + minValue),
            date: dayJsStart.add(index * binSize, 'seconds').toDate(),
        }
    })
}

function buildEvents(firstDate: string, lastDate: string): SparklineEvent<string>[] {
    return [
        {
            id: '1',
            date: new Date(firstDate),
            payload: 'First seen',
            color: 'var(--brand-red)',
        },
        {
            id: '2',
            date: new Date(lastDate),
            payload: 'Last seen',
            color: 'var(--brand-blue)',
        },
    ]
}
