import { useEffect, useState } from 'react'

import { IconFlask } from '@posthog/icons'
import { LemonButton, LemonSkeleton, LemonTag } from '@posthog/lemon-ui'

import api from 'lib/api'
import { getSeriesColor } from 'lib/colors'
import { humanFriendlyLargeNumber } from 'lib/utils'
import { urls } from 'scenes/urls'

import { performQuery } from '~/queries/query'
import { NodeKind } from '~/queries/schema/schema-general'

interface ExperimentWidgetProps {
    tileId: number
    config: Record<string, any>
}

interface ExperimentData {
    id: number
    name: string
    description: string
    start_date: string | null
    end_date: string | null
    feature_flag_key: string
    parameters: Record<string, any>
    metrics: any[]
    metrics_secondary: any[]
}

interface VariantStats {
    key: string
    sum: number
    number_of_samples: number
    denominator_sum?: number
    chance_to_win?: number | null
    significant?: boolean | null
    credible_interval?: [number, number] | null
    p_value?: number | null
    confidence_interval?: [number, number] | null
    method?: string
}

interface MetricResponse {
    baseline?: VariantStats
    variant_results?: VariantStats[]
}

const STATUS_COLORS: Record<string, string> = {
    complete: 'bg-success-highlight text-success',
    running: 'bg-warning-highlight text-warning',
    draft: 'bg-surface-secondary text-muted',
}

function getStatus(exp: ExperimentData): { label: string; colorClass: string } {
    if (exp.end_date) {
        return { label: 'Complete', colorClass: STATUS_COLORS.complete }
    }
    if (exp.start_date) {
        return { label: 'Running', colorClass: STATUS_COLORS.running }
    }
    return { label: 'Draft', colorClass: STATUS_COLORS.draft }
}

function formatValue(variant: VariantStats, metric: any): string {
    if (metric?.metric_type === 'ratio' && variant.denominator_sum && variant.denominator_sum > 0) {
        return (variant.sum / variant.denominator_sum).toFixed(2)
    }
    const val = variant.sum / variant.number_of_samples
    if (isNaN(val)) {
        return '—'
    }
    if (metric?.metric_type === 'mean') {
        return humanFriendlyLargeNumber(val)
    }
    return `${(val * 100).toFixed(2)}%`
}

