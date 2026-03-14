import { useEffect, useState } from 'react'

import { LemonButton, LemonModal, LemonSelect } from '@posthog/lemon-ui'

import api from 'lib/api'

import { DashboardWidgetModel, DashboardWidgetType } from '~/types'

interface EditWidgetModalProps {
    isOpen: boolean
    onClose: () => void
    widget: DashboardWidgetModel
    onSave: (config: Record<string, any>) => void
}

interface SelectOption {
    value: string | number
    label: string
}

export function EditWidgetModal({ isOpen, onClose, widget, onSave }: EditWidgetModalProps): JSX.Element {
    const [config, setConfig] = useState<Record<string, any>>(widget.config || {})
    const [options, setOptions] = useState<SelectOption[]>([])
    const [loadingOptions, setLoadingOptions] = useState(false)

    useEffect(() => {
        if (!isOpen) {
            return
        }
        setConfig(widget.config || {})

        // Load options for widgets that need entity selection
        if (widget.widget_type === DashboardWidgetType.Experiment) {
            setLoadingOptions(true)
            api.get('api/projects/@current/experiments')
                .then((data: any) => {
                    setOptions(
                        (data.results || []).map((item: any) => ({
                            value: item.id,
                            label: item.name || `#${item.id}`,
                        }))
                    )
                    setLoadingOptions(false)
                })
                .catch(() => setLoadingOptions(false))
        } else if (widget.widget_type === DashboardWidgetType.SurveyResponses) {
            setLoadingOptions(true)
            api.get('api/projects/@current/surveys')
                .then((data: any) => {
                    setOptions(
                        (data.results || []).map((item: any) => ({
                            value: item.id,
                            label: item.name || `#${item.id}`,
                        }))
                    )
                    setLoadingOptions(false)
                })
                .catch(() => setLoadingOptions(false))
        }
    }, [isOpen, widget.widget_type, widget.config])

    const handleSave = (): void => {
        onSave(config)
        onClose()
    }

    return (
        <LemonModal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit widget"
            footer={
                <>
                    <LemonButton type="secondary" onClick={onClose}>
                        Cancel
                    </LemonButton>
                    <LemonButton type="primary" onClick={handleSave}>
                        Save
                    </LemonButton>
                </>
            }
        >
            <div className="space-y-4">
                {widget.widget_type === DashboardWidgetType.Experiment && (
                    <div>
                        <label className="text-sm font-medium mb-1 block">Experiment</label>
                        <LemonSelect
                            options={options}
                            value={config.experiment_id}
                            onChange={(value) => setConfig({ ...config, experiment_id: value })}
                            placeholder="Select an experiment..."
                            loading={loadingOptions}
                            fullWidth
                        />
                    </div>
                )}

                {widget.widget_type === DashboardWidgetType.SurveyResponses && (
                    <div>
                        <label className="text-sm font-medium mb-1 block">Survey</label>
                        <LemonSelect
                            options={options}
                            value={config.survey_id}
                            onChange={(value) => setConfig({ ...config, survey_id: value })}
                            placeholder="Select a survey..."
                            loading={loadingOptions}
                            fullWidth
                        />
                    </div>
                )}

                {widget.widget_type === DashboardWidgetType.ErrorTracking && (
                    <div>
                        <label className="text-sm font-medium mb-1 block">Status filter</label>
                        <LemonSelect
                            options={[
                                { value: '', label: 'All statuses' },
                                { value: 'active', label: 'Active' },
                                { value: 'resolved', label: 'Resolved' },
                                { value: 'pending_release', label: 'Pending release' },
                            ]}
                            value={config.status || ''}
                            onChange={(value) => setConfig({ ...config, status: value || undefined })}
                            fullWidth
                        />
                    </div>
                )}

                {widget.widget_type === DashboardWidgetType.Logs && (
                    <div className="text-sm text-muted">Log filters can be configured directly in the logs view.</div>
                )}

                {widget.widget_type === DashboardWidgetType.SessionReplays && (
                    <div className="text-sm text-muted">
                        Session replay filters can be configured in a future update.
                    </div>
                )}
            </div>
        </LemonModal>
    )
}
