import { IconFlask, IconLive, IconMessage, IconRewindPlay, IconWarning } from '@posthog/icons'

import { DashboardWidgetType } from '~/types'

export interface WidgetTypeConfig {
    label: string
    description: string
    icon: JSX.Element
    color: string
}

export const WIDGET_TYPE_CONFIG: Record<DashboardWidgetType, WidgetTypeConfig> = {
    [DashboardWidgetType.Experiment]: {
        label: 'Experiment',
        description: 'View live experiment results',
        icon: <IconFlask />,
        color: 'var(--color-product-experiments-light)',
    },
    [DashboardWidgetType.Logs]: {
        label: 'Logs',
        description: 'View recent log entries',
        icon: <IconLive />,
        color: 'var(--color-product-logs-light)',
    },
    [DashboardWidgetType.ErrorTracking]: {
        label: 'Error tracking',
        description: 'View recent error issues',
        icon: <IconWarning />,
        color: 'var(--color-product-error-tracking-light)',
    },
    [DashboardWidgetType.SessionReplays]: {
        label: 'Session replays',
        description: 'View recent session recordings',
        icon: <IconRewindPlay />,
        color: 'var(--color-product-session-replay-light)',
    },
    [DashboardWidgetType.SurveyResponses]: {
        label: 'Survey responses',
        description: 'View latest survey responses',
        icon: <IconMessage />,
        color: 'var(--color-product-surveys-light)',
    },
}
