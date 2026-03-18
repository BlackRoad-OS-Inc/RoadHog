import { Pool } from 'pg'
import { RRule } from 'rrule'

import { KAFKA_CDP_BATCH_HOGFLOW_REQUESTS } from '~/config/kafka-topics'
import { KafkaProducerWrapper } from '~/kafka/producer'
import {
    HealthCheckResult,
    HealthCheckResultError,
    HealthCheckResultOk,
    PluginServerService,
    PluginsServerConfig,
} from '~/types'
import { logger } from '~/utils/logger'

interface DueRun {
    id: string
    schedule_id: string
    scheduled_at: Date
    rrule: string
    starts_at: Date
    timezone: string
    hog_flow_id: string
    team_id: number
}

export class HogFlowScheduleService {
    private pool: Pool
    private kafkaProducer: KafkaProducerWrapper | null = null
    private intervalHandle: ReturnType<typeof setInterval> | null = null
    private readonly pollIntervalMs: number
    private readonly batchSize: number
    private readonly windowSize: number

    constructor(private config: PluginsServerConfig) {
        this.pool = new Pool({
            connectionString: config.DATABASE_URL,
            max: 5,
            idleTimeoutMillis: 30000,
        })
        this.pollIntervalMs = 60_000 // 1 minute
        this.batchSize = 100
        this.windowSize = 10
    }

    async start(): Promise<void> {
        // Validate DB connection
        const client = await this.pool.connect()
        client.release()

        // Create Kafka producer
        this.kafkaProducer = await KafkaProducerWrapper.create(this.config.KAFKA_CLIENT_RACK)

        this.intervalHandle = setInterval(() => {
            this.pollAndDispatch().catch((err) => {
                logger.error('HogFlowScheduleService poll error', { error: String(err) })
            })
        }, this.pollIntervalMs)

        // Run immediately on start
        await this.pollAndDispatch()
    }

    async pollAndDispatch(): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query('BEGIN')

            // Query due runs with FOR UPDATE SKIP LOCKED
            const result = await client.query<DueRun>(
                `SELECT r.id, r.schedule_id, r.scheduled_at,
                        s.rrule, s.starts_at, s.timezone,
                        s.hog_flow_id::text as hog_flow_id, s.team_id
                 FROM workflows_hogflowscheduledrun r
                 JOIN workflows_hogflowschedule s ON r.schedule_id = s.id
                 WHERE r.status = 'pending'
                   AND r.scheduled_at <= NOW()
                   AND s.status = 'active'
                 ORDER BY r.scheduled_at ASC
                 LIMIT $1
                 FOR UPDATE OF r SKIP LOCKED`,
                [this.batchSize]
            )

            const scheduleIdsToReplenish = new Set<string>()

            for (const run of result.rows) {
                try {
                    // Mark as queued
                    await client.query(
                        `UPDATE workflows_hogflowscheduledrun
                         SET status = 'queued', started_at = NOW(), updated_at = NOW()
                         WHERE id = $1`,
                        [run.id]
                    )

                    // Fetch the HogFlow to check it's active and get trigger type
                    const hogFlowResult = await client.query<{
                        status: string
                        trigger: Record<string, unknown>
                    }>(`SELECT status, trigger FROM posthog_hogflow WHERE id = $1`, [run.hog_flow_id])

                    if (!hogFlowResult.rows.length || hogFlowResult.rows[0].status !== 'active') {
                        await client.query(
                            `UPDATE workflows_hogflowscheduledrun
                             SET status = 'skipped', completed_at = NOW(), updated_at = NOW(),
                                 failure_reason = 'Workflow not active'
                             WHERE id = $1`,
                            [run.id]
                        )
                        continue
                    }

                    const hogFlow = hogFlowResult.rows[0]
                    const triggerType = (hogFlow.trigger as Record<string, unknown>)?.type

                    if (triggerType === 'batch') {
                        await this.dispatchBatchTrigger(run, hogFlow.trigger as Record<string, unknown>)
                    } else {
                        // Future trigger types will add their dispatch path here
                        logger.warn('HogFlowScheduleService: unsupported trigger type', {
                            triggerType,
                            runId: run.id,
                        })
                        await client.query(
                            `UPDATE workflows_hogflowscheduledrun
                             SET status = 'failed', completed_at = NOW(), updated_at = NOW(),
                                 failure_reason = $2
                             WHERE id = $1`,
                            [run.id, `Unsupported trigger type: ${triggerType}`]
                        )
                        continue
                    }

                    // Mark as completed
                    await client.query(
                        `UPDATE workflows_hogflowscheduledrun
                         SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                         WHERE id = $1`,
                        [run.id]
                    )

                    scheduleIdsToReplenish.add(run.schedule_id)
                } catch (err) {
                    logger.error('HogFlowScheduleService: failed to process run', {
                        runId: run.id,
                        error: String(err),
                    })
                    await client.query(
                        `UPDATE workflows_hogflowscheduledrun
                         SET status = 'failed', completed_at = NOW(), updated_at = NOW(),
                             failure_reason = $2
                         WHERE id = $1`,
                        [run.id, String(err)]
                    )
                }
            }

