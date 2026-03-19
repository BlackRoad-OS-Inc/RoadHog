import { IconTrash, IconPencil } from '@posthog/icons'
import { LemonButton, LemonTag, LemonSnack } from '@posthog/lemon-ui'

import { IconSubArrowRight } from 'lib/lemon-ui/icons'

import { SessionRecordingTriggerGroup } from '~/lib/components/IngestionControls/types'

export interface TriggerGroupCardProps {
    group: SessionRecordingTriggerGroup
    onEdit?: () => void
    onDelete?: (id: string) => void
}

interface ConditionRowProps {
    type: 'events' | 'urls' | 'flag'
    values: string[]
    isFirst: boolean
    matchType: 'any' | 'all'
}

function ConditionRow({ type, values, isFirst, matchType }: ConditionRowProps): JSX.Element {
    const labels = {
        events: 'Event',
        urls: 'URL',
        flag: 'Feature flag',
    }

    const actions = {
        events: 'occurred',
        urls: 'matches pattern',
        flag: 'is enabled',
    }

    // For "any" match type, always use arrow. For "all", use & after first row
    const showArrow = matchType === 'any' || isFirst

    return (
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
            {showArrow ? (
                <LemonButton icon={<IconSubArrowRight className="arrow-right" />} size="small" noPadding />
            ) : (
                <LemonButton icon={<span className="text-xs font-medium">&</span>} size="small" noPadding />
            )}
            <span className="text-muted">{labels[type]}</span>
            {values.map((value, idx) => (
                <span key={value} className="contents">
                    {idx > 0 && <span className="text-muted text-xs">or</span>}
                    <LemonSnack>{value}</LemonSnack>
                </span>
            ))}
            <span className="text-muted">{actions[type]}</span>
        </div>
    )
}

export function TriggerGroupCard({ group, onEdit, onDelete }: TriggerGroupCardProps): JSX.Element {
    const { id, name, sampleRate, minDurationMs, conditions } = group

    // Format display name
    const displayName = name || `Trigger group ${id.slice(0, 8)}`

    // Build condition rows - group same types together
    const conditionRows: ConditionRowProps[] = []

    if (conditions.events && conditions.events.length > 0) {
        conditionRows.push({
            type: 'events',
            values: conditions.events,
            isFirst: conditionRows.length === 0,
            matchType: conditions.matchType,
        })
    }

    if (conditions.urls && conditions.urls.length > 0) {
        conditionRows.push({
            type: 'urls',
            values: conditions.urls.map((urlConfig) => urlConfig.url),
            isFirst: conditionRows.length === 0,
            matchType: conditions.matchType,
        })
    }

    if (conditions.flag) {
        const flagKey = typeof conditions.flag === 'string' ? conditions.flag : conditions.flag.key
        conditionRows.push({
            type: 'flag',
            values: [flagKey],
            isFirst: conditionRows.length === 0,
            matchType: conditions.matchType,
        })
    }

    const hasConditions = conditionRows.length > 0
    const matchType = conditions.matchType === 'any' ? 'any' : 'all'

    return (
        <div className="border rounded p-4 bg-surface-primary">
            {/* Header with actions */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <LemonSnack>{displayName}</LemonSnack>
                    <span className="text-sm">
                        {hasConditions ? (
                            <>
                                Match <b>sessions</b> against <b>{matchType}</b> criteria
                            </>
                        ) : (
                            <>
                                Trigger group will match <b>all sessions</b>
                            </>
                        )}
                    </span>
                </div>
                <div className="flex gap-2">
                    <LemonButton size="small" icon={<IconPencil />} onClick={onEdit}>
                        Edit
                    </LemonButton>
                    <LemonButton
                        size="small"
                        icon={<IconTrash />}
                        status="danger"
                        onClick={() => onDelete?.(id)}
                        disabledReason={!onDelete ? 'Delete not yet implemented' : undefined}
                    >
                        Delete
                    </LemonButton>
                </div>
            </div>

            {/* Conditions */}
            {hasConditions && (
                <div className="mt-3 flex flex-col gap-1">
                    {conditionRows.map((row, idx) => (
                        <ConditionRow key={idx} {...row} />
                    ))}
                </div>
            )}

            {/* Minimum duration */}
            {minDurationMs !== undefined && minDurationMs > 0 && (
                <div className="mt-3 text-sm text-muted">
                    Minimum duration: <b>{minDurationMs / 1000}</b> seconds
                </div>
            )}

            {/* Sample rate */}
            <div className="mt-3">
                <LemonTag type={sampleRate === 1 ? 'highlight' : sampleRate === 0 ? 'caution' : 'none'}>
                    <span className="text-sm">
                        Record <b>{Math.round(sampleRate * 100)}%</b> of sessions matching these conditions.
                    </span>
                </LemonTag>
            </div>
        </div>
    )
}
