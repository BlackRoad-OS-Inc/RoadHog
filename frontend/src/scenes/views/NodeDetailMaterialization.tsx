import { useActions, useValues } from 'kea'

import { IconRevert, IconX } from '@posthog/icons'
import { LemonDialog, LemonTable, LemonTag, Link, Tooltip } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonButton } from 'lib/lemon-ui/LemonButton'
import { LemonSelect } from 'lib/lemon-ui/LemonSelect'
import { humanFriendlyDetailedTime, humanFriendlyDuration, humanFriendlyNumber } from 'lib/utils'

import { DataModelingJob, DataWarehouseSyncInterval, OrNever } from '~/types'

import { dataWarehouseViewsLogic } from '../data-warehouse/saved_queries/dataWarehouseViewsLogic'
import { STATUS_TAG_SETTINGS } from './nodeDetailConstants'
import { nodeDetailSceneLogic } from './nodeDetailSceneLogic'

const SYNC_FREQUENCY_OPTIONS = [
    { value: 'never' as OrNever, label: 'No resync' },
    { value: '5min' as DataWarehouseSyncInterval, label: 'Resync every 5 mins' },
    { value: '30min' as DataWarehouseSyncInterval, label: 'Resync every 30 mins' },
    { value: '1hour' as DataWarehouseSyncInterval, label: 'Resync every 1 hour' },
    { value: '6hour' as DataWarehouseSyncInterval, label: 'Resync every 6 hours' },
    { value: '12hour' as DataWarehouseSyncInterval, label: 'Resync every 12 hours' },
    { value: '24hour' as DataWarehouseSyncInterval, label: 'Resync daily' },
    { value: '7day' as DataWarehouseSyncInterval, label: 'Resync weekly' },
    { value: '30day' as DataWarehouseSyncInterval, label: 'Resync monthly' },
]

function computeDuration(job: { created_at: string; last_run_at: string | null; status: string }): string {
    if (job.status === 'Running') {
        return 'In progress'
    }
    if (!job.created_at || !job.last_run_at) {
        return '-'
    }
    const start = new Date(job.created_at).getTime()
    const end = new Date(job.last_run_at).getTime()
    const durationSeconds = (end - start) / 1000
    if (durationSeconds <= 0) {
        return '-'
    }
    return humanFriendlyDuration(durationSeconds)
}

