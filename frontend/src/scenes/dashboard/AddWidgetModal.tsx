import { useActions } from 'kea'

import { LemonModal } from '@posthog/lemon-ui'

import { DashboardWidgetType } from '~/types'

import { dashboardLogic } from './dashboardLogic'
import { WIDGET_TYPE_CONFIG } from './widgets/widgetTypes'

const WIDGET_TYPES = [
    DashboardWidgetType.Experiment,
    DashboardWidgetType.Logs,
    DashboardWidgetType.ErrorTracking,
    DashboardWidgetType.SessionReplays,
    DashboardWidgetType.SurveyResponses,
] as const

interface AddWidgetModalProps {
    isOpen: boolean
    onClose: () => void
}

export function AddWidgetModal({ isOpen, onClose }: AddWidgetModalProps): JSX.Element {
    const { addWidget } = useActions(dashboardLogic)

    const handleSelect = (widgetType: DashboardWidgetType): void => {
        addWidget(widgetType, {})
        onClose()
    }

    return (
        <LemonModal isOpen={isOpen} onClose={onClose} title="Add widget" simple>
            <LemonModal.Header>
                <h3>Add widget</h3>
            </LemonModal.Header>
            <LemonModal.Content>
                <div className="grid grid-cols-1 gap-1.5">
                    {WIDGET_TYPES.map((type) => {
                        const config = WIDGET_TYPE_CONFIG[type]
                        return (
                            <button
                                key={type}
                                type="button"
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent text-left transition-all hover:bg-surface-secondary active:scale-[0.98] cursor-pointer"
                                onClick={() => handleSelect(type)}
                            >
                                <span
                                    className="flex items-center justify-center h-8 w-8 rounded-lg shrink-0"
                                    // eslint-disable-next-line react/forbid-dom-props
                                    style={{
                                        backgroundColor: config.color,
                                        color: 'white',
                                    }}
                                >
                                    {config.icon}
                                </span>
                                <div>
                                    <div className="font-medium text-sm text-text-primary">{config.label}</div>
                                    <div className="text-xs text-muted">{config.description}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </LemonModal.Content>
        </LemonModal>
    )
}
