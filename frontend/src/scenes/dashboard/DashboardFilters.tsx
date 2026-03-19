import clsx from 'clsx'
import { useActions, useValues } from 'kea'

import { IconCalendar, IconCollapse, IconEllipsis, IconExpand } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { AppShortcut } from 'lib/components/AppShortcuts/AppShortcut'
import { keyBinds } from 'lib/components/AppShortcuts/shortcuts'
import { DateFilter } from 'lib/components/DateFilter/DateFilter'
import { QuickFilterSelector } from 'lib/components/QuickFilters/QuickFilterSelector'
import { quickFiltersLogic } from 'lib/components/QuickFilters/quickFiltersLogic'
import { quickFiltersSectionLogic } from 'lib/components/QuickFilters/quickFiltersSectionLogic'
import { DashboardEventSource } from 'lib/utils/eventUsageLogic'
import { Scene } from 'scenes/sceneTypes'
import { urls } from 'scenes/urls'

import { QuickFilterContext } from '~/queries/schema/schema-general'
import { DashboardMode, DashboardPlacement, DashboardType } from '~/types'

import { DashboardEditBar } from './DashboardEditBar'
import { dashboardFiltersLogic } from './dashboardFiltersLogic'
import { dashboardLogic } from './dashboardLogic'
import { DashboardQuickFiltersButton } from './DashboardQuickFiltersButton'
import { dashboardQuickFiltersSelectionLogic } from './dashboardQuickFiltersSelectionLogic'
import { DashboardReloadAction, LastRefreshText } from './DashboardReloadAction'

export function DashboardPrimaryFilters(): JSX.Element {
    const { dashboard, dashboardMode, hasVariables, effectiveEditBarFilters, canEditDashboard } =
        useValues(dashboardLogic)
    const { setDates, setDashboardMode } = useActions(dashboardLogic)

    return (
        <>
            <div className={clsx('content-end', { 'h-[61px]': hasVariables })}>
                <AppShortcut
                    name="DashboardDateFilter"
                    keybind={[keyBinds.dateFilter]}
                    intent="Date filter"
                    interaction="click"
                    scope={Scene.Dashboard}
                >
                    <DateFilter
                        showCustom
                        showExplicitDateToggle
                        allowTimePrecision
                        allowFixedRangeWithTime
                        dateFrom={effectiveEditBarFilters.date_from}
                        dateTo={effectiveEditBarFilters.date_to}
                        explicitDate={effectiveEditBarFilters.explicitDate}
                        onChange={(from_date, to_date, explicitDate) => {
                            if (dashboardMode !== DashboardMode.Edit) {
                                setDashboardMode(DashboardMode.Edit, DashboardEventSource.DashboardFilters)
                            }
                            setDates(from_date, to_date, explicitDate)
                        }}
                        makeLabel={(key) => (
                            <>
                                <IconCalendar />
                                <span className="hide-when-small"> {key}</span>
                            </>
                        )}
                    />
                </AppShortcut>
            </div>

            {canEditDashboard && dashboard && (
                <DashboardQuickFiltersButton context={QuickFilterContext.Dashboards} dashboard={dashboard} />
            )}
        </>
    )
}

export function DashboardQuickFiltersRow(): JSX.Element | null {
    const { dashboard } = useValues(dashboardLogic)

    if (!dashboard) {
        return null
    }

    return <DashboardQuickFiltersRowContent dashboard={dashboard} />
}

function DashboardQuickFiltersRowContent({ dashboard }: { dashboard: DashboardType<any> }): JSX.Element | null {
    const { selectedDashboardFilterIds } = useValues(dashboardQuickFiltersSelectionLogic({ dashboard }))

    const context = QuickFilterContext.Dashboards
    const { quickFilters } = useValues(quickFiltersLogic({ context }))
    const { selectedQuickFilters } = useValues(quickFiltersSectionLogic({ context }))
    const { setQuickFilterValue, clearQuickFilter } = useActions(quickFiltersSectionLogic({ context }))

    if (selectedDashboardFilterIds.length === 0) {
        return null
    }

    const filtersToShow = quickFilters.filter((filter) => selectedDashboardFilterIds.includes(filter.id))

    return (
        <>
            {filtersToShow.map((filter) => {
                const selectedFilter = selectedQuickFilters[filter.id]
                return (
                    <QuickFilterSelector
                        key={filter.id}
                        label={filter.name}
                        options={filter.options}
                        selectedOptionId={selectedFilter?.optionId || null}
                        onChange={(option) => {
                            if (option === null) {
                                clearQuickFilter(filter.id)
                            } else {
                                setQuickFilterValue(filter.id, filter.property_name, option)
                            }
                        }}
                    />
                )
            })}
        </>
    )
}

