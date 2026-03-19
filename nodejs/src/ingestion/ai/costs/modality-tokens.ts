import { PluginEvent, Properties } from '~/plugin-scaffold'

import { aiCostModalityExtractionCounter } from '../metrics'

export interface EventWithProperties extends PluginEvent {
    properties: Properties
}

type OutputTarget = 'output' | 'input'

/**
 * Extract modality-specific token counts from raw provider usage metadata.
 *
 * Supports:
 * - Gemini's candidatesTokensDetails / promptTokensDetails for output/input image token breakdown
 * - OpenAI's completion_tokens_details / prompt_tokens_details for output/input image token breakdown
 * - Various Vercel AI SDK wrapper formats for both providers
 *
 * Removes $ai_usage from properties after extraction.
 */
export const extractModalityTokens = (event: EventWithProperties): EventWithProperties => {
    const usage = event.properties['$ai_usage']

    if (!usage || typeof usage !== 'object') {
        delete event.properties['$ai_usage']
        return event
    }

    try {
        let extractedTokens = false

        // Helper function to extract tokens from Gemini array or object format
        const extractTokensFromDetails = (tokenDetails: unknown, target: OutputTarget = 'output'): void => {
            if (!tokenDetails) {
                return
            }

            const imageKey = target === 'output' ? '$ai_image_output_tokens' : '$ai_image_input_tokens'
            const textKey = target === 'output' ? '$ai_text_output_tokens' : '$ai_text_input_tokens'

            // Array format: [{ modality: "TEXT", tokenCount: 10 }, { modality: "IMAGE", tokenCount: 1290 }]
            // Gemini returns uppercase modality values (TEXT, IMAGE, AUDIO)
            if (Array.isArray(tokenDetails)) {
                for (const detail of tokenDetails) {
                    if (detail && typeof detail === 'object') {
                        const modality = (detail as Record<string, unknown>)['modality']
                        const tokenCount = (detail as Record<string, unknown>)['tokenCount']

                        if (typeof modality === 'string' && typeof tokenCount === 'number') {
                            const modalityLower = modality.toLowerCase()

                            if (modalityLower === 'image' && tokenCount > 0) {
                                event.properties[imageKey] = tokenCount
                                extractedTokens = true
                            }
                            if (modalityLower === 'text') {
                                event.properties[textKey] = tokenCount
                                extractedTokens = true
                            }
                        }
                    }
                }
            }
            // Object format fallback: { textTokens: number, imageTokens: number }
            // Defensive handling in case format changes or for testing
            else if (typeof tokenDetails === 'object') {
                const details = tokenDetails as Record<string, unknown>

                if (typeof details['imageTokens'] === 'number' && details['imageTokens'] > 0) {
                    event.properties[imageKey] = details['imageTokens']
                    extractedTokens = true
                }

                if (typeof details['textTokens'] === 'number') {
                    event.properties[textKey] = details['textTokens']
                    extractedTokens = true
                }
            }
        }

        // Helper to extract image tokens from OpenAI's *_tokens_details format
        // OpenAI returns: { text_tokens: 200, image_tokens: 1300 }
        const extractOpenAITokenDetails = (tokenDetails: unknown, target: OutputTarget): void => {
            if (!tokenDetails || typeof tokenDetails !== 'object') {
                return
            }

            const details = tokenDetails as Record<string, unknown>
            const imageKey = target === 'output' ? '$ai_image_output_tokens' : '$ai_image_input_tokens'
            const textKey = target === 'output' ? '$ai_text_output_tokens' : '$ai_text_input_tokens'

            if (typeof details['image_tokens'] === 'number' && details['image_tokens'] > 0) {
                event.properties[imageKey] = details['image_tokens']
                extractedTokens = true
            }

            if (typeof details['text_tokens'] === 'number') {
                event.properties[textKey] = details['text_tokens']
                extractedTokens = true
            }
        }

        // Helper to extract Gemini output and input token details from a usage-like object
        const extractGeminiTokenDetails = (usageObj: Record<string, unknown>): void => {
            // Output tokens
            const outputDetails = usageObj['candidatesTokensDetails'] ?? usageObj['outputTokenDetails']
            extractTokensFromDetails(outputDetails, 'output')

            // Input tokens
            const inputDetails = usageObj['promptTokensDetails'] ?? usageObj['inputTokenDetails']
            extractTokensFromDetails(inputDetails, 'input')
        }

        // --- Direct Gemini usage metadata ---
        extractGeminiTokenDetails(usage as Record<string, unknown>)

        // --- OpenAI direct usage metadata ---
        // OpenAI reports: { completion_tokens_details: { image_tokens: N }, prompt_tokens_details: { image_tokens: N } }
        const completionDetails = (usage as Record<string, unknown>)['completion_tokens_details']
        extractOpenAITokenDetails(completionDetails, 'output')

        const promptDetails = (usage as Record<string, unknown>)['prompt_tokens_details']
        extractOpenAITokenDetails(promptDetails, 'input')

        // Check for Vercel AI SDK with rawResponse at top level: { rawResponse: { usageMetadata: {...} } }
        // This is the current path when using Vercel AI SDK with Google provider
        const topLevelRawResponse = (usage as Record<string, unknown>)['rawResponse']
        if (topLevelRawResponse && typeof topLevelRawResponse === 'object') {
            const topLevelUsageMetadata = (topLevelRawResponse as Record<string, unknown>)['usageMetadata']
            if (topLevelUsageMetadata && typeof topLevelUsageMetadata === 'object') {
                extractGeminiTokenDetails(topLevelUsageMetadata as Record<string, unknown>)
            }
        }

        // Check for Vercel AI SDK structure: { usage: {...}, providerMetadata: { google: {...} } }
        const providerMetadata = (usage as Record<string, unknown>)['providerMetadata']
        if (providerMetadata && typeof providerMetadata === 'object') {
            const googleMetadata = (providerMetadata as Record<string, unknown>)['google']
            if (googleMetadata && typeof googleMetadata === 'object') {
                extractGeminiTokenDetails(googleMetadata as Record<string, unknown>)
            }

            // Check for Vercel AI SDK with OpenAI provider metadata
            const openaiMetadata = (providerMetadata as Record<string, unknown>)['openai']
            if (openaiMetadata && typeof openaiMetadata === 'object') {
                const openaiCompletionDetails = (openaiMetadata as Record<string, unknown>)['completion_tokens_details']
                extractOpenAITokenDetails(openaiCompletionDetails, 'output')

                const openaiPromptDetails = (openaiMetadata as Record<string, unknown>)['prompt_tokens_details']
                extractOpenAITokenDetails(openaiPromptDetails, 'input')
            }
        }

        // Check for nested rawUsage structure: { rawUsage: { providerMetadata: { google: {...} } } }
        // This happens when the SDK wraps the raw provider response
        const rawUsage = (usage as Record<string, unknown>)['rawUsage']
        if (rawUsage && typeof rawUsage === 'object') {
            const rawProviderMetadata = (rawUsage as Record<string, unknown>)['providerMetadata']
            if (rawProviderMetadata && typeof rawProviderMetadata === 'object') {
                const rawGoogleMetadata = (rawProviderMetadata as Record<string, unknown>)['google']
                if (rawGoogleMetadata && typeof rawGoogleMetadata === 'object') {
                    extractGeminiTokenDetails(rawGoogleMetadata as Record<string, unknown>)
                }

                // Check for OpenAI provider metadata in rawUsage
                const rawOpenaiMetadata = (rawProviderMetadata as Record<string, unknown>)['openai']
                if (rawOpenaiMetadata && typeof rawOpenaiMetadata === 'object') {
                    const rawOpenaiCompletionDetails = (rawOpenaiMetadata as Record<string, unknown>)[
                        'completion_tokens_details'
                    ]
                    extractOpenAITokenDetails(rawOpenaiCompletionDetails, 'output')

                    const rawOpenaiPromptDetails = (rawOpenaiMetadata as Record<string, unknown>)[
                        'prompt_tokens_details'
                    ]
                    extractOpenAITokenDetails(rawOpenaiPromptDetails, 'input')
                }
            }

            // Check for Vercel AI SDK V3 structure: { rawUsage: { usage: { raw: {...} } } }
            // In Vercel AI SDK, Gemini's raw response is at usage.raw.candidatesTokensDetails
            const rawUsageUsage = (rawUsage as Record<string, unknown>)['usage']
            if (rawUsageUsage && typeof rawUsageUsage === 'object') {
                const rawUsageRaw = (rawUsageUsage as Record<string, unknown>)['raw']
                if (rawUsageRaw && typeof rawUsageRaw === 'object') {
                    extractGeminiTokenDetails(rawUsageRaw as Record<string, unknown>)
                }
            }

            // Check for Vercel AI SDK with rawResponse: { rawUsage: { rawResponse: { usageMetadata: {...} } } }
            // This is the path when using Vercel AI SDK with Google provider
            const rawResponse = (rawUsage as Record<string, unknown>)['rawResponse']
            if (rawResponse && typeof rawResponse === 'object') {
                const usageMetadata = (rawResponse as Record<string, unknown>)['usageMetadata']
                if (usageMetadata && typeof usageMetadata === 'object') {
                    extractGeminiTokenDetails(usageMetadata as Record<string, unknown>)
                }
            }
        }

        // Track extraction outcomes for monitoring
        if (extractedTokens) {
            aiCostModalityExtractionCounter.labels({ status: 'extracted' }).inc()
        } else {
            aiCostModalityExtractionCounter.labels({ status: 'no_details' }).inc()
        }
    } finally {
        // CRITICAL: Always delete $ai_usage to prevent it from being stored in ClickHouse
        // This must happen regardless of whether extraction succeeds or fails
        delete event.properties['$ai_usage']
    }

    return event
}
