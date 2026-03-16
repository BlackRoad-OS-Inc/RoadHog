import { BindLogic, useActions, useValues } from 'kea'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { IconArrowLeft, IconPlus } from '@posthog/icons'
import { LemonButton, LemonModal, LemonSkeleton, Tooltip } from '@posthog/lemon-ui'

import { useHogfetti } from 'lib/components/Hogfetti/Hogfetti'
import SourceForm from 'scenes/data-warehouse/external/forms/SourceForm'
import { availableSourcesDataLogic } from 'scenes/data-warehouse/new/availableSourcesDataLogic'
import { sourceWizardLogic } from 'scenes/data-warehouse/new/sourceWizardLogic'
import { DataWarehouseSourceIcon } from 'scenes/data-warehouse/settings/DataWarehouseSourceIcon'

import { ExternalDataSourceType, SourceConfig } from '~/queries/schema/schema-general'
import { ExternalDataSource } from '~/types'

import { SessionAnalysisSetup } from './SessionAnalysisSetup'
import { DATA_WAREHOUSE_SOURCE_CONFIG, DataWarehouseSource, signalSourcesLogic } from './signalSourcesLogic'
import { SourcesList } from './SourcesList'

// Each signal source reads from specific tables — pre-select them and make them required
const SIGNAL_SOURCE_REQUIRED_TABLES: Partial<Record<ExternalDataSourceType, string[]>> = {
    Github: ['issues'],
    Linear: ['issues'],
    Zendesk: ['tickets'],
}

export function SourcesModal(): JSX.Element {
    const { sourcesModalOpen, sessionAnalysisSetupOpen, dataSourceSetupProduct, existingSourceSelection } =
        useValues(signalSourcesLogic)
    const {
        closeSourcesModal,
        closeSessionAnalysisSetup,
        closeDataSourceSetup,
        closeExistingSourceSelection,
        onDataSourceSetupComplete,
    } = useActions(signalSourcesLogic)
    const { trigger: triggerHogfetti, HogfettiComponent } = useHogfetti({ count: 30, duration: 3000 })

    const isDataSourceSetupOpen = dataSourceSetupProduct !== null
    const isExistingSourceSelectionOpen = existingSourceSelection !== null

    const handleDataSourceComplete = (): void => {
        triggerHogfetti()
        setTimeout(() => {
            triggerHogfetti()
        }, 200)
        setTimeout(() => {
            triggerHogfetti()
        }, 400)
        onDataSourceSetupComplete(dataSourceSetupProduct!)
    }

    return (
        <>
            <LemonModal
                isOpen={sourcesModalOpen}
                onClose={closeSourcesModal}
                simple
                width={sessionAnalysisSetupOpen || isDataSourceSetupOpen ? '48rem' : '32rem'}
            >
                <LemonModal.Header>
                    <div className="flex items-center gap-2">
                        {(sessionAnalysisSetupOpen || isDataSourceSetupOpen || isExistingSourceSelectionOpen) && (
                            <LemonButton
                                type="tertiary"
                                size="small"
                                icon={<IconArrowLeft />}
                                onClick={
                                    isDataSourceSetupOpen
                                        ? closeDataSourceSetup
                                        : isExistingSourceSelectionOpen
                                          ? closeExistingSourceSelection
                                          : closeSessionAnalysisSetup
                                }
                            />
                        )}
                        <h3 className="font-semibold mb-0">
                            {isDataSourceSetupOpen
                                ? `Connect ${dataSourceSetupProduct}`
                                : isExistingSourceSelectionOpen
                                  ? `Select ${existingSourceSelection.dwSource} integration`
                                  : sessionAnalysisSetupOpen
                                    ? 'Session analysis filters'
                                    : 'Signal sources'}
                        </h3>
                    </div>
                    {!sessionAnalysisSetupOpen && !isDataSourceSetupOpen && !isExistingSourceSelectionOpen && (
                        <p className="text-xs text-secondary mt-1 mb-0">Set up sources feeding the Inbox.</p>
                    )}
                </LemonModal.Header>
                <LemonModal.Content className={sessionAnalysisSetupOpen ? 'p-0 rounded-b' : ''}>
                    {isExistingSourceSelectionOpen ? (
                        <ExistingSourceSelection
                            dwSource={existingSourceSelection.dwSource}
                            sources={existingSourceSelection.sources}
                        />
                    ) : isDataSourceSetupOpen ? (
                        <DataSourceSetup product={dataSourceSetupProduct} onComplete={handleDataSourceComplete} />
                    ) : sessionAnalysisSetupOpen ? (
                        <SessionAnalysisSetup />
                    ) : (
                        <SourcesList />
                    )}
                </LemonModal.Content>
            </LemonModal>
            {createPortal(
                <HogfettiComponent />,
                document.body /* Needs to be in portal to be above ReactModalPortal */
            )}
        </>
    )
}

