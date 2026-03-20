import { useActions, useValues } from 'kea'
import { useCallback, useState } from 'react'

import { availableSourcesDataLogic } from 'scenes/data-warehouse/new/availableSourcesDataLogic'
import { InlineSourceSetup } from 'scenes/data-warehouse/new/InlineSourceSetup'

import { OnboardingStepKey } from '~/types'

import { OnboardingStepComponentType, onboardingLogic } from '../onboardingLogic'
import { OnboardingStep } from '../OnboardingStep'

export const OnboardingDataWarehouseSourcesStep: OnboardingStepComponentType = () => {
    const { goToNextStep } = useActions(onboardingLogic)
    const { availableSourcesLoading } = useValues(availableSourcesDataLogic)
    const [hasAddedSources, setHasAddedSources] = useState(false)

    const handleSourceAdded = useCallback(() => {
        setHasAddedSources(true)
    }, [])

    return (
        <OnboardingStep
            title="Connect your data for better insights"
            stepKey={OnboardingStepKey.LINK_DATA}
            showContinue={false}
            showSkip={!availableSourcesLoading && !hasAddedSources}
            subtitle="Link sources like Stripe and Hubspot so you can query them alongside product data to find correlations."
        >
            <InlineSourceSetup
                onComplete={() => goToNextStep()}
                onSourceAdded={handleSourceAdded}
                featured
                title="Choose from 20+ sources"
                subtitle="You can always connect more sources later."
            />
        </OnboardingStep>
    )
}

OnboardingDataWarehouseSourcesStep.stepKey = OnboardingStepKey.LINK_DATA
