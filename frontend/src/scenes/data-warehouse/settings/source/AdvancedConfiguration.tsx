import { useActions, useValues } from 'kea'
import { useMemo, useEffect, useState } from 'react'

import { LemonButton, LemonSkeleton } from '@posthog/lemon-ui'

import { LemonBanner } from 'lib/lemon-ui/LemonBanner'
import { LemonSwitch } from 'lib/lemon-ui/LemonSwitch'
import { LemonTextArea } from 'lib/lemon-ui/LemonTextArea/LemonTextArea'

import { ExternalDataSourceSchema } from '~/types'

import { advancedConfigurationLogic } from './advancedConfigurationLogic'

interface AdvancedConfigurationProps {
    sourceId: string
    schemas: ExternalDataSourceSchema[]
}

export function AdvancedConfiguration({ sourceId, schemas }: AdvancedConfigurationProps): JSX.Element {
    const [isExpanded, setIsExpanded] = useState(false)
    const logic = advancedConfigurationLogic({ sourceId })
    const { schemaProperties, schemaPropertiesLoading, propertiesInputs, saveLoadingSchemas } = useValues(logic)
    const { loadSchemaProperties, setPropertiesInput, saveSelectedProperties } = useActions(logic)

    const enabledSchemas = useMemo(() => schemas.filter((s) => s.should_sync), [schemas])

    useEffect(() => {
        if (isExpanded) {
            for (const schema of enabledSchemas) {
                if (!schemaProperties[schema.id]) {
                    loadSchemaProperties(schema)
                }
            }
        }
    }, [isExpanded, enabledSchemas, schemaProperties, loadSchemaProperties])

    return (
        <div className="mt-4">
            <LemonSwitch
                checked={isExpanded}
                onChange={setIsExpanded}
                label="Advanced configuration"
                bordered
                fullWidth
            />
            {isExpanded && (
                <div className="mt-2 space-y-4">
                    <LemonBanner type="info">
                        Specify which properties to sync for each schema. Changing properties will trigger a full
                        resync. Leave empty to use default properties.
                    </LemonBanner>
                    {enabledSchemas.length === 0 && (
                        <p className="text-muted">No schemas are currently enabled for syncing.</p>
                    )}
                    {enabledSchemas.map((schema) => (
                        <SchemaPropertiesEditor
                            key={schema.id}
                            schema={schema}
                            defaultProperties={schemaProperties[schema.id]?.default_properties ?? null}
                            loading={schemaPropertiesLoading}
                            propertiesInput={propertiesInputs[schema.id] ?? ''}
                            saveLoading={saveLoadingSchemas[schema.id] ?? false}
                            onInputChange={(value) => setPropertiesInput(schema.id, value)}
                            onSave={() => saveSelectedProperties(schema.id, propertiesInputs[schema.id] ?? '')}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

interface SchemaPropertiesEditorProps {
    schema: ExternalDataSourceSchema
    defaultProperties: string[] | null
    loading: boolean
    propertiesInput: string
    saveLoading: boolean
    onInputChange: (value: string) => void
    onSave: () => void
}

function SchemaPropertiesEditor({
    schema,
    defaultProperties,
    loading,
    propertiesInput,
    saveLoading,
    onInputChange,
    onSave,
}: SchemaPropertiesEditorProps): JSX.Element {
    return (
        <div className="border rounded p-3">
            <h4 className="font-semibold mb-1">{schema.name}</h4>
            {loading && !defaultProperties ? (
                <LemonSkeleton className="h-8" />
            ) : (
                <>
                    {defaultProperties && (
                        <p className="text-muted text-xs mb-2">Default properties: {defaultProperties.join(', ')}</p>
                    )}
                    <LemonTextArea
                        placeholder="Enter properties separated by commas, e.g. email, firstname, custom_field"
                        value={propertiesInput}
                        onChange={onInputChange}
                        minRows={2}
                        maxRows={4}
                    />
                    <div className="mt-2 flex justify-end">
                        <LemonButton type="primary" size="small" loading={saveLoading} onClick={onSave}>
                            Save properties
                        </LemonButton>
                    </div>
                </>
            )}
        </div>
    )
}
