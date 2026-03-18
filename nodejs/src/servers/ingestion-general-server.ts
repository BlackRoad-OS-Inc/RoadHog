import { IntegrationManagerService } from '~/cdp/services/managers/integration-manager.service'
import { InternalCaptureService } from '~/common/services/internal-capture'

import { initializePrometheusLabels } from '../api/router'
import {
    HogTransformerServiceConfig,
    HogTransformerServiceDeps,
    createHogTransformerService,
} from '../cdp/hog-transformations/hog-transformer.service'
import { EncryptedFields } from '../cdp/utils/encryption-utils'
import { CommonConfig, PluginServerMode } from '../common/config'
import { defaultConfig } from '../config/config'
import {
    KAFKA_EVENTS_PLUGIN_INGESTION,
    KAFKA_EVENTS_PLUGIN_INGESTION_HISTORICAL,
    KAFKA_EVENTS_PLUGIN_INGESTION_OVERFLOW,
} from '../config/kafka-topics'
import { IngestionConsumerConfig } from '../ingestion/config'
import { CookielessManager } from '../ingestion/cookieless/cookieless-manager'
import { IngestionConsumer, IngestionConsumerDeps } from '../ingestion/ingestion-consumer'
import { IngestionTestingConsumer } from '../ingestion/ingestion-testing-consumer'
import { KafkaProducerWrapper } from '../kafka/producer'
import { PluginServerService, RedisPool } from '../types'
import { ServerCommands } from '../utils/commands'
import { PostgresRouter } from '../utils/db/postgres'
import { createRedisPoolFromConfig } from '../utils/db/redis'
import { GeoIPService } from '../utils/geoip'
import { logger } from '../utils/logger'
import { PubSub } from '../utils/pubsub'
import { TeamManager } from '../utils/team-manager'
import { GroupTypeManager } from '../worker/ingestion/group-type-manager'
import { ClickhouseGroupRepository } from '../worker/ingestion/groups/repositories/clickhouse-group-repository'
import { PostgresGroupRepository } from '../worker/ingestion/groups/repositories/postgres-group-repository'
import { PostgresPersonRepository } from '../worker/ingestion/persons/repositories/postgres-person-repository'
import { BaseServer, CleanupResources } from './base-server'

/**
 * Complete config type for an ingestion-v2 deployment.
 *
 * This is the union of:
 * - IngestionConsumerConfig: ingestion pipeline, person/group processing, overflow, cookieless, etc.
 * - HogTransformerServiceConfig: CDP keys needed by the hog transformer running in-process
 * - CommonConfig picks: infrastructure keys for postgres, kafka, redis, observability, etc.
 *
 * This type is the source of truth for which env vars ingestion-events-* deployments need.
 */
export type IngestionGeneralServerConfig = IngestionConsumerConfig &
    HogTransformerServiceConfig &
    Pick<
        CommonConfig,
        // Server lifecycle
        | 'HTTP_SERVER_PORT'
        | 'INTERNAL_API_SECRET'
        | 'INSTRUMENT_THREAD_PERFORMANCE'
        | 'CONTINUOUS_PROFILING_ENABLED'
        | 'PYROSCOPE_SERVER_ADDRESS'
        | 'PYROSCOPE_APPLICATION_NAME'
        | 'POD_TERMINATION_ENABLED'
        | 'POD_TERMINATION_BASE_TIMEOUT_MINUTES'
        | 'POD_TERMINATION_JITTER_MINUTES'
        | 'LOG_LEVEL'
        // Kafka
        | 'KAFKA_HOSTS'
        | 'KAFKA_CLIENT_RACK'
        | 'KAFKA_SECURITY_PROTOCOL'
        | 'KAFKA_CLIENT_CERT_B64'
        | 'KAFKA_CLIENT_CERT_KEY_B64'
        | 'KAFKA_TRUSTED_CERT_B64'
        | 'KAFKA_SASL_MECHANISM'
        | 'KAFKA_SASL_USER'
        | 'KAFKA_SASL_PASSWORD'
        // Postgres
        | 'DATABASE_URL'
        | 'DATABASE_READONLY_URL'
        | 'PERSONS_DATABASE_URL'
        | 'PERSONS_READONLY_DATABASE_URL'
        | 'BEHAVIORAL_COHORTS_DATABASE_URL'
        | 'PLUGIN_STORAGE_DATABASE_URL'
        | 'POSTGRES_CONNECTION_POOL_SIZE'
        | 'POSTHOG_DB_NAME'
        | 'POSTHOG_DB_USER'
        | 'POSTHOG_DB_PASSWORD'
        | 'POSTHOG_POSTGRES_HOST'
        | 'POSTHOG_POSTGRES_PORT'
        | 'PLUGIN_SERVER_MODE'
        // Redis
        | 'REDIS_URL'
        | 'REDIS_POOL_MIN_SIZE'
        | 'REDIS_POOL_MAX_SIZE'
        | 'INGESTION_REDIS_HOST'
        | 'INGESTION_REDIS_PORT'
        | 'POSTHOG_REDIS_HOST'
        | 'POSTHOG_REDIS_PORT'
        | 'POSTHOG_REDIS_PASSWORD'
        // Services
        | 'MMDB_FILE_LOCATION'
        | 'ENCRYPTION_SALT_KEYS'
        | 'CAPTURE_INTERNAL_URL'
        | 'SITE_URL'
        | 'CLOUD_DEPLOYMENT'
        // Shared between ingestion and CDP
        | 'CDP_HOG_WATCHER_SAMPLE_RATE'
        // Consumer
        | 'CONSUMER_BATCH_SIZE'
        | 'CONSUMER_MAX_HEARTBEAT_INTERVAL_MS'
        | 'CONSUMER_LOOP_STALL_THRESHOLD_MS'
        | 'CONSUMER_LOG_STATS_LEVEL'
        | 'CONSUMER_LOOP_BASED_HEALTH_CHECK'
        | 'CONSUMER_MAX_BACKGROUND_TASKS'
        | 'CONSUMER_WAIT_FOR_BACKGROUND_TASKS_ON_REBALANCE'
        | 'CONSUMER_AUTO_CREATE_TOPICS'
        // Misc
        | 'LAZY_LOADER_DEFAULT_BUFFER_MS'
        | 'LAZY_LOADER_MAX_SIZE'
        | 'TASKS_PER_WORKER'
        | 'TASK_TIMEOUT'
        | 'POSTHOG_API_KEY'
        | 'POSTHOG_HOST_URL'
        | 'HEALTHCHECK_MAX_STALE_SECONDS'
        | 'KAFKA_HEALTHCHECK_SECONDS'
    >

