import { useEffect, useState } from 'react'

import { IconPlay } from '@posthog/icons'
import { LemonSkeleton } from '@posthog/lemon-ui'

import api from 'lib/api'
import { TZLabel } from 'lib/components/TZLabel'
import { Link } from 'lib/lemon-ui/Link'
import { humanFriendlyDuration } from 'lib/utils'
import { urls } from 'scenes/urls'

interface SessionReplaysWidgetProps {
    tileId: number
    config: Record<string, any>
}

interface SessionRecording {
    id: string
    start_time: string
    end_time: string
    recording_duration: number
    distinct_id: string
    viewed: boolean
    person?: {
        distinct_ids: string[]
        properties: Record<string, any>
    }
    activity_score?: number
}

function SessionReplaysWidget({ config }: SessionReplaysWidgetProps): JSX.Element {
    const [recordings, setRecordings] = useState<SessionRecording[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLoading(true)
        const params: Record<string, any> = { limit: 10 }
        if (config.date_from) {
            params.date_from = config.date_from
        }
        if (config.date_to) {
            params.date_to = config.date_to
        }

        api.get('api/projects/@current/session_recordings', params)
            .then((data: any) => {
                setRecordings(data.results || [])
                setLoading(false)
            })
            .catch(() => {
                setError('Failed to load session recordings')
                setLoading(false)
            })
    }, [config.date_from, config.date_to])

    if (loading) {
        return (
            <div className="p-3 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <LemonSkeleton className="h-8 w-8 rounded" />
                        <div className="flex-1 space-y-1">
                            <LemonSkeleton className="h-4 w-3/4" />
                            <LemonSkeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconPlay className="text-3xl mb-2" />
                <span>{error}</span>
            </div>
        )
    }

    if (recordings.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconPlay className="text-3xl mb-2" />
                <span>No session recordings found</span>
            </div>
        )
    }

    return (
        <div className="h-full overflow-auto">
            {recordings.map((recording) => {
                const personLabel =
                    recording.person?.properties?.email || recording.person?.properties?.name || recording.distinct_id

                return (
                    <Link
                        key={recording.id}
                        to={urls.replaySingle(recording.id)}
                        subtle
                        className="group/row flex items-center gap-3 px-3 py-2 hover:bg-surface-secondary border-b border-border-light !no-underline"
                    >
                        <div className="flex items-center justify-center h-8 w-8 rounded bg-surface-secondary shrink-0">
                            <IconPlay className="text-muted text-sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{personLabel}</div>
                            <div className="flex items-center gap-2 text-xs text-muted">
                                <span>{humanFriendlyDuration(recording.recording_duration)}</span>
                                <TZLabel time={recording.start_time} className="text-xs" />
                            </div>
                        </div>
                        {!recording.viewed && (
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0" title="Not viewed" />
                        )}
                    </Link>
                )
            })}
        </div>
    )
}

export default SessionReplaysWidget
