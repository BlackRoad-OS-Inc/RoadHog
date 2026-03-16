import { useActions, useValues } from 'kea'
import { PropsWithChildren, useMemo, useState } from 'react'

import { LemonButton, LemonLabel } from '@posthog/lemon-ui'

import api from 'lib/api'
import { RestrictionScope, useRestrictedArea } from 'lib/components/RestrictedArea'
import { TeamMembershipLevel } from 'lib/constants'
import { GitHubRepositoryPicker } from 'lib/integrations/GitHubIntegrationHelpers'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { IntegrationView } from 'lib/integrations/IntegrationView'
import { GitLabSetupModal } from 'scenes/integrations/gitlab/GitLabSetupModal'
import { relevantRepositoryLogic } from 'scenes/settings/environment/relevantRepositoryLogic'
import { urls } from 'scenes/urls'

import { IntegrationKind, IntegrationType } from '~/types'

export function GitLabIntegration(): JSX.Element {
    const [isOpen, setIsOpen] = useState<boolean>(false)
    return (
        <Integration kind="gitlab">
            <LemonButton type="secondary" onClick={() => setIsOpen(true)}>
                Connect project
            </LemonButton>
            <GitLabSetupModal isOpen={isOpen} onComplete={() => setIsOpen(false)} />
        </Integration>
    )
}

export function LinearIntegration(): JSX.Element {
    return <OAuthIntegration kind="linear" connectText="Connect workspace" />
}

export function GithubIntegration(): JSX.Element {
    return (
        <OAuthIntegration
            kind="github"
            connectText="Connect organization"
            extraContent={<RelevantRepositoryPicker />}
        />
    )
}

export function JiraIntegration(): JSX.Element {
    return <OAuthIntegration kind="jira" connectText="Connect site" />
}

const OAuthIntegration = ({
    kind,
    connectText,
    extraContent,
}: {
    kind: IntegrationKind
    connectText: string
    extraContent?: JSX.Element
}): JSX.Element => {
    const restrictedReason = useRestrictedArea({
        scope: RestrictionScope.Project,
        minimumAccessLevel: TeamMembershipLevel.Admin,
    })
    const authorizationUrl = api.integrations.authorizeUrl({
        next: urls.errorTrackingConfiguration({
            tab: 'error-tracking-integrations',
        }),
        kind,
    })

    return (
        <Integration kind={kind} extraContent={extraContent}>
            <LemonButton
                type="secondary"
                disableClientSideRouting
                to={authorizationUrl}
                disabledReason={restrictedReason}
            >
                {connectText}
            </LemonButton>
        </Integration>
    )
}

const Integration = ({
    kind,
    children,
    extraContent,
}: PropsWithChildren<{ kind: IntegrationKind; extraContent?: JSX.Element }>): JSX.Element => {
    const integrations = useIntegrations(kind)

    return (
        <div className="flex flex-col">
            <div className="flex flex-col gap-y-2">
                {integrations?.map((integration) => (
                    <IntegrationView key={integration.id} integration={integration} />
                ))}
                <div className="flex">{children}</div>
                {integrations.length > 0 && extraContent}
            </div>
        </div>
    )
}

function RelevantRepositoryPicker(): JSX.Element | null {
    const integrations = useIntegrations('github')
    const { selectedRepository } = useValues(relevantRepositoryLogic)
    const { setSelectedRepository } = useActions(relevantRepositoryLogic)

    if (integrations.length === 0) {
        return null
    }

    const integrationId = integrations[0].id

    return (
        <div className="flex flex-col gap-y-1">
            <LemonLabel>Relevant repository</LemonLabel>
            <p className="text-secondary text-xs mb-1">
                Select the repository where your product code lives. This is used by features like auto-updating event
                definitions from code.
            </p>
            <div className="max-w-120">
                <GitHubRepositoryPicker
                    integrationId={integrationId}
                    value={selectedRepository ?? ''}
                    onChange={(value) => setSelectedRepository(value || null)}
                />
            </div>
        </div>
    )
}

const useIntegrations = (kind: IntegrationKind): IntegrationType[] => {
    const { getIntegrationsByKind } = useValues(integrationsLogic)

    return useMemo(() => getIntegrationsByKind([kind] satisfies IntegrationKind[]), [getIntegrationsByKind, kind])
}
