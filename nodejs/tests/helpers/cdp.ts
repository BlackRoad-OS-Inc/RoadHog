import { CdpConsumerBaseDeps } from '../../src/cdp/consumers/cdp-base.consumer'
import { CdpLegacyEventsConsumerDeps } from '../../src/cdp/consumers/cdp-legacy-event.consumer'
import {
    HogTransformerServiceDeps,
    createHogTransformerService,
} from '../../src/cdp/hog-transformations/hog-transformer.service'
import { IngestionConsumerDeps } from '../../src/ingestion/ingestion-consumer'
import { Hub } from '../../src/types'

export function createCdpConsumerDeps(hub: Hub): CdpConsumerBaseDeps {
    return {
        postgres: hub.postgres,
        pubSub: hub.pubSub,
        encryptedFields: hub.encryptedFields,
        teamManager: hub.teamManager,
        integrationManager: hub.integrationManager,
        kafkaProducer: hub.kafkaProducer,
        internalCaptureService: hub.internalCaptureService,
        personRepository: hub.personRepository,
        geoipService: hub.geoipService,
        groupRepository: hub.groupRepository,
        quotaLimiting: hub.quotaLimiting,
    }
}

export function createCdpLegacyEventsConsumerDeps(hub: Hub): CdpLegacyEventsConsumerDeps {
    return {
        ...createCdpConsumerDeps(hub),
        groupTypeManager: hub.groupTypeManager,
    }
}

export function createHogTransformerDeps(hub: Hub): HogTransformerServiceDeps {
    return {
        geoipService: hub.geoipService,
        postgres: hub.postgres,
        pubSub: hub.pubSub,
        encryptedFields: hub.encryptedFields,
        integrationManager: hub.integrationManager,
        kafkaProducer: hub.kafkaProducer,
        teamManager: hub.teamManager,
        internalCaptureService: hub.internalCaptureService,
    }
}

export function createIngestionConsumerDeps(hub: Hub): IngestionConsumerDeps {
    return {
        postgres: hub.postgres,
        redisPool: hub.redisPool,
        kafkaProducer: hub.kafkaProducer,
        kafkaMetricsProducer: hub.kafkaProducer,
        teamManager: hub.teamManager,
        groupTypeManager: hub.groupTypeManager,
        groupRepository: hub.groupRepository,
        clickhouseGroupRepository: hub.clickhouseGroupRepository,
        personRepository: hub.personRepository,
        cookielessManager: hub.cookielessManager,
        hogTransformer: createHogTransformerService(hub, createHogTransformerDeps(hub)),
    }
}