export function NodeDetailMaterialization({ id }: { id: string }): JSX.Element | null {
    const { savedQuery, materializationJobs, materializationJobsLoading, startingMaterialization } = useValues(
        nodeDetailSceneLogic({ id })
    )
    const { setJobsOffset, setStartingMaterialization } = useActions(nodeDetailSceneLogic({ id }))
    const { jobsOffset } = useValues(nodeDetailSceneLogic({ id }))
    const { updatingDataWarehouseSavedQuery } = useValues(dataWarehouseViewsLogic)
    const {
        cancelDataWarehouseSavedQuery,
        materializeDataWarehouseSavedQuery,
        revertMaterialization,
        runDataWarehouseSavedQuery,
        updateDataWarehouseSavedQuery,
    } = useActions(dataWarehouseViewsLogic)

    if (!savedQuery) {
        return null
    }

    const currentJobStatus = materializationJobs?.results?.[0]?.status ?? savedQuery.status ?? null
    const syncDisabledReason =
        currentJobStatus === 'Running'
            ? 'Materialization is already running'
            : startingMaterialization
              ? 'Materialization is starting'
              : false
    const cancelDisabledReason = currentJobStatus !== 'Running' ? 'Materialization is not running' : false
    const revertDisabledReason =
        currentJobStatus === 'Running' ? 'Cannot revert while materialization is running' : false

    const jobs = materializationJobs?.results ?? []

    return (
        <div className="space-y-4 mt-4">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold mb-0">Materialization</h3>
                    {savedQuery.latest_error && savedQuery.status === 'Failed' ? (
                        <Tooltip title={savedQuery.latest_error} interactive>
                            <LemonTag type="danger">Error</LemonTag>
                        </Tooltip>
                    ) : null}
                </div>
                {savedQuery.is_materialized ? (
                    <div className="space-y-3">
                        <p className="text-sm text-muted mb-0">
                            {savedQuery.last_run_at
                                ? `Last run at ${humanFriendlyDetailedTime(savedQuery.last_run_at)}`
                                : 'Materialization scheduled'}
                        </p>
                        <div className="flex flex-wrap gap-3 items-center">
                            <LemonButton
                                type="secondary"
                                loading={startingMaterialization || currentJobStatus === 'Running'}
                                disabledReason={syncDisabledReason}
                                onClick={() => {
                                    setStartingMaterialization(true)
                                    runDataWarehouseSavedQuery(savedQuery.id)
                                }}
                                sideAction={{
                                    icon: <IconX fontSize={16} />,
                                    tooltip: 'Cancel materialization',
                                    onClick: () => cancelDataWarehouseSavedQuery(savedQuery.id),
                                    disabledReason: cancelDisabledReason,
                                }}
                            >
                                {startingMaterialization
                                    ? 'Starting...'
                                    : currentJobStatus === 'Running'
                                      ? 'Running...'
                                      : 'Sync now'}
                            </LemonButton>
                            <LemonSelect
                                value={savedQuery.sync_frequency || 'never'}
                                disabledReason={syncDisabledReason}
                                onChange={(newValue) => {
                                    if (!newValue) {
                                        return
                                    }
                                    updateDataWarehouseSavedQuery({
                                        id: savedQuery.id,
                                        sync_frequency: newValue,
                                        types: [[]],
                                        lifecycle: 'update',
                                    })
                                }}
                                loading={updatingDataWarehouseSavedQuery}
                                options={SYNC_FREQUENCY_OPTIONS}
                            />
                            <LemonButton
                                type="secondary"
                                size="small"
                                icon={<IconRevert />}
                                disabledReason={revertDisabledReason}
                                tooltip="Revert materialized view to view"
                                onClick={() => {
                                    LemonDialog.open({
                                        title: 'Revert materialization',
                                        maxWidth: '30rem',
                                        description:
                                            'Are you sure you want to revert this materialized view to a regular view? This will stop future syncs and remove the materialized table.',
                                        primaryButton: {
                                            status: 'danger',
                                            children: 'Revert materialization',
                                            onClick: () => revertMaterialization(savedQuery.id),
                                        },
                                        secondaryButton: {
                                            children: 'Cancel',
                                        },
                                    })
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-muted mb-0">
                            Materialized views pre-compute query results for faster reads and scheduled refreshes.{' '}
                            <Link
                                data-attr="materializing-help"
                                to="https://posthog.com/docs/data-warehouse/views#materializing-and-scheduling-a-view"
                                target="_blank"
                            >
                                Learn more about materialization
                            </Link>
                            .
                        </p>
                        <LemonButton
                            type="primary"
                            loading={updatingDataWarehouseSavedQuery}
                            onClick={() => materializeDataWarehouseSavedQuery(savedQuery.id)}
                        >
                            Materialize
                        </LemonButton>
                    </div>
                )}
            </div>
            <div className="space-y-2">
                <div>
                    <h3 className="text-lg font-semibold mb-0">Runs</h3>
                    <p className="text-sm text-muted mb-0">
                        Recent sync runs for this view, whether they were scheduled or started on demand.
                    </p>
                </div>
            </div>
            <LemonTable
                dataSource={jobs}
                loading={materializationJobsLoading}
                columns={[
                    {
                        title: 'Status',
                        key: 'status',
                        render: (_, job: DataModelingJob) => (
                            <LemonTag type={STATUS_TAG_SETTINGS[job.status] || 'default'}>{job.status}</LemonTag>
                        ),
                    },
                    {
                        title: 'Started at',
                        key: 'created_at',
                        render: (_, job: DataModelingJob) => (job.created_at ? <TZLabel time={job.created_at} /> : '-'),
                    },
                    {
                        title: 'Duration',
                        key: 'duration',
                        render: (_, job) => computeDuration(job),
                    },
                    {
                        title: 'Rows',
                        key: 'rows_materialized',
                        render: (_, job) =>
                            (job.status === 'Running' || job.status === 'Cancelled') && job.rows_materialized === 0
                                ? '~'
                                : humanFriendlyNumber(job.rows_materialized),
                    },
                    {
                        title: 'Error',
                        key: 'error',
                        render: (_, job) =>
                            job.error ? (
                                <Tooltip title={job.error}>
                                    <span className="text-danger truncate max-w-xs inline-block">
                                        {job.error.slice(0, 80)}
                                        {job.error.length > 80 ? '...' : ''}
                                    </span>
                                </Tooltip>
                            ) : (
                                '-'
                            ),
                    },
                ]}
                emptyState="No runs available"
            />
            {(materializationJobs?.next || materializationJobs?.previous) && (
                <div className="flex gap-2 justify-end">
                    {materializationJobs.previous && (
                        <LemonButton
                            type="secondary"
                            size="small"
                            onClick={() => setJobsOffset(Math.max(0, jobsOffset - 10))}
                        >
                            Previous
                        </LemonButton>
                    )}
                    {materializationJobs.next && (
                        <LemonButton type="secondary" size="small" onClick={() => setJobsOffset(jobsOffset + 10)}>
                            Next
                        </LemonButton>
                    )}
                </div>
            )}
        </div>
    )
}
