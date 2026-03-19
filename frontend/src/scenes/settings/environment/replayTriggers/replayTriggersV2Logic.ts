import { actions, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'

import { teamLogic } from 'scenes/teamLogic'

import {
    SessionRecordingTriggerGroup,
    SessionRecordingTriggerGroupsConfig,
} from '~/lib/components/IngestionControls/types'

import type { replayTriggersV2LogicType } from './replayTriggersV2LogicType'

export const replayTriggersV2Logic = kea<replayTriggersV2LogicType>([
    path(['scenes', 'settings', 'environment', 'replayTriggers', 'replayTriggersV2Logic']),
    connect({
        values: [teamLogic, ['currentTeam']],
        actions: [teamLogic, ['updateCurrentTeam']],
    }),
    actions({
        setTriggerGroupsConfig: (config: SessionRecordingTriggerGroupsConfig | null) => ({ config }),
        addTriggerGroup: (group: SessionRecordingTriggerGroup) => ({ group }),
        deleteTriggerGroup: (id: string) => ({ id }),
        updateTriggerGroup: (id: string, updates: Partial<SessionRecordingTriggerGroup>) => ({ id, updates }),
    }),
    loaders(({ values }) => ({
        _loadingState: [
            false,
            {
                saveConfig: async () => {
                    // Save to backend via teamLogic
                    await teamLogic.asyncActions.updateCurrentTeam({
                        session_recording_trigger_groups: values.triggerGroupsConfig,
                    })
                    return true
                },
            },
        ],
    })),
    reducers({
        triggerGroupsConfig: [
            null as SessionRecordingTriggerGroupsConfig | null,
            {
                setTriggerGroupsConfig: (_, { config }) => config,
                addTriggerGroup: (state, { group }) => {
                    if (!state) {
                        // Initialize with new group
                        return {
                            version: 2 as const,
                            groups: [group],
                        }
                    }
                    return {
                        ...state,
                        groups: [...state.groups, group],
                    }
                },
                deleteTriggerGroup: (state, { id }) => {
                    if (!state) {
                        return state
                    }
                    return {
                        ...state,
                        groups: state.groups.filter((g) => g.id !== id),
                    }
                },
                updateTriggerGroup: (state, { id, updates }) => {
                    if (!state) {
                        return state
                    }
                    return {
                        ...state,
                        groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
                    }
                },
            },
        ],
    }),
    selectors({
        triggerGroups: [
            (s) => [s.triggerGroupsConfig],
            (config): SessionRecordingTriggerGroup[] => {
                return config?.groups || []
            },
        ],
        hasV2Config: [
            (s) => [s.triggerGroupsConfig],
            (config): boolean => {
                return config !== null && config.version === 2
            },
        ],
    }),
    listeners(({ actions }) => ({
        addTriggerGroup: () => {
            // Auto-save after adding
            actions.saveConfig()
        },
        deleteTriggerGroup: () => {
            // Auto-save after deleting
            actions.saveConfig()
        },
        updateTriggerGroup: () => {
            // Auto-save after updating
            actions.saveConfig()
        },
    })),
])
