import { actions, afterMount, kea, listeners, path, reducers } from 'kea'
import { loaders } from 'kea-loaders'

import api from 'lib/api'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
import { teamLogic } from 'scenes/teamLogic'

import type { snippetVersionPinLogicType } from './snippetVersionPinLogicType'

export interface VersionPinResponse {
    snippet_version_pin: string | null
    resolved_version: string | null
}

export const snippetVersionPinLogic = kea<snippetVersionPinLogicType>([
    path(['scenes', 'settings', 'environment', 'snippetVersionPinLogic']),
    actions({
        setLocalPin: (localPin: string) => ({ localPin }),
    }),
    loaders(({ actions }) => ({
        versionPinResponse: [
            null as VersionPinResponse | null,
            {
                loadVersionPin: async () => {
                    const teamId = teamLogic.values.currentTeamId
                    if (!teamId) {
                        return null
                    }
                    return await api.get(`api/projects/${teamId}/snippet/version`)
                },
                saveVersionPin: async ({ pin }: { pin: string | null }) => {
                    const teamId = teamLogic.values.currentTeamId
                    if (!teamId) {
                        return null
                    }
                    const response = await api.update(`api/projects/${teamId}/snippet/version`, {
                        snippet_version_pin: pin,
                    })
                    lemonToast.success('Snippet version updated')
                    actions.setLocalPin(response.snippet_version_pin ?? '')
                    return response
                },
            },
        ],
    })),
    reducers({
        localPin: [
            '' as string,
            {
                setLocalPin: (_, { localPin }) => localPin,
                loadVersionPinSuccess: (_, { versionPinResponse }) => versionPinResponse?.snippet_version_pin ?? '',
            },
        ],
    }),
    listeners(() => ({
        saveVersionPinFailure: ({ error }) => {
            lemonToast.error(error || 'Failed to update version')
        },
    })),
    afterMount(({ actions }) => {
        actions.loadVersionPin()
    }),
])