export function DashboardAdvancedOptionsToggle(): JSX.Element {
    const { dashboard, totalAdvancedFilters } = useValues(dashboardLogic)
    const filtersLogicProps = { dashboardId: dashboard?.id ?? 0 }
    const { showAdvancedFilters } = useValues(dashboardFiltersLogic(filtersLogicProps))
    const { toggleAdvancedFilters } = useActions(dashboardFiltersLogic(filtersLogicProps))

    return (
        <LemonButton
            size="small"
            sideIcon={showAdvancedFilters ? <IconCollapse /> : <IconExpand />}
            onClick={toggleAdvancedFilters}
            title={showAdvancedFilters ? 'Show less' : 'Show more'}
            data-attr="dashboard-advanced-filters-toggle"
        >
            <span className="font-semibold">
                Advanced options
                {totalAdvancedFilters > 0 && <span className="ml-1 text-muted">({totalAdvancedFilters})</span>}
            </span>
        </LemonButton>
    )
}

export function DashboardAdvancedOptions(): JSX.Element | null {
    const { dashboard } = useValues(dashboardLogic)
    const { showAdvancedFilters } = useValues(dashboardFiltersLogic({ dashboardId: dashboard?.id ?? 0 }))

    if (!showAdvancedFilters) {
        return null
    }

    return (
        <DashboardEditBar
            showDateFilter={false}
            className="flex gap-2 items-end flex-wrap border rounded p-2 md:[&>*]:grow-0 [&>*]:grow"
        />
    )
}

interface DashboardFilterBarProps {
    backTo?: { url: string; name: string }
}

export function DashboardFilterBar({ backTo }: DashboardFilterBarProps): JSX.Element {
    const { placement, dashboard, dashboardMode, hasVariables, dashboardFiltersEnabled } = useValues(dashboardLogic)

    const hideFiltersInLayoutEdit = dashboardMode === DashboardMode.Edit

    return (
        <div className="flex min-w-0 flex-col gap-2 w-full">
            <div className="flex min-w-0 w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:gap-x-4 lg:gap-y-3">
                <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-start lg:items-center">
                    {!hideFiltersInLayoutEdit &&
                        ![
                            DashboardPlacement.Public,
                            DashboardPlacement.Export,
                            DashboardPlacement.FeatureFlag,
                            DashboardPlacement.Group,
                            DashboardPlacement.DataOps,
                            DashboardPlacement.Builtin,
                        ].includes(placement) &&
                        dashboard &&
                        (dashboardFiltersEnabled ? <DashboardPrimaryFilters /> : <DashboardEditBar />)}
                </div>
                {![DashboardPlacement.Export, DashboardPlacement.Builtin].includes(placement) && (
                    <div
                        className={clsx(
                            'dashoard-items-actions flex min-w-0 w-full flex-wrap items-start justify-start gap-x-4 gap-y-2 sm:items-end lg:ml-auto lg:w-auto lg:shrink-0 lg:justify-end',
                            {
                                'lg:mt-7': hasVariables,
                            }
                        )}
                    >
                        {dashboardFiltersEnabled && !hideFiltersInLayoutEdit && <DashboardAdvancedOptionsToggle />}
                        <div className={`left-item ${placement === DashboardPlacement.Public ? 'text-right' : ''}`}>
                            {[DashboardPlacement.Public].includes(placement) ? (
                                <LastRefreshText />
                            ) : !(dashboardMode === DashboardMode.Edit) ? (
                                <DashboardReloadAction />
                            ) : null}
                        </div>
                        {[
                            DashboardPlacement.FeatureFlag,
                            DashboardPlacement.Group,
                            DashboardPlacement.DataOps,
                        ].includes(placement) &&
                            dashboard?.id && (
                                <LemonMenu
                                    items={[
                                        {
                                            label:
                                                placement === DashboardPlacement.Group
                                                    ? 'Edit dashboard template'
                                                    : 'Edit dashboard',
                                            to: backTo
                                                ? `${urls.dashboard(dashboard.id)}?backUrl=${encodeURIComponent(backTo.url)}&backName=${encodeURIComponent(backTo.name)}`
                                                : urls.dashboard(dashboard.id),
                                        },
                                    ]}
                                    placement="bottom-end"
                                    fallbackPlacements={['bottom-start', 'bottom']}
                                >
                                    <LemonButton size="small" icon={<IconEllipsis className="text-secondary" />} />
                                </LemonMenu>
                            )}
                    </div>
                )}
            </div>

            {dashboardFiltersEnabled && !hideFiltersInLayoutEdit && (
                <div className="flex items-center gap-2 flex-wrap">
                    <DashboardQuickFiltersRow />
                </div>
            )}

            {dashboardFiltersEnabled && !hideFiltersInLayoutEdit && <DashboardAdvancedOptions />}
        </div>
    )
}