export class IngestionGeneralServer extends BaseServer {
    declare config: IngestionGeneralServerConfig

    private postgres?: PostgresRouter
    private kafkaProducer?: KafkaProducerWrapper
    private kafkaMetricsProducer?: KafkaProducerWrapper
    private redisPool?: RedisPool
    private cookielessRedisPool?: RedisPool
    private cookielessManager?: CookielessManager
    private pubsub?: PubSub

    constructor(config: Partial<IngestionGeneralServerConfig> = {}) {
        const fullConfig = {
            ...defaultConfig,
            ...config,
        }
        super(fullConfig)
    }

    protected async startServices(): Promise<void> {
        initializePrometheusLabels(this.config.INGESTION_PIPELINE, this.config.INGESTION_LANE)

        // 1. Shared infrastructure
        logger.info('ℹ️', 'Connecting to shared infrastructure...')

        this.postgres = new PostgresRouter(this.config)
        logger.info('👍', 'Postgres Router ready')

        logger.info('🤔', 'Connecting to Kafka...')
        this.kafkaProducer = await KafkaProducerWrapper.create(this.config.KAFKA_CLIENT_RACK)
        this.kafkaMetricsProducer = await KafkaProducerWrapper.create(this.config.KAFKA_CLIENT_RACK)
        logger.info('👍', 'Kafka ready')

        logger.info('🤔', 'Connecting to ingestion Redis...')
        this.redisPool = createRedisPoolFromConfig({
            connection: this.config.INGESTION_REDIS_HOST
                ? {
                      url: this.config.INGESTION_REDIS_HOST,
                      options: { port: this.config.INGESTION_REDIS_PORT },
                      name: 'ingestion-redis',
                  }
                : this.config.POSTHOG_REDIS_HOST
                  ? {
                        url: this.config.POSTHOG_REDIS_HOST,
                        options: {
                            port: this.config.POSTHOG_REDIS_PORT,
                            password: this.config.POSTHOG_REDIS_PASSWORD,
                        },
                        name: 'ingestion-redis',
                    }
                  : { url: this.config.REDIS_URL, name: 'ingestion-redis' },
            poolMinSize: this.config.REDIS_POOL_MIN_SIZE,
            poolMaxSize: this.config.REDIS_POOL_MAX_SIZE,
        })
        logger.info('👍', 'Ingestion Redis ready')

        this.pubsub = new PubSub(this.redisPool)
        await this.pubsub.start()

        const teamManager = new TeamManager(this.postgres)

        // 2. Ingestion + CDP shared services (geoip, repos, encryption)
        const geoipService = new GeoIPService(this.config.MMDB_FILE_LOCATION)
        await geoipService.get()

        const personRepository = new PostgresPersonRepository(this.postgres, {
            calculatePropertiesSize: this.config.PERSON_UPDATE_CALCULATE_PROPERTIES_SIZE,
        })
        const groupRepository = new PostgresGroupRepository(this.postgres)
        const encryptedFields = new EncryptedFields(this.config.ENCRYPTION_SALT_KEYS)
        const integrationManager = new IntegrationManagerService(this.pubsub, this.postgres, encryptedFields)
        const internalCaptureService = new InternalCaptureService(this.config)

        // 3. Ingestion-specific services
        logger.info('🤔', 'Connecting to cookieless Redis...')
        this.cookielessRedisPool = createRedisPoolFromConfig({
            connection: this.config.COOKIELESS_REDIS_HOST
                ? {
                      url: this.config.COOKIELESS_REDIS_HOST,
                      options: { port: this.config.COOKIELESS_REDIS_PORT ?? 6379 },
                      name: 'cookieless-redis',
                  }
                : { url: this.config.REDIS_URL, name: 'cookieless-redis' },
            poolMinSize: this.config.REDIS_POOL_MIN_SIZE,
            poolMaxSize: this.config.REDIS_POOL_MAX_SIZE,
        })
        logger.info('👍', 'Cookieless Redis ready')

        this.cookielessManager = new CookielessManager(this.config, this.cookielessRedisPool)
        const groupTypeManager = new GroupTypeManager(groupRepository, teamManager)
        const clickhouseGroupRepository = new ClickhouseGroupRepository(this.kafkaProducer)

        // 4. Hog transformer
        const hogTransformerDeps: HogTransformerServiceDeps = {
            geoipService,
            postgres: this.postgres,
            pubSub: this.pubsub,
            encryptedFields,
            integrationManager,
            kafkaProducer: this.kafkaMetricsProducer,
            teamManager,
            internalCaptureService,
        }

        const serviceLoaders: (() => Promise<PluginServerService>)[] = []

        const isTestingMode = this.config.PLUGIN_SERVER_MODE === PluginServerMode.ingestion_v2_testing
        const isCombinedMode = this.config.PLUGIN_SERVER_MODE === PluginServerMode.ingestion_v2_combined

        if (isTestingMode) {
            serviceLoaders.push(async () => {
                const kafkaWarpStreamProducer = await KafkaProducerWrapper.create(
                    this.config.KAFKA_CLIENT_RACK,
                    'WARPSTREAM_PRODUCER'
                )

                const consumer = new IngestionTestingConsumer(this.config, {
                    kafkaProducer: kafkaWarpStreamProducer,
                    teamManager,
                })
                await consumer.start()
                return consumer.service
            })
        } else {
            const ingestionDeps: IngestionConsumerDeps = {
                postgres: this.postgres,
                redisPool: this.redisPool,
                kafkaProducer: this.kafkaProducer,
                kafkaMetricsProducer: this.kafkaMetricsProducer,
                teamManager,
                groupTypeManager,
                groupRepository,
                clickhouseGroupRepository,
                personRepository,
                cookielessManager: this.cookielessManager,
                hogTransformer: createHogTransformerService(this.config, hogTransformerDeps),
            }

            if (isCombinedMode) {
                // Local dev / hobby: run multiple consumers for all ingestion topics in one process
                const consumersOptions = [
                    { topic: KAFKA_EVENTS_PLUGIN_INGESTION, group_id: 'clickhouse-ingestion' },
                    { topic: KAFKA_EVENTS_PLUGIN_INGESTION_HISTORICAL, group_id: 'clickhouse-ingestion-historical' },
                    { topic: KAFKA_EVENTS_PLUGIN_INGESTION_OVERFLOW, group_id: 'clickhouse-ingestion-overflow' },
                    { topic: 'client_iwarnings_ingestion', group_id: 'client_iwarnings_ingestion' },
                    { topic: 'heatmaps_ingestion', group_id: 'heatmaps_ingestion' },
                ]

                for (const consumerOption of consumersOptions) {
                    serviceLoaders.push(async () => {
                        const consumer = new IngestionConsumer(this.config, ingestionDeps, {
                            INGESTION_CONSUMER_CONSUME_TOPIC: consumerOption.topic,
                            INGESTION_CONSUMER_GROUP_ID: consumerOption.group_id,
                        })
                        await consumer.start()
                        return consumer.service
                    })
                }
            } else {
                // Production ingestion-v2: single consumer using config-provided topic
                serviceLoaders.push(async () => {
                    const consumer = new IngestionConsumer(this.config, ingestionDeps)
                    await consumer.start()
                    return consumer.service
                })
            }
        }

        // ServerCommands is always created
        serviceLoaders.push(() => {
            const serverCommands = new ServerCommands(this.pubsub!)
            this.expressApp.use('/', serverCommands.router())
            return Promise.resolve(serverCommands.service)
        })

        const readyServices = await Promise.all(serviceLoaders.map((loader) => loader()))
        this.services.push(...readyServices)
    }

    protected getCleanupResources(): CleanupResources {
        return {
            kafkaProducers: [this.kafkaProducer, this.kafkaMetricsProducer].filter(Boolean) as KafkaProducerWrapper[],
            redisPools: [this.redisPool, this.cookielessRedisPool].filter(Boolean) as RedisPool[],
            postgres: this.postgres,
            pubsub: this.pubsub,
            cookielessManager: this.cookielessManager,
        }
    }
}
