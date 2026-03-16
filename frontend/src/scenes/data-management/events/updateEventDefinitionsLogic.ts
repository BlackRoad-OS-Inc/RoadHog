import { kea, listeners, path } from 'kea'
import { loaders } from 'kea-loaders'
import { router } from 'kea-router'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'

import type { updateEventDefinitionsLogicType } from './updateEventDefinitionsLogicType'

interface UpdateFromCodeResponse {
    task_id: string
    task_url: string
}

export const updateEventDefinitionsLogic = kea<updateEventDefinitionsLogicType>([
    path(['scenes', 'data-management', 'events', 'updateEventDefinitionsLogic']),

    loaders(() => ({
        updateResult: [
            null as UpdateFromCodeResponse | null,
            {
                updateEventDefinitionsFromCode: async () => {
                    return await api.create('api/projects/@current/event_definitions/update_from_code/')
                },
            },
        ],
    })),

    listeners(({ values }) => ({
        updateEventDefinitionsFromCodeSuccess: () => {
            if (values.updateResult) {
                lemonToast.success('Task created to update event definitions from code', {
                    button: {
                        label: 'View task',
                        action: () => router.actions.push(`/tasks/${values.updateResult!.task_id}`),
                    },
                })
            }
        },
        updateEventDefinitionsFromCodeFailure: ({ error }) => {
            lemonToast.error(
                (error as any)?.detail ||
                    'Failed to start task. Check that you have a GitHub integration and relevant repository configured in Settings.'
            )
        },
    })),
])