function ExistingSourceSelection({
    dwSource,
    sources,
}: {
    dwSource: DataWarehouseSource
    sources: ExternalDataSource[]
}): JSX.Element {
    const { selectExistingSource, closeExistingSourceSelection, openDataSourceSetup } = useActions(signalSourcesLogic)
    const { requiredTable } = DATA_WAREHOUSE_SOURCE_CONFIG[dwSource]

    return (
        <div className="space-y-2">
            <p className="text-sm text-secondary mb-3">
                Select an existing {dwSource} integration to use for this signal source, or hook up a new one.
            </p>
            {sources.map((source) => {
                const requiredSchema = source.schemas?.find((s) => s.name === requiredTable)
                const isMissingSync = !requiredSchema || !requiredSchema.should_sync

                return (
                    <LemonButton
                        key={source.id}
                        type="secondary"
                        fullWidth
                        onClick={() => selectExistingSource(source.id, dwSource)}
                    >
                        <div className="flex items-center gap-2 w-full min-w-0">
                            <DataWarehouseSourceIcon type={source.source_type} size="small" disableTooltip />
                            <div className="flex-1 text-left min-w-0">
                                <div className="font-medium truncate">
                                    {source.prefix ? `${dwSource} (${source.prefix})` : dwSource}
                                </div>
                                {isMissingSync && (
                                    <Tooltip
                                        title={`The "${requiredTable}" table isn't syncing yet, but we'll enable it automatically when you proceed with this source.`}
                                    >
                                        <span className="text-xs text-warning cursor-help">
                                            {requiredTable} sync will be enabled
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    </LemonButton>
                )
            })}
            <LemonButton
                type="tertiary"
                fullWidth
                icon={<IconPlus />}
                onClick={() => {
                    closeExistingSourceSelection()
                    openDataSourceSetup(dwSource)
                }}
            >
                Hook up a new {dwSource} integration
            </LemonButton>
        </div>
    )
}

function DataSourceSetup({
    product,
    onComplete,
}: {
    product: ExternalDataSourceType
    onComplete: () => void
}): JSX.Element {
    const { availableSources, availableSourcesLoading } = useValues(availableSourcesDataLogic)

    if (availableSourcesLoading || availableSources === null) {
        return <LemonSkeleton />
    }

    const sourceConfig = Object.values(availableSources).find((s: SourceConfig) => s.name === product)
    if (!sourceConfig) {
        return <div>Source not found</div>
    }

    return (
        <BindLogic
            logic={sourceWizardLogic}
            props={{
                availableSources,
                requiredTables: SIGNAL_SOURCE_REQUIRED_TABLES[product],
                onComplete,
            }}
        >
            <DataSourceSetupForm sourceConfig={sourceConfig} />
        </BindLogic>
    )
}

function DataSourceSetupForm({ sourceConfig }: { sourceConfig: SourceConfig }): JSX.Element {
    const { isLoading, canGoNext } = useValues(sourceWizardLogic)
    const { setInitialConnector, onSubmit } = useActions(sourceWizardLogic)

    // Set up the connector so sourceWizardLogic knows what source type we're connecting
    useEffect(() => {
        setInitialConnector(sourceConfig)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <DataWarehouseSourceIcon type={sourceConfig.name} size="small" disableTooltip />
                <p className="text-sm text-muted-alt mb-0">
                    Connect {sourceConfig.label ?? sourceConfig.name} as a data source to enable this signal.
                </p>
            </div>

            <SourceForm sourceConfig={sourceConfig} showPrefix={false} />

            <div className="flex justify-end">
                <LemonButton
                    type="primary"
                    loading={isLoading}
                    disabledReason={!canGoNext ? 'Fill in the required fields' : undefined}
                    onClick={() => onSubmit()}
                >
                    Connect
                </LemonButton>
            </div>
        </div>
    )
}
