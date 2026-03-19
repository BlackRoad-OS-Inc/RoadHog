import { actions, afterMount, kea, listeners, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'

import api from 'lib/api'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'

import { DataWarehouseProvisioningStatus } from '~/types'

import type { warehouseProvisioningLogicType } from './warehouseProvisioningLogicType'

export const warehouseProvisioningLogic = kea<warehouseProvisioningLogicType>([
    path(['scenes', 'data-warehouse', 'scene', 'warehouseProvisioningLogic']),

    actions({
        provisionWarehouse: true,
        provisionWarehouseComplete: true,
        deprovisionWarehouse: true,
        deprovisionWarehouseComplete: true,
        pollStatus: true,
        stopPolling: true,
    }),

    loaders({
        warehouseStatus: [
            null as DataWarehouseProvisioningStatus | null,
            {
                loadWarehouseStatus: async () => {
                    try {
                        return await api.dataWarehouse.warehouseStatus()
                    } catch (e: any) {
                        if (e.status === 404) {
                            return null
                        }
                        throw e
                    }
                },
            },
        ],
    }),

    reducers({
        isProvisioning: [
            false,
            {
                provisionWarehouse: () => true,
                provisionWarehouseComplete: () => false,
            },
        ],
        isDeprovisioning: [
            false,
            {
                deprovisionWarehouse: () => true,
                deprovisionWarehouseComplete: () => false,
            },
        ],
        pollingActive: [
            false,
            {
                pollStatus: () => true,
                stopPolling: () => false,
            },
        ],
    }),

    selectors({
        isActionable: [
            (s) => [s.warehouseStatus],
            (status): boolean => {
                if (!status) {
                    return true
                }
                return status.state === 'ready' || status.state === 'failed' || status.state === 'deleted'
            },
        ],
        isInProgress: [
            (s) => [s.warehouseStatus],
            (status): boolean => {
                if (!status) {
                    return false
                }
                return status.state === 'pending' || status.state === 'provisioning' || status.state === 'deleting'
            },
        ],
    }),

    listeners(({ actions, values }) => ({
        provisionWarehouse: async () => {
            try {
                await api.dataWarehouse.provisionWarehouse()
                lemonToast.success('Warehouse provisioning started')
                actions.loadWarehouseStatus()
                actions.pollStatus()
            } catch (e: any) {
                lemonToast.error(`Failed to provision warehouse: ${e.message || 'Unknown error'}`)
            }
            actions.provisionWarehouseComplete()
        },

        deprovisionWarehouse: async () => {
            try {
                await api.dataWarehouse.deprovisionWarehouse()
                lemonToast.success('Warehouse deprovisioning started')
                actions.loadWarehouseStatus()
                actions.pollStatus()
            } catch (e: any) {
                lemonToast.error(`Failed to deprovision warehouse: ${e.message || 'Unknown error'}`)
            }
            actions.deprovisionWarehouseComplete()
        },

        pollStatus: async (_, breakpoint) => {
            await breakpoint(10000)
            if (!values.pollingActive) {
                return
            }
            actions.loadWarehouseStatus()
        },

        loadWarehouseStatusSuccess: ({ warehouseStatus }) => {
            if (
                warehouseStatus &&
                (warehouseStatus.state === 'pending' ||
                    warehouseStatus.state === 'provisioning' ||
                    warehouseStatus.state === 'deleting')
            ) {
                actions.pollStatus()
            } else {
                actions.stopPolling()
            }
        },
    })),

    afterMount(({ actions }) => {
        actions.loadWarehouseStatus()
    }),
])
