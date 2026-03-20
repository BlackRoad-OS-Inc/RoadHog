import { KafkaProducerWrapper } from '../../kafka/producer'
import { OutputMessage } from './output-message'

// Re-export all constants, types, and OutputMessage
export * from './output-types'
export * from './output-message'

export interface IngestionOutputConfig {
    topic: string
    producer: KafkaProducerWrapper
}

export class IngestionOutputs<O extends string> {
    constructor(private outputs: Record<O, IngestionOutputConfig>) {}

    resolve(output: O): IngestionOutputConfig {
        return this.outputs[output]
    }

    /** Produce OutputMessages by grouping by output, resolving each to {topic, producer}. */
    async produceMessages(messages: OutputMessage<O> | OutputMessage<O>[]): Promise<void> {
        const arr = Array.isArray(messages) ? messages : [messages]
        const byOutput = new Map<O, OutputMessage<O>['messages']>()

        for (const msg of arr) {
            const existing = byOutput.get(msg.output)
            if (existing) {
                existing.push(...msg.messages)
            } else {
                byOutput.set(msg.output, [...msg.messages])
            }
        }

        const promises: Promise<void>[] = []
        for (const [output, msgs] of byOutput) {
            const { topic, producer } = this.resolve(output)
            promises.push(producer.queueMessages({ topic, messages: msgs }))
        }

        await Promise.all(promises)
    }
}
