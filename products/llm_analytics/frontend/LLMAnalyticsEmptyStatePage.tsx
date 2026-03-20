import { IconLlmAnalytics } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'
import { urls } from 'scenes/urls'

import { ProductKey } from '~/queries/schema/schema-general'
import { OnboardingStepKey } from '~/types'

export type LLMAnalyticsEmptyStateVideoPayload = {
    videoUrl?: string
    posterUrl?: string
}

export interface LLMAnalyticsEmptyStatePageProps {
    className?: string
    video?: LLMAnalyticsEmptyStateVideoPayload
}

export function LLMAnalyticsEmptyStatePage({ className, video }: LLMAnalyticsEmptyStatePageProps): JSX.Element {
    return (
        <div className={cn('flex flex-col items-center justify-center max-w-4xl mx-auto py-12 px-6', className)}>
            <div className="flex items-center gap-2 mb-6">
                <IconLlmAnalytics className="w-8 h-8 text-[var(--color-product-llm-analytics-light)]" />
                <h1 className="text-2xl font-bold">LLM analytics</h1>
            </div>

            <p className="text-center text-lg text-muted mb-2 max-w-2xl">
                Monitor your AI and LLM application performance (observability, not AI-powered analytics).
            </p>
            <p className="text-center text-sm text-muted mb-8 max-w-2xl">
                Track costs per model, measure latency and error rates, evaluate output quality, debug traces, and
                understand how users interact with your AI features.
            </p>

            <div className="w-full max-w-3xl rounded-lg overflow-hidden border border-border bg-bg-light mb-8 shadow-sm">
                {video?.videoUrl ? (
                    <video
                        src={video.videoUrl}
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        poster={video.posterUrl}
                        className="w-full aspect-video"
                    />
                ) : (
                    <div className="w-full aspect-video flex flex-col items-center justify-center gap-2 p-8">
                        <p className="text-sm text-muted m-0">Demo video loads when enabled for this experiment.</p>
                        <p className="text-xs text-muted-alt m-0">
                            (Set a feature flag payload with a `videoUrl` to show the tour.)
                        </p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl mb-8">
                <div className="border border-border rounded-lg bg-bg-light p-4">
                    <div className="font-semibold mb-1">Costs and usage</div>
                    <div className="text-sm text-muted">See spend by model, provider, and prompt.</div>
                </div>
                <div className="border border-border rounded-lg bg-bg-light p-4">
                    <div className="font-semibold mb-1">Latency and reliability</div>
                    <div className="text-sm text-muted">Track performance over time and catch errors fast.</div>
                </div>
                <div className="border border-border rounded-lg bg-bg-light p-4">
                    <div className="font-semibold mb-1">Quality and evaluations</div>
                    <div className="text-sm text-muted">Measure output quality and compare prompt changes.</div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                <LemonButton
                    type="primary"
                    size="large"
                    to={urls.onboarding({
                        productKey: ProductKey.LLM_ANALYTICS,
                        stepKey: OnboardingStepKey.INSTALL,
                    })}
                    data-attr="llma-empty-state-setup-cta"
                >
                    Set up LLM analytics
                </LemonButton>
                <LemonButton
                    type="secondary"
                    size="large"
                    to="https://posthog.com/docs/llm-analytics"
                    targetBlank
                    data-attr="llma-empty-state-docs-cta"
                >
                    Read the docs
                </LemonButton>
            </div>

            <p className="text-xs text-muted">Used by 55K+ teams</p>
        </div>
    )
}
