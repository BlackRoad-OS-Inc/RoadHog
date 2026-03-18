import { actions, kea, key, listeners, path, props, reducers } from 'kea'
import { loaders } from 'kea-loaders'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'

import { ExternalDataSourceSchema, SchemaAvailablePropertiesResponse } from '~/types'

import type { advancedConfigurationLogicType } from './advancedConfigurationLogicType'

export interface AdvancedConfigurationLogicProps {
    sourceId: string
}

export const advancedConfigurationLogic = kea<advancedConfigurationLogicType>([
    path(['scenes', 'data-warehouse', 'settings', 'source', 'advancedConfigurationLogic']),
    props({} as AdvancedConfigurationLogicProps),
    key((props) => props.sourceId),

    actions({
        setPropertiesInput: (schemaId: string, value: string) => ({ schemaId, value }),
        saveSelectedProperties: (schemaId: string, propertiesInput: string) => ({ schemaId, propertiesInput }),
        setSaveLoading: (schemaId: string, loading: boolean) => ({ schemaId, loading }),
    }),

    loaders(({ values }) => ({
        schemaProperties: [
            {} as Record<string, SchemaAvailablePropertiesResponse>,
            {
                loadSchemaProperties: async (schema: ExternalDataSourceSchema) => {
                    const response = await api.externalDataSchemas.available_properties(schema.id)
                    return {
                        ...values.schemaProperties,
                        [schema.id]: response,
                    }
                },
            },
        ],
    })),

    reducers({
        propertiesInputs: [
            {} as Record<string, string>,
            {
                setPropertiesInput: (state, { schemaId, value }) => ({
                    ...state,
                    [schemaId]: value,
                }),
                loadSchemaPropertiesSuccess: (state, { schemaProperties }) => {
                    const newState = { ...state }
                    for (const [schemaId, props] of Object.entries(schemaProperties)) {
                        if (!(schemaId in newState) && props.selected_properties) {
                            newState[schemaId] = props.selected_properties.join(', ')
                        }
                    }
                    return newState
                },
            },
        ],
        saveLoadingSchemas: [
            {} as Record<string, boolean>,
            {
                setSaveLoading: (state, { schemaId, loading }) => ({
                    ...state,
                    [schemaId]: loading,
                }),
            },
        ],
    }),

    listeners(({ actions }) => ({
        saveSelectedProperties: async ({ schemaId, propertiesInput }) => {
            actions.setSaveLoading(schemaId, true)
            try {
                const trimmed = propertiesInput.trim()
                const selectedProperties =
                    trimmed.length === 0
                        ? null
                        : trimmed
                              .split(',')
                              .map((p) => p.trim())
                              .filter((p) => p.length > 0)

                await api.externalDataSchemas.update(schemaId, {
                    selected_properties: selectedProperties,
                } as any)

                lemonToast.success(
                    selectedProperties
                        ? 'Properties updated. A full resync will be triggered.'
                        : 'Reverted to default properties. A full resync will be triggered.'
                )
            } catch {
                lemonToast.error('Failed to update properties')
            } finally {
                actions.setSaveLoading(schemaId, false)
            }
        },
    })),
])
