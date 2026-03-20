import { definitionPopoverLogic } from 'lib/components/DefinitionPopover/definitionPopoverLogic'
import { TaxonomicFilterGroupType } from 'lib/components/TaxonomicFilter/types'

import { initKeaTests } from '~/test/init'

import { funnelDataWarehouseStepDefinitionPopoverLogic } from './funnelDataWarehouseStepDefinitionPopoverLogic'

describe('funnelDataWarehouseStepDefinitionPopoverLogic', () => {
    beforeEach(() => {
        initKeaTests()
    })

    it('ignores stale field mappings from a previously hovered table', () => {
        const selectedItemMeta = {
            id: 'warehouse_table_a',
            table_name: 'warehouse_table_a',
            timestamp_field: 'date_day',
            id_field: 'id',
            aggregation_target_field: 'person_id',
        }

        const previouslyHoveredTable = {
            id: 'table-a-id',
            name: 'warehouse_table_a',
            type: 'data_warehouse' as const,
            format: 'Parquet',
            url_pattern: '',
            fields: {
                id: { name: 'id', hogql_value: 'id', type: 'integer', schema_valid: true },
                created_at: { name: 'created_at', hogql_value: 'created_at', type: 'datetime', schema_valid: true },
            },
        }

        const currentlyHoveredTable = {
            id: 'table-b-id',
            name: 'warehouse_table_b',
            type: 'data_warehouse' as const,
            format: 'Parquet',
            url_pattern: '',
            fields: {
                id: { name: 'id', hogql_value: 'id', type: 'integer', schema_valid: true },
                event_timestamp: {
                    name: 'event_timestamp',
                    hogql_value: 'event_timestamp',
                    type: 'datetime',
                    schema_valid: true,
                },
            },
        }

        const popoverDefinitionLogic = definitionPopoverLogic({
            type: TaxonomicFilterGroupType.DataWarehouse,
            selectedItemMeta,
        })
        popoverDefinitionLogic.mount()
        popoverDefinitionLogic.actions.setDefinition(previouslyHoveredTable)

        expect(popoverDefinitionLogic.values.localDefinition.timestamp_field).toEqual('date_day')

        const onSelectItem = jest.fn()
        const logic = funnelDataWarehouseStepDefinitionPopoverLogic({
            table: currentlyHoveredTable,
            group: { type: TaxonomicFilterGroupType.DataWarehouse } as any,
            dataWarehousePopoverFields: [
                { key: 'id_field', label: 'Unique ID' },
                { key: 'timestamp_field', label: 'Timestamp' },
                { key: 'aggregation_target_field', label: 'Aggregation target', allowHogQL: true },
            ],
            selectedItemMeta,
            onSelectItem,
            insightProps: { dashboardItemId: undefined } as any,
        })
        logic.mount()

        expect(logic.values.previewExpressionColumns).toEqual([])
        expect(logic.values.activeFieldValue).toBeUndefined()

        logic.actions.setActiveFieldKey('timestamp_field')
        expect(logic.values.activeFieldValue).toEqual('event_timestamp')

        logic.actions.selectTable()
        expect(onSelectItem).toHaveBeenCalledWith(
            expect.objectContaining({ type: TaxonomicFilterGroupType.DataWarehouse }),
            'warehouse_table_b',
            expect.objectContaining({
                id_field: 'id',
                timestamp_field: 'event_timestamp',
            })
        )
    })
})
