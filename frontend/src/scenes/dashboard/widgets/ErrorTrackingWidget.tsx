import { useEffect, useState } from 'react'

import { IconLogomark, IconWarning } from '@posthog/icons'
import { LemonSkeleton } from '@posthog/lemon-ui'

import api from 'lib/api'
import { TZLabel } from 'lib/components/TZLabel'
import { Link } from 'lib/lemon-ui/Link'
import { urls } from 'scenes/urls'

interface ErrorTrackingWidgetProps {
    tileId: number
    config: Record<string, any>
}

interface ErrorIssue {
    id: string
    name: string
    description: string | null
    status: string
    first_seen: string
}

const STATUS_BADGE: Record<string, { dot: string; text: string }> = {
    active: { dot: 'bg-warning', text: 'Active' },
    resolved: { dot: 'bg-success', text: 'Resolved' },
    archived: { dot: 'bg-muted', text: 'Archived' },
    pending_release: { dot: 'bg-muted', text: 'Pending release' },
    suppressed: { dot: 'bg-danger', text: 'Suppressed' },
}

function ErrorTrackingWidget({ config }: ErrorTrackingWidgetProps): JSX.Element {
    const [issues, setIssues] = useState<ErrorIssue[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLoading(true)
        const params: Record<string, any> = { limit: 10 }
        if (config.status) {
            params.status = config.status
        }

        api.get('api/environments/@current/error_tracking/issues', params)
            .then((data: any) => {
                setIssues(data.results || [])
                setLoading(false)
            })
            .catch(() => {
                setError('Failed to load errors')
                setLoading(false)
            })
    }, [config.status])

    if (loading) {
        return (
            <div className="p-3 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                        <LemonSkeleton className="h-4 w-3/4" />
                        <LemonSkeleton className="h-3 w-full" />
                        <LemonSkeleton className="h-3 w-1/3" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconWarning className="text-3xl mb-2" />
                <span>{error}</span>
            </div>
        )
    }

    if (issues.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconWarning className="text-3xl mb-2" />
                <span>No errors found</span>
            </div>
        )
    }

    return (
        <div className="h-full overflow-auto">
            {issues.map((issue) => {
                const badge = STATUS_BADGE[issue.status] || { dot: 'bg-muted', text: issue.status }
                return (
                    <Link
                        key={issue.id}
                        to={urls.errorTrackingIssue(issue.id)}
                        subtle
                        className="group/row block px-3 py-2 border-b border-border-light !no-underline hover:bg-surface-secondary"
                    >
                        <div className="flex flex-col gap-[3px]">
                            <div className="flex items-center h-[1rem] gap-2">
                                <IconLogomark className="shrink-0 text-muted" fontSize="0.7rem" />
                                <span className="font-semibold text-[0.9rem] line-clamp-1">
                                    {issue.name || 'Unknown error'}
                                </span>
                            </div>
                            {issue.description && (
                                <div
                                    title={issue.description}
                                    className="font-medium line-clamp-1 text-[var(--gray-8)]"
                                >
                                    {issue.description}
                                </div>
                            )}
                            <div className="flex items-center text-secondary gap-1">
                                <span className="flex items-center gap-1 text-xs">
                                    <span className={`inline-block h-2 w-2 rounded-full ${badge.dot}`} />
                                    {badge.text}
                                </span>
                                <span className="text-quaternary mx-0.5">|</span>
                                <TZLabel time={issue.first_seen} className="border-dotted border-b text-xs" />
                            </div>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}

export default ErrorTrackingWidget