function formatDelta(variant: VariantStats, baseline: VariantStats, metric: any): string | null {
    if (!baseline || baseline.number_of_samples === 0) {
        return null
    }
    const getVal = (v: VariantStats): number => {
        if (metric?.metric_type === 'ratio' && v.denominator_sum && v.denominator_sum > 0) {
            return v.sum / v.denominator_sum
        }
        return v.sum / v.number_of_samples
    }
    const baseVal = getVal(baseline)
    const varVal = getVal(variant)
    if (baseVal === 0 || isNaN(baseVal) || isNaN(varVal)) {
        return null
    }
    const delta = ((varVal - baseVal) / baseVal) * 100
    return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`
}

function getWinPercent(variant: VariantStats): string | null {
    if (variant.chance_to_win != null) {
        return `${(variant.chance_to_win * 100).toFixed(1)}%`
    }
    return null
}

function MetricResultsTable({
    metricName,
    metricIndex,
    metric,
    result,
}: {
    metricName: string
    metricIndex: number
    metric: any
    result: MetricResponse
}): JSX.Element {
    const baseline = result.baseline
    const variants = result.variant_results || []
    const allVariants = [...(baseline ? [baseline] : []), ...variants]

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-semibold text-text-primary">
                    {metricIndex + 1}. {metricName || 'Metric'}
                </span>
                {metric?.metric_type && <span className="text-xs text-muted capitalize">{metric.metric_type}</span>}
            </div>
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-border-light">
                        <th className="text-left font-medium text-muted py-1 px-1">Variant</th>
                        <th className="text-right font-medium text-muted py-1 px-1">Value</th>
                        <th className="text-right font-medium text-muted py-1 px-1">Delta</th>
                        <th className="text-right font-medium text-muted py-1 px-1">Win %</th>
                    </tr>
                </thead>
                <tbody>
                    {allVariants.map((v, i) => {
                        const isBaseline = baseline?.key === v.key
                        const delta = !isBaseline && baseline ? formatDelta(v, baseline, metric) : null
                        const winPct = !isBaseline ? getWinPercent(v) : null
                        const deltaNum = delta ? parseFloat(delta) : 0

                        return (
                            <tr key={v.key} className="border-b border-border-light last:border-0">
                                <td className="py-1 px-1">
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className="inline-block h-2 w-2 rounded-full shrink-0"
                                            // eslint-disable-next-line react/forbid-dom-props
                                            style={{ backgroundColor: getSeriesColor(i) }}
                                        />
                                        <span className="font-medium">{v.key}</span>
                                    </div>
                                </td>
                                <td className="text-right py-1 px-1 tabular-nums">
                                    <div>{formatValue(v, metric)}</div>
                                    <div className="text-muted">
                                        {humanFriendlyLargeNumber(v.sum)} / {v.number_of_samples}
                                    </div>
                                </td>
                                <td className="text-right py-1 px-1 tabular-nums">
                                    {delta ? (
                                        <span className={deltaNum < 0 ? 'text-danger' : 'text-success'}>{delta}</span>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td className="text-right py-1 px-1 tabular-nums">{winPct || '—'}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function ExperimentWidget({ config }: ExperimentWidgetProps): JSX.Element {
    const [experiment, setExperiment] = useState<ExperimentData | null>(null)
    const [primaryResults, setPrimaryResults] = useState<MetricResponse[]>([])
    const [secondaryResults, setSecondaryResults] = useState<MetricResponse[]>([])
    const [loading, setLoading] = useState(true)
    const [resultsLoading, setResultsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const experimentId = config.experiment_id

    useEffect(() => {
        if (!experimentId) {
            setError('No experiment configured. Edit this widget to select one.')
            setLoading(false)
            return
        }

        setLoading(true)
        api.get(`api/projects/@current/experiments/${experimentId}`)
            .then(async (data: any) => {
                const exp = data as ExperimentData
                setExperiment(exp)
                setLoading(false)

                if (!exp.start_date) {
                    return
                }

                const allMetrics = [...(exp.metrics || []), ...(exp.metrics_secondary || [])]
                if (allMetrics.length === 0) {
                    return
                }

                setResultsLoading(true)

                const loadMetric = async (metric: any): Promise<MetricResponse | null> => {
                    try {
                        const query =
                            metric.kind === NodeKind.ExperimentMetric
                                ? { kind: NodeKind.ExperimentQuery, metric, experiment_id: experimentId }
                                : { ...metric, experiment_id: experimentId }
                        return (await performQuery(query)) as MetricResponse
                    } catch {
                        return null
                    }
                }

                const primaryPromises = (exp.metrics || []).map(loadMetric)
                const secondaryPromises = (exp.metrics_secondary || []).map(loadMetric)

                const [primary, secondary] = await Promise.all([
                    Promise.all(primaryPromises),
                    Promise.all(secondaryPromises),
                ])

                setPrimaryResults(primary.filter(Boolean) as MetricResponse[])
                setSecondaryResults(secondary.filter(Boolean) as MetricResponse[])
                setResultsLoading(false)
            })
            .catch(() => {
                setError('Failed to load experiment')
                setLoading(false)
            })
    }, [experimentId])

    if (loading) {
        return (
            <div className="p-4 space-y-3">
                <LemonSkeleton className="h-6 w-1/2" />
                <LemonSkeleton className="h-4 w-3/4" />
                <LemonSkeleton className="h-24 w-full" />
            </div>
        )
    }

    if (error || !experiment) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconFlask className="text-3xl mb-2" />
                <span className="text-center">{error || 'Experiment not found'}</span>
            </div>
        )
    }

    const status = getStatus(experiment)

    // Derive exposures from the first primary metric result
    const firstResult = primaryResults[0]
    const exposures = firstResult
        ? [...(firstResult.baseline ? [firstResult.baseline] : []), ...(firstResult.variant_results || [])]
        : []
    const totalExposures = exposures.reduce((acc, v) => acc + v.number_of_samples, 0)

    return (
        <div className="h-full overflow-auto">
            {/* Header */}
            <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm mb-0 flex-1 truncate">{experiment.name}</h4>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${status.colorClass}`}>
                        {status.label}
                    </span>
                </div>
            </div>

            {resultsLoading && (
                <div className="px-3 space-y-3 flex-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-1">
                            <LemonSkeleton className="h-4 w-1/3" />
                            <LemonSkeleton className="h-16 w-full" />
                        </div>
                    ))}
                </div>
            )}

            {!resultsLoading && experiment.start_date && (
                <div className="px-3 space-y-3">
                    {/* Exposures bar */}
                    {totalExposures > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-muted uppercase">Exposures</span>
                            <span className="font-semibold">{totalExposures.toLocaleString()}</span>
                            <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-surface-secondary">
                                {exposures.map((v, i) => (
                                    <div
                                        key={v.key}
                                        className="h-full"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{
                                            width: `${(v.number_of_samples / totalExposures) * 100}%`,
                                            backgroundColor: getSeriesColor(i),
                                        }}
                                    />
                                ))}
                            </div>
                            {exposures.map((v, i) => (
                                <span key={v.key} className="flex items-center gap-1 text-muted">
                                    <span
                                        className="inline-block h-2 w-2 rounded-full"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{ backgroundColor: getSeriesColor(i) }}
                                    />
                                    {v.key} {((v.number_of_samples / totalExposures) * 100).toFixed(1)}%
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Primary metrics */}
                    {primaryResults.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-xs font-semibold text-muted uppercase">Primary metrics</div>
                            {primaryResults.map((result, i) => (
                                <MetricResultsTable
                                    key={i}
                                    metricName={experiment.metrics[i]?.name}
                                    metricIndex={i}
                                    metric={experiment.metrics[i]}
                                    result={result}
                                />
                            ))}
                        </div>
                    )}

                    {/* Secondary metrics */}
                    {secondaryResults.length > 0 && (
                        <div className="space-y-3">
                            <div className="text-xs font-semibold text-muted uppercase">Secondary metrics</div>
                            {secondaryResults.map((result, i) => (
                                <MetricResultsTable
                                    key={i}
                                    metricName={experiment.metrics_secondary[i]?.name}
                                    metricIndex={i}
                                    metric={experiment.metrics_secondary[i]}
                                    result={result}
                                />
                            ))}
                        </div>
                    )}

                    {primaryResults.length === 0 && secondaryResults.length === 0 && (
                        <div className="flex items-center justify-center text-muted text-sm py-4">
                            No results available yet
                        </div>
                    )}
                </div>
            )}

            {!experiment.start_date && (
                <div className="flex items-center justify-center text-muted text-sm py-4">
                    <LemonTag type="muted">Draft — not started yet</LemonTag>
                </div>
            )}

            <div className="p-3">
                <LemonButton type="secondary" size="small" to={urls.experiment(experimentId)} fullWidth center>
                    View full experiment
                </LemonButton>
            </div>
        </div>
    )
}

export default ExperimentWidget