            await client.query('COMMIT')

            // Replenish window for consumed schedules (outside the transaction)
            for (const scheduleId of scheduleIdsToReplenish) {
                try {
                    await this.replenishWindow(scheduleId)
                } catch (err) {
                    logger.error('HogFlowScheduleService: failed to replenish window', {
                        scheduleId,
                        error: String(err),
                    })
                }
            }
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        } finally {
            client.release()
        }
    }

    private async dispatchBatchTrigger(run: DueRun, trigger: Record<string, unknown>): Promise<void> {
        if (!this.kafkaProducer) {
            throw new Error('Kafka producer not available')
        }

        const filters = trigger.filters as Record<string, unknown> | undefined

        const batchHogFlowRequest = {
            teamId: run.team_id,
            hogFlowId: run.hog_flow_id,
            parentRunId: null,
            filters: {
                properties: (filters?.properties as unknown[]) || [],
                filter_test_accounts: false,
            },
        }

        await this.kafkaProducer.produce({
            topic: KAFKA_CDP_BATCH_HOGFLOW_REQUESTS,
            value: Buffer.from(JSON.stringify(batchHogFlowRequest)),
            key: `${run.team_id}_${run.hog_flow_id}`,
        })

        logger.info('HogFlowScheduleService: dispatched batch trigger', {
            runId: run.id,
            hogFlowId: run.hog_flow_id,
            teamId: run.team_id,
        })
    }

    private async replenishWindow(scheduleId: string): Promise<void> {
        // Fetch schedule details
        const schedResult = await this.pool.query<{
            rrule: string
            starts_at: Date
            timezone: string
            team_id: number
            status: string
        }>(
            `SELECT rrule, starts_at, timezone, team_id, status
             FROM workflows_hogflowschedule WHERE id = $1`,
            [scheduleId]
        )

        if (!schedResult.rows.length || schedResult.rows[0].status !== 'active') {
            return
        }

        const sched = schedResult.rows[0]

        // Find the last scheduled_at among non-cancelled runs
        const lastRunResult = await this.pool.query<{ scheduled_at: Date }>(
            `SELECT scheduled_at FROM workflows_hogflowscheduledrun
             WHERE schedule_id = $1 AND status != 'cancelled'
             ORDER BY scheduled_at DESC LIMIT 1`,
            [scheduleId]
        )

        // Count existing pending runs
        const pendingCountResult = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM workflows_hogflowscheduledrun
             WHERE schedule_id = $1 AND status = 'pending'`,
            [scheduleId]
        )

        const pendingCount = parseInt(pendingCountResult.rows[0]?.count || '0', 10)
        if (pendingCount >= this.windowSize) {
            return // Window is already full
        }

        const needed = this.windowSize - pendingCount
        const after = lastRunResult.rows[0]?.scheduled_at || null
        const afterDate = after ? new Date(after) : new Date()
        const occurrences = this.computeOccurrences(sched.rrule, new Date(sched.starts_at), afterDate, needed)

        if (occurrences.length === 0) {
            // RRULE is exhausted
            await this.pool.query(
                `UPDATE workflows_hogflowschedule SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [scheduleId]
            )
            return
        }

        // Insert new pending runs
        const values: unknown[] = []
        const placeholders: string[] = []
        let paramIndex = 1

        for (const dt of occurrences) {
            placeholders.push(
                `(gen_random_uuid(), $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 'pending', NOW(), NOW())`
            )
            values.push(sched.team_id, scheduleId, dt)
            paramIndex += 3
        }

        await this.pool.query(
            `INSERT INTO workflows_hogflowscheduledrun (id, team_id, schedule_id, scheduled_at, status, created_at, updated_at)
             VALUES ${placeholders.join(', ')}`,
            values
        )
    }

    private computeOccurrences(rruleStr: string, dtstart: Date, after: Date, count: number): Date[] {
        // Build rule with dtstart — must construct fresh to include dtstart
        const parsed = RRule.fromString(rruleStr)
        const rule = new RRule({ ...parsed.origOptions, dtstart })

        // Use between() which respects COUNT/UNTIL, unlike after() which ignores them
        // Set a far-future upper bound for "never ending" rules
        const upperBound = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000 * 10) // 10 years
        const allOccurrences = rule.between(after, upperBound, false) // inc=false excludes exact match

        return allOccurrences.slice(0, count)
    }

    isRunning(): boolean {
        return this.intervalHandle !== null
    }

    async stop(): Promise<void> {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle)
            this.intervalHandle = null
        }
        await this.kafkaProducer?.disconnect()
        await this.pool.end()
    }

    isHealthy(): HealthCheckResult {
        if (!this.isRunning()) {
            return new HealthCheckResultError('HogFlowScheduleService interval is not running', {})
        }
        return new HealthCheckResultOk()
    }

    get service(): PluginServerService {
        return {
            id: 'cdp-hogflow-scheduler',
            onShutdown: async () => await this.stop(),
            healthcheck: () => this.isHealthy(),
        }
    }
}
