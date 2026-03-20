import { KafkaProducerWrapper } from '../../kafka/producer'

export const EVENTS_OUTPUT = 'events' as const
export type EventOutput = typeof EVENTS_OUTPUT

export const AI_EVENTS_OUTPUT = 'ai_events' as const
export type AiEventOutput = typeof AI_EVENTS_OUTPUT

export const HEATMAPS_OUTPUT = 'heatmaps' as const
export type HeatmapsOutput = typeof HEATMAPS_OUTPUT

export const INGESTION_WARNINGS_OUTPUT = 'ingestion_warnings' as const
export type IngestionWarningsOutput = typeof INGESTION_WARNINGS_OUTPUT

export const DLQ_OUTPUT = 'dlq' as const
export type DlqOutput = typeof DLQ_OUTPUT

export const REDIRECT_OUTPUT = 'redirect' as const
export type RedirectOutput = typeof REDIRECT_OUTPUT

export interface IngestionOutputConfig {
    topic: string
    producer: KafkaProducerWrapper
}

export class IngestionOutputs<O extends string> {
    constructor(private outputs: Record<O, IngestionOutputConfig>) {}

    resolve(output: O): IngestionOutputConfig {
        return this.outputs[output]
    }
}
