import { useEffect, useState } from 'react'

import { IconLive } from '@posthog/icons'
import { LemonSkeleton } from '@posthog/lemon-ui'

import api from 'lib/api'
import { TZLabel } from 'lib/components/TZLabel'

interface LogsWidgetProps {
    tileId: number
    config: Record<string, any>
}

interface LogEntry {
    uuid: string
    timestamp: string
    body: string
    severity_text: string
    service_name?: string
}

const SEVERITY_COLORS: Record<string, string> = {
    trace: 'text-muted',
    debug: 'text-muted',
    info: 'text-primary',
    warn: 'text-warning',
    error: 'text-danger',
    fatal: 'text-danger font-bold',
}

function LogsWidget({ tileId, config }: LogsWidgetProps): JSX.Element {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLoading(true)
        api.logs
            .query({
                query: {
                    dateRange: { date_from: '-1h' },
                    severityLevels: config.filters?.severityLevels || [],
                    serviceNames: config.filters?.serviceNames || [],
                    ...(config.filters?.searchTerm ? { searchTerm: config.filters.searchTerm } : {}),
                    ...(config.filters?.filterGroup ? { filterGroup: config.filters.filterGroup } : {}),
                    limit: 50,
                    orderBy: 'latest',
                },
            })
            .then((data) => {
                setLogs(data.results as unknown as LogEntry[])
                setLoading(false)
            })
            .catch(() => {
                setError('Failed to load logs')
                setLoading(false)
            })
    }, [tileId, config.filters])

    if (loading) {
        return (
            <div className="p-2 space-y-1">
                {Array.from({ length: 8 }).map((_, i) => (
                    <LemonSkeleton key={i} className="h-5 w-full" />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconLive className="text-3xl mb-2" />
                <span>{error}</span>
            </div>
        )
    }

    if (logs.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-full text-muted">
                <IconLive className="text-3xl mb-2" />
                <span>No logs found</span>
            </div>
        )
    }

    return (
        <div className="h-full overflow-auto font-mono text-xs">
            {logs.map((log) => (
                <div
                    key={log.uuid}
                    className="flex gap-2 px-2 py-0.5 hover:bg-surface-secondary border-b border-border-light"
                >
                    <TZLabel time={log.timestamp} formatDate="" formatTime="HH:mm:ss" className="text-muted shrink-0" />
                    <span
                        className={`uppercase shrink-0 w-10 text-right ${SEVERITY_COLORS[log.severity_text?.toLowerCase()] || 'text-muted'}`}
                    >
                        {log.severity_text || '---'}
                    </span>
                    <span className="truncate">{log.body}</span>
                </div>
            ))}
        </div>
    )
}

export default LogsWidget
