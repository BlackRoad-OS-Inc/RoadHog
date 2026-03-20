import { useValues } from 'kea'
import { PropsWithChildren, useState } from 'react'
import { match } from 'ts-pattern'

import { IconChevronRight, IconTrending } from '@posthog/icons'
import { LemonSkeleton, Tooltip } from '@posthog/lemon-ui'

import { dayjs } from 'lib/dayjs'
import { humanFriendlyLargeNumber } from 'lib/utils'

import { ErrorTrackingIssueAggregations } from '~/queries/schema/schema-general'

import { useSparklineDataIssueScene } from '../hooks/use-sparkline-data'
import { useSparklineEvents } from '../hooks/use-sparkline-events'
import { errorTrackingIssueSceneLogic } from '../scenes/ErrorTrackingIssueScene/errorTrackingIssueSceneLogic'
import { cancelEvent } from '../utils'
import { TimeBoundary } from './TimeBoundary'
import { ErrorTrackingVolumeSparkline } from './VolumeSparkline/ErrorTrackingVolumeSparkline'
import type { SparklineDatum, SparklineEvent } from './VolumeSparkline/types'

type SelectedDataType =
    | {
          type: 'datum'
          data: SparklineDatum
      }
    | {
          type: 'event'
          data: SparklineEvent<string>
      }
    | null

export const Metadata = ({ children, className }: PropsWithChildren<{ className?: string }>): JSX.Element => {
    const { aggregations, summaryLoading, issueLoading, firstSeen, lastSeen } = useValues(errorTrackingIssueSceneLogic)
    const [hoveredDatum, setHoveredDatum] = useState<SelectedDataType>(null)
    const sparklineData = useSparklineDataIssueScene()
    const sparklineEvents = useSparklineEvents()

    return (
        <div className={className}>
            <div className="flex justify-between items-center h-[40px] px-2 shrink-0">
                <div className="flex justify-end items-center h-full">
                    {match(hoveredDatum)
                        .when(
                            (data) => shouldRenderIssueMetrics(data),
                            () => <IssueMetrics aggregations={aggregations} summaryLoading={summaryLoading} />
                        )
                        .with({ type: 'datum' }, (data) => renderDataPoint(data.data))
                        .with({ type: 'event' }, (data) => renderEventPoint(data.data))
                        .otherwise(() => null)}
                </div>
                <div className="flex justify-end items-center h-full">
                    {match(hoveredDatum)
                        .when(
                            (data) => shouldRenderIssueMetrics(data),
                            () => (
                                <>
                                    <TimeBoundary
                                        time={firstSeen}
                                        loading={issueLoading}
                                        label="First Seen"
                                        updateDateRange={(dateRange) => {
                                            dateRange.date_from = firstSeen?.toISOString()
                                            return dateRange
                                        }}
                                    />
                                    <IconChevronRight />
                                    <TimeBoundary
                                        time={lastSeen}
                                        loading={summaryLoading}
                                        label="Last Seen"
                                        updateDateRange={(dateRange) => {
                                            dateRange.date_to = lastSeen?.endOf('minute').toISOString()
                                            return dateRange
                                        }}
                                    />
                                </>
                            )
                        )
                        .with({ type: 'datum' }, (data) => renderDate(data.data.date))
                        .with({ type: 'event' }, (data) => renderDate(data.data.date))
                        .otherwise(() => null)}
                </div>
            </div>
            <div onClick={cancelEvent} className="shrink-0 min-h-[200px] flex flex-col">
                {sparklineData.length >= 2 ? (
                    <div className="pb-3">
                        <div className="relative w-full flex-1 min-h-0 pt-4">
                            <ErrorTrackingVolumeSparkline
                                data={sparklineData}
                                layout="detailed"
                                xAxis="full"
                                events={sparklineEvents}
                                interactive
                                onHoverChange={(_index, datum) => {
                                    if (datum == null) {
                                        setHoveredDatum(null)
                                    } else {
                                        setHoveredDatum({ type: 'datum', data: datum })
                                    }
                                }}
                                onEventHoverChange={(e) => {
                                    if (e == null) {
                                        setHoveredDatum(null)
                                    } else {
                                        setHoveredDatum({ type: 'event', data: e })
                                    }
                                }}
                                className="!p-0 h-full min-h-[160px]"
                            />
                        </div>
                    </div>
                ) : (
                    <LemonSkeleton className="h-40 w-full shrink-0" />
                )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        </div>
    )
}

function shouldRenderIssueMetrics(data: SelectedDataType): boolean {
    if (data == null) {
        return true
    }
    if (data.type == 'datum' && data.data.value == 0) {
        return true
    }
    return false
}

function IssueMetrics({
    aggregations,
    summaryLoading,
}: {
    aggregations: ErrorTrackingIssueAggregations | undefined
    summaryLoading: boolean
}): JSX.Element {
    const hasSessionCount = aggregations && aggregations.sessions !== 0
    return (
        <div className="flex items-center h-full gap-3">
            {renderMetric('Occurrences', aggregations?.occurrences, summaryLoading)}
            {renderMetric(
                'Sessions',
                aggregations?.sessions,
                summaryLoading,
                hasSessionCount ? undefined : 'No $session_id was set for any event in this issue'
            )}
            {renderMetric('Users', aggregations?.users, summaryLoading)}
        </div>
    )
}

function renderMetric(name: string, value: number | undefined, loading: boolean, tooltip?: string): JSX.Element {
    return (
        <>
            {match([loading])
                .with([true], () => <LemonSkeleton className="w-[80px] h-2" />)
                .with([false], () => (
                    <Tooltip title={tooltip} delayMs={0} placement="right">
                        <div className="flex items-center gap-1">
                            <div className="text-lg font-bold inline-block">
                                {value == null ? '0' : humanFriendlyLargeNumber(value)}
                            </div>
                            <div className="text-xs text-muted inline-block">{name}</div>
                        </div>
                    </Tooltip>
                ))
                .exhaustive()}
        </>
    )
}

function renderDate(date: Date): JSX.Element {
    return (
        <div className="text-xs text-muted whitespace-nowrap">{dayjs(date).utc().format('D MMM YYYY HH:mm (UTC)')}</div>
    )
}

function renderDataPoint(d: SparklineDatum): JSX.Element {
    return (
        <div className="flex items-center h-full gap-3">
            {renderMetric('Occurrences', d.value, false)}
            {d.animated && (
                <div className="flex items-center gap-1.5 text-warning-dark">
                    <IconTrending className="text-base" />
                    <span className="text-xs font-semibold">Spike</span>
                </div>
            )}
        </div>
    )
}

function renderEventPoint(d: SparklineEvent<string>): JSX.Element {
    return (
        <div className="flex justify-start items-center h-full gap-1">
            <div className="text-lg font-bold">{d.payload}</div>
        </div>
    )
}
