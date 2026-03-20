import { useValues } from 'kea'
import { useFeatureFlagPayload, useFeatureFlagVariantKey } from 'posthog-js/react'

import { Spinner } from '@posthog/lemon-ui'

import { ProductIntroduction } from 'lib/components/ProductIntroduction/ProductIntroduction'
import { FEATURE_FLAGS } from 'lib/constants'

import { ProductKey } from '~/queries/schema/schema-general'

import { LLMAnalyticsEmptyStatePage, type LLMAnalyticsEmptyStateVideoPayload } from './LLMAnalyticsEmptyStatePage'
import { llmAnalyticsSharedLogic } from './llmAnalyticsSharedLogic'

type Thing = 'generation' | 'trace'

export function LLMAnalyticsSetupPrompt({
    children,
    className,
    thing = 'generation',
}: {
    children: React.ReactNode
    thing?: Thing
    className?: string
}): JSX.Element {
    const { hasSentAiEvent, hasSentAiEventLoading } = useValues(llmAnalyticsSharedLogic)

    return hasSentAiEventLoading ? (
        <div className="flex justify-center">
            <Spinner />
        </div>
    ) : !hasSentAiEvent ? (
        <IngestionStatusCheck className={className} thing={thing} />
    ) : (
        <>{children}</>
    )
}

function IngestionStatusCheck({ className, thing }: { className?: string; thing: Thing }): JSX.Element {
    const variant = useFeatureFlagVariantKey(FEATURE_FLAGS.LLMA_RICH_EMPTY_STATE)
    const payload = useFeatureFlagPayload(FEATURE_FLAGS.LLMA_RICH_EMPTY_STATE) as LLMAnalyticsEmptyStateVideoPayload

    if (variant === 'test') {
        return <LLMAnalyticsEmptyStatePage className={className} video={payload} />
    }

    return (
        <ProductIntroduction
            productName="LLM analytics"
            thingName={`LLM ${thing}`}
            titleOverride={`No LLM ${thing} events have been detected!`}
            description="To use the LLM Analytics product, please instrument your LLM calls with the PostHog SDK."
            isEmpty={true}
            productKey={ProductKey.LLM_ANALYTICS}
            className={className}
            docsURL="https://posthog.com/docs/llm-analytics/installation"
        />
    )
}
