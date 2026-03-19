import { useActions, useValues } from 'kea'

import { LemonBanner } from 'lib/lemon-ui/LemonBanner'
import { LemonButton } from 'lib/lemon-ui/LemonButton'
import { LemonDialog } from 'lib/lemon-ui/LemonDialog'
import { LemonTag } from 'lib/lemon-ui/LemonTag'
import { Spinner } from 'lib/lemon-ui/Spinner'

import { DataWarehouseProvisioningState, DataWarehouseProvisioningStatus } from '~/types'

import { warehouseProvisioningLogic } from './warehouseProvisioningLogic'

function stateToTagType(state: DataWarehouseProvisioningState): 'success' | 'warning' | 'danger' | 'default' {
    switch (state) {
        case 'ready':
            return 'success'
        case 'pending':
        case 'provisioning':
        case 'deleting':
            return 'warning'
        case 'failed':
            return 'danger'
        case 'deleted':
        default:
            return 'default'
    }
}

function ComponentStatus({ label, state }: { label: string; state: DataWarehouseProvisioningState }): JSX.Element {
    return (
        <div className="flex items-center justify-between py-1">
            <span className="text-muted">{label}</span>
            <LemonTag type={stateToTagType(state)}>{state}</LemonTag>
        </div>
    )
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element | null {
    if (!value) {
        return null
    }
    return (
        <div className="flex items-start justify-between py-1 gap-4">
            <span className="text-muted whitespace-nowrap">{label}</span>
            <code className="text-xs bg-bg-light px-1.5 py-0.5 rounded break-all text-right">{value}</code>
        </div>
    )
}

function ConnectionDetails({ status }: { status: DataWarehouseProvisioningStatus }): JSX.Element {
    const db = status.warehouse_database
    const host = db.endpoint || 'Pending...'
    const port = db.port || 5432
    const dbName = db.database_name || 'ducklake'
    const username = db.username || 'posthog'

    return (
        <div className="border rounded p-4 space-y-2">
            <h3 className="mb-0">Connection Details</h3>
            <DetailRow label="Host" value={host} />
            <DetailRow label="Port" value={String(port)} />
            <DetailRow label="Database" value={dbName} />
            <DetailRow label="Username" value={username} />
            <div className="mt-2">
                <span className="text-muted text-xs">Connect with:</span>
                <code className="block text-xs bg-bg-light p-2 rounded mt-1 break-all">
                    psql "host={host} port={port} dbname={dbName} user={username} sslmode=require"
                </code>
            </div>
        </div>
    )
}

export function SettingsTab(): JSX.Element {
    const { warehouseStatus, warehouseStatusLoading, isProvisioning, isDeprovisioning, isInProgress } =
        useValues(warehouseProvisioningLogic)
    const { provisionWarehouse, deprovisionWarehouse, loadWarehouseStatus } = useActions(warehouseProvisioningLogic)

    const hasWarehouse = warehouseStatus && warehouseStatus.state !== 'deleted'
    const isReady = warehouseStatus?.state === 'ready'
    const isFailed = warehouseStatus?.state === 'failed'

    return (
        <div className="mt-4 space-y-4 max-w-160">
            <div>
                <h2 className="mb-2">Managed Warehouse</h2>
                <p className="text-muted mb-4">
                    Provision a dedicated data warehouse with Aurora, S3, and isolated compute for your team.
                </p>
            </div>

            {warehouseStatusLoading && !warehouseStatus ? (
                <div className="flex items-center gap-2">
                    <Spinner />
                    <span>Loading warehouse status...</span>
                </div>
            ) : !hasWarehouse ? (
                <div className="space-y-4">
                    <LemonBanner type="info">
                        No managed warehouse has been provisioned for this team. Provisioning creates dedicated Aurora,
                        S3, and compute resources.
                    </LemonBanner>
                    <LemonButton
                        type="primary"
                        loading={isProvisioning}
                        onClick={() => {
                            LemonDialog.open({
                                title: 'Provision managed warehouse?',
                                description:
                                    'This will create dedicated AWS resources (Aurora database, S3 bucket, IAM roles) for your team. This typically takes 5-15 minutes.',
                                primaryButton: {
                                    children: 'Provision',
                                    onClick: () => provisionWarehouse(),
                                },
                                secondaryButton: {
                                    children: 'Cancel',
                                },
                            })
                        }}
                        data-attr="provision-warehouse"
                    >
                        Provision warehouse
                    </LemonButton>
                </div>
            ) : (
                <div className="space-y-4">
                    {isFailed && (
                        <LemonBanner type="error">
                            Provisioning failed: {warehouseStatus?.status_message || 'Unknown error'}
                        </LemonBanner>
                    )}

                    {isInProgress && (
                        <LemonBanner type="info">
                            <div className="flex items-center gap-2">
                                <Spinner />
                                <span>
                                    {warehouseStatus?.state === 'deleting'
                                        ? 'Deprovisioning in progress...'
                                        : 'Provisioning in progress...'}
                                </span>
                            </div>
                        </LemonBanner>
                    )}

                    <div className="border rounded p-4 space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="mb-0">Status</h3>
                            <div className="flex items-center gap-2">
                                <LemonTag type={stateToTagType(warehouseStatus!.state)}>
                                    {warehouseStatus!.state}
                                </LemonTag>
                                <LemonButton size="small" onClick={() => loadWarehouseStatus()} type="secondary">
                                    Refresh
                                </LemonButton>
                            </div>
                        </div>

                        {warehouseStatus!.status_message && (
                            <p className="text-muted text-sm">{warehouseStatus!.status_message}</p>
                        )}

                        <div className="border-t pt-2 mt-2">
                            <ComponentStatus label="S3 Storage" state={warehouseStatus!.s3_state} />
                            <ComponentStatus label="Metadata Store" state={warehouseStatus!.metadata_store_state} />
                            <ComponentStatus label="Identity & IAM" state={warehouseStatus!.identity_state} />
                            <ComponentStatus label="Secrets" state={warehouseStatus!.secrets_state} />
                            <ComponentStatus label="Database" state={warehouseStatus!.warehouse_database_state} />
                        </div>

                        {warehouseStatus!.ready_at && (
                            <p className="text-muted text-xs mt-2">
                                Ready since: {new Date(warehouseStatus!.ready_at).toLocaleString()}
                            </p>
                        )}
                    </div>

                    {isReady && <ConnectionDetails status={warehouseStatus!} />}

                    <div className="flex gap-2">
                        {isFailed && (
                            <LemonButton
                                type="primary"
                                loading={isProvisioning}
                                onClick={() => provisionWarehouse()}
                                data-attr="retry-provision-warehouse"
                            >
                                Retry provisioning
                            </LemonButton>
                        )}
                        {(isReady || isFailed) && (
                            <LemonButton
                                type="secondary"
                                status="danger"
                                loading={isDeprovisioning}
                                onClick={() => {
                                    LemonDialog.open({
                                        title: 'Deprovision managed warehouse?',
                                        description:
                                            'This will delete all AWS resources (Aurora database, S3 bucket, IAM roles) for your team. This action cannot be undone.',
                                        primaryButton: {
                                            children: 'Deprovision',
                                            status: 'danger',
                                            onClick: () => deprovisionWarehouse(),
                                        },
                                        secondaryButton: {
                                            children: 'Cancel',
                                        },
                                    })
                                }}
                                data-attr="deprovision-warehouse"
                            >
                                Deprovision warehouse
                            </LemonButton>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
