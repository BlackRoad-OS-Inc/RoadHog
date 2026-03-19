import bigDecimal from 'js-big-decimal'

import { PluginEvent } from '~/plugin-scaffold'

import { logger } from '../../../utils/logger'
import { ResolvedModelCost } from './providers/types'

const matchProvider = (event: PluginEvent, provider: string): boolean => {
    if (!event.properties) {
        return false
    }

    const { $ai_provider: eventProvider, $ai_model: eventModel } = event.properties
    const normalizedProvider = provider.toLowerCase()
    const normalizedModel = eventModel?.toLowerCase()

    if (eventProvider?.toLowerCase() === normalizedProvider || normalizedModel?.includes(normalizedProvider)) {
        return true
    }

    // Claude models use Anthropic-style token counting regardless of provider (e.g., via Vertex)
    if (normalizedProvider === 'anthropic' && normalizedModel?.startsWith('claude')) {
        return true
    }

    return false
}

const usesInclusiveAnthropicInputTokens = (event: PluginEvent): boolean => {
    if (!event.properties) {
        return false
    }

    const provider = event.properties['$ai_provider']?.toLowerCase()
    const framework = event.properties['$ai_framework']?.toLowerCase()

    // Vercel AI Gateway reports input tokens inclusive of cache read/write tokens.
    return provider === 'gateway' && framework === 'vercel'
}

export const resolveCacheReportingExclusive = (event: PluginEvent): boolean => {
    if (!event.properties) {
        return false
    }

    const explicit = event.properties['$ai_cache_reporting_exclusive']
    if (typeof explicit === 'boolean') {
        return explicit
    }

    if (!matchProvider(event, 'anthropic')) {
        return false
    }

    if (!usesInclusiveAnthropicInputTokens(event)) {
        return true
    }

    const inputTokens = Number(event.properties['$ai_input_tokens'] || 0)
    const cacheReadTokens = Number(event.properties['$ai_cache_read_input_tokens'] || 0)
    const cacheWriteTokens = Number(event.properties['$ai_cache_creation_input_tokens'] || 0)
    return inputTokens < cacheReadTokens + cacheWriteTokens
}

export const calculateInputCost = (event: PluginEvent, cost: ResolvedModelCost): string => {
    if (!event.properties) {
        return '0'
    }

    const exclusive = resolveCacheReportingExclusive(event)
    event.properties['$ai_cache_reporting_exclusive'] = exclusive

    const cacheReadTokens = event.properties['$ai_cache_read_input_tokens'] || 0
    const inputTokens = event.properties['$ai_input_tokens'] || 0

    // Calculate image input cost adjustment if image input tokens and image pricing are present.
    // Image tokens are already included in $ai_input_tokens and priced at prompt_token rate.
    // This adjustment adds the difference: imageTokens * (image_price - prompt_token_price).
    const imageInputTokens = event.properties['$ai_image_input_tokens']
    const hasImageInputTokens = typeof imageInputTokens === 'number' && imageInputTokens > 0
    const hasImageInputPricing = cost.cost.image !== undefined && cost.cost.image > 0
    let imageInputCostAdjustment = '0'

    if (hasImageInputTokens && hasImageInputPricing) {
        const priceDiff = bigDecimal.subtract(cost.cost.image!, cost.cost.prompt_token)
        imageInputCostAdjustment = bigDecimal.multiply(priceDiff, imageInputTokens)
    }

    if (matchProvider(event, 'anthropic')) {
        const cacheWriteTokens = event.properties['$ai_cache_creation_input_tokens'] || 0

        const writeCost =
            cost.cost.cache_write_token !== undefined
                ? bigDecimal.multiply(cost.cost.cache_write_token, cacheWriteTokens)
                : bigDecimal.multiply(bigDecimal.multiply(cost.cost.prompt_token, 1.25), cacheWriteTokens)

        const cacheReadCost =
            cost.cost.cache_read_token !== undefined
                ? bigDecimal.multiply(cost.cost.cache_read_token, cacheReadTokens)
                : bigDecimal.multiply(bigDecimal.multiply(cost.cost.prompt_token, 0.1), cacheReadTokens)

        const totalCacheCost = bigDecimal.add(writeCost, cacheReadCost)
        const uncachedTokens = exclusive
            ? inputTokens
            : bigDecimal.subtract(bigDecimal.subtract(inputTokens, cacheReadTokens), cacheWriteTokens)
        const uncachedCost = bigDecimal.multiply(cost.cost.prompt_token, uncachedTokens)

        const baseCost = bigDecimal.add(totalCacheCost, uncachedCost)
        return bigDecimal.add(baseCost, imageInputCostAdjustment)
    }

    const regularTokens = exclusive ? inputTokens : bigDecimal.subtract(inputTokens, cacheReadTokens)

    let cacheReadCost: string

    if (cost.cost.cache_read_token !== undefined) {
        // Use explicit cache read cost if available
        cacheReadCost = bigDecimal.multiply(cost.cost.cache_read_token, cacheReadTokens)
    } else {
        // Use default multiplier of 0.5 for all providers when cache_read_token is not defined
        const multiplier = 0.5

        if (cacheReadTokens > 0) {
            logger.warn('Using default cache read multiplier for model', {
                multiplier,
                model: cost.model,
                provider: event.properties['$ai_provider'] || 'unknown',
            })
        }

        cacheReadCost = bigDecimal.multiply(bigDecimal.multiply(cost.cost.prompt_token, multiplier), cacheReadTokens)
    }

    const regularCost = bigDecimal.multiply(cost.cost.prompt_token, regularTokens)

    const baseCost = bigDecimal.add(cacheReadCost, regularCost)
    return bigDecimal.add(baseCost, imageInputCostAdjustment)
}
