import { actions, afterMount, kea, listeners, path, reducers } from 'kea'
import { loaders } from 'kea-loaders'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'

import type { relevantRepositoryLogicType } from './relevantRepositoryLogicType'

interface TeamCodeConfig {
    relevant_repositories: string[]
}

export const relevantRepositoryLogic = kea<relevantRepositoryLogicType>([
    path(['scenes', 'settings', 'environment', 'relevantRepositoryLogic']),

    actions({
        setSelectedRepository: (repository: string | null) => ({ repository }),
    }),

    loaders(() => ({
        codeConfig: [
            null as TeamCodeConfig | null,
            {
                loadCodeConfig: async () => {
                    return await api.get('api/projects/@current/code_config/')
                },
                saveCodeConfig: async (repositories: string[]) => {
                    return await api.update('api/projects/@current/code_config/update/', {
                        relevant_repositories: repositories,
                    })
                },
            },
        ],
    })),

    reducers({
        selectedRepository: [
            null as string | null,
            {
                setSelectedRepository: (_, { repository }) => repository,
                loadCodeConfigSuccess: (_, { codeConfig }) => codeConfig?.relevant_repositories?.[0] ?? null,
            },
        ],
    }),

    listeners(({ actions }) => ({
        setSelectedRepository: async ({ repository }) => {
            const repositories = repository ? [repository] : []
            await actions.saveCodeConfig(repositories)
            lemonToast.success('Relevant repository updated')
        },
    })),

    afterMount(({ actions }) => {
        actions.loadCodeConfig()
    }),
])
