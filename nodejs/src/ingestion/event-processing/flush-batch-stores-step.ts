import { MessageSizeTooLarge } from '../../utils/db/error'
import { logger } from '../../utils/logger'
import { BatchWritingGroupStore } from '../../worker/ingestion/groups/batch-writing-group-store'
import { FlushResult, PersonsStore } from '../../worker/ingestion/persons/persons-store'
import { produceIngestionWarning } from '../../worker/ingestion/utils'
import { BatchProcessingStep } from '../pipelines/base-batch-pipeline'
import { PipelineResult, ok } from '../pipelines/results'
import {
    INGESTION_WARNINGS_OUTPUT,
    IngestionOutputs,
    IngestionWarningsOutput,
    PersonDistinctIdsOutput,
    PersonsOutput,
} from './ingestion-outputs'

export interface FlushBatchStoresStepConfig {
    personsStore: PersonsStore
    groupStore: BatchWritingGroupStore
    outputs: IngestionOutputs<PersonsOutput | PersonDistinctIdsOutput | IngestionWarningsOutput>
}

/**
 * Batch processing step that flushes person and group stores and returns
 * Kafka produce promises as side effects.
 *
 * This step should be added at the end of the pipeline after all events
 * have been processed but before handleResults/handleSideEffects.
 *
 * The step:
 * 1. Flushes both person and group stores (blocking DB operations)
 * 2. Creates Kafka produce promises for all store updates
 * 3. Returns those promises as side effects (non-blocking)
 *
 * This allows the pipeline to handle Kafka produces the same way it handles
 * event emission - as side effects that can be scheduled and awaited separately
 * from the consumer commit.
 *
 * @param config - Configuration containing the stores and outputs
 * @param config.personsStore - The person store (singleton per consumer)
 * @param config.groupStore - The group store (singleton per consumer)
 * @param config.outputs - Ingestion outputs for resolving person/distinct_id producers and topics
 *
 * @returns A batch processing step that flushes both stores
 */
export function createFlushBatchStoresStep<T>(config: FlushBatchStoresStepConfig): BatchProcessingStep<T, void> {
    const { personsStore, groupStore, outputs } = config

    return async function flushBatchStoresStep(batch: T[]): Promise<PipelineResult<void>[]> {
        if (batch.length === 0) {
            return []
        }

        try {
            // Flush both stores in parallel (DB operations, still blocking)
            const [_groupResults, personsStoreMessages] = await Promise.all([groupStore.flush(), personsStore.flush()])

            logger.info('🔄', 'flushBatchStoresStep: Flushed stores', {
                batchSize: batch.length,
                personStoreMessageCount: personsStoreMessages.length,
            })

            // Create Kafka produce promises for all person/group store updates
            const producePromises = createProducePromises(personsStoreMessages, outputs)

            // Report metrics for this batch
            personsStore.reportBatch()
            groupStore.reportBatch()

            // Reset stores for next batch
            personsStore.reset()
            groupStore.reset()

            // Return same number of results as input (cardinality requirement)
            // Attach all side effects to the first result only to avoid duplication
            // The pipeline framework will accumulate them into the first item's context
            // We return undefined because this is a terminal step (BatchProcessingStep<T, void>)
            return batch.map((_, index) => ok(undefined, index === 0 ? producePromises : []))
        } catch (error) {
            // If flush fails, the error will bubble up and fail the entire batch
            // This maintains the existing behavior where flush errors are fatal
            logger.error('❌', 'flushBatchStoresStep: Failed to flush stores', {
                error,
                batchSize: batch.length,
            })
            throw error
        }
    }
}

/**
 * Creates Kafka produce promises for all person store flush results.
 * Each FlushResult carries an OutputMessage (with output name, not topic).
 * We resolve the output to get the correct producer and topic.
 *
 * Error handling:
 * - MessageSizeTooLarge: Captures ingestion warning (non-fatal)
 * - Other errors: Propagated to fail the side effect
 */
function createProducePromises(
    personsStoreMessages: FlushResult[],
    outputs: IngestionOutputs<PersonsOutput | PersonDistinctIdsOutput | IngestionWarningsOutput>
): Promise<unknown>[] {
    const promises: Promise<unknown>[] = []
    const ingestionWarningsOutput = outputs.resolve(INGESTION_WARNINGS_OUTPUT)

    for (const record of personsStoreMessages) {
        const { topic, producer } = outputs.resolve(record.topicMessage.output)

        for (const message of record.topicMessage.messages) {
            const promise = producer
                .produce({
                    topic,
                    key: message.key ? Buffer.from(message.key) : null,
                    value: message.value ? Buffer.from(message.value) : null,
                    headers: message.headers,
                })
                .catch((error) => {
                    if (error instanceof MessageSizeTooLarge) {
                        logger.warn('🪣', 'flushBatchStoresStep: Message size too large', {
                            output: record.topicMessage.output,
                            teamId: record.teamId,
                            distinctId: record.distinctId,
                            uuid: record.uuid,
                        })
                        return produceIngestionWarning(
                            ingestionWarningsOutput.producer,
                            ingestionWarningsOutput.topic,
                            record.teamId,
                            'message_size_too_large',
                            {
                                eventUuid: record.uuid,
                                distinctId: record.distinctId,
                                step: 'flushBatchStoresStep',
                            }
                        )
                    } else {
                        logger.error('❌', 'flushBatchStoresStep: Failed to produce message', {
                            error,
                            output: record.topicMessage.output,
                            teamId: record.teamId,
                            distinctId: record.distinctId,
                            uuid: record.uuid,
                        })
                        throw error
                    }
                })

            promises.push(promise)
        }
    }

    return promises
}
