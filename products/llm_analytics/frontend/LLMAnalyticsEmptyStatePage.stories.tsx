import type { Meta, StoryFn } from '@storybook/react'

import { LLMAnalyticsEmptyStatePage } from './LLMAnalyticsEmptyStatePage'

const meta: Meta = {
    title: 'Scenes-App/LLM Analytics/Empty state',
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
    },
}

export default meta

const Template: StoryFn = () => {
    return (
        <div className="p-6">
            <LLMAnalyticsEmptyStatePage />
        </div>
    )
}

export const Default: StoryFn = Template.bind({})

export const WithVideo: StoryFn = () => {
    return (
        <div className="p-6">
            <LLMAnalyticsEmptyStatePage
                video={{
                    // Placeholder asset for storybook; experiment can set the real LLMA demo via flag payload.
                    videoUrl: 'https://res.cloudinary.com/dmukukwp6/video/upload/surveys_overview_2cfc290333.mp4',
                    posterUrl: 'https://res.cloudinary.com/dmukukwp6/image/upload/surveys_522e544094.png',
                }}
            />
        </div>
    )
}
