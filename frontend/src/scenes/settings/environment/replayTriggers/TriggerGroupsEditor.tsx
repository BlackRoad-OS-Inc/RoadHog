import { useValues, useActions } from 'kea'
import { useState, useEffect } from 'react'

import { IconPlus, IconTrash } from '@posthog/icons'
import { LemonButton, LemonInput, LemonLabel, LemonSelect, LemonBanner, LemonSnack } from '@posthog/lemon-ui'

import { FlagSelector } from 'lib/components/FlagSelector'
import { EventTriggerSelect } from 'lib/components/IngestionControls/triggers/EventTrigger'
import { SESSION_REPLAY_MINIMUM_DURATION_OPTIONS } from 'lib/constants'
import { teamLogic } from 'scenes/teamLogic'

import { SessionRecordingTriggerGroup, UrlTriggerConfig } from '~/lib/components/IngestionControls/types'

import { replayTriggersV2Logic } from './replayTriggersV2Logic'
import { TriggerGroupCard } from './TriggerGroupCard'

export function TriggerGroupsEditor(): JSX.Element {
    const { triggerGroups } = useValues(replayTriggersV2Logic)
    const { addTriggerGroup, updateTriggerGroup, deleteTriggerGroup, setTriggerGroupsConfig } =
        useActions(replayTriggersV2Logic)
    const { currentTeam } = useValues(teamLogic)
    const [isAddingGroup, setIsAddingGroup] = useState(false)
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

    // Load config from currentTeam on mount
    useEffect(() => {
        if (currentTeam?.session_recording_trigger_groups) {
            setTriggerGroupsConfig(currentTeam.session_recording_trigger_groups)
        }
    }, [currentTeam?.session_recording_trigger_groups, setTriggerGroupsConfig])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold mb-1">Trigger Groups</h3>
                    <p className="text-muted text-sm">
                        Define multiple trigger groups with different sampling rates and conditions.
                    </p>
                </div>
                {!isAddingGroup && !editingGroupId && (
                    <LemonButton type="primary" icon={<IconPlus />} onClick={() => setIsAddingGroup(true)}>
                        Add Group
                    </LemonButton>
                )}
            </div>

            {isAddingGroup && (
                <GroupForm
                    onSave={(group) => {
                        addTriggerGroup(group)
                        setIsAddingGroup(false)
                    }}
                    onCancel={() => setIsAddingGroup(false)}
                />
            )}

            {triggerGroups.length === 0 && !isAddingGroup ? (
                <div className="border border-dashed rounded p-6 text-center text-muted">
                    <p>No trigger groups configured.</p>
                    <p className="text-xs mt-2">Add a group to start recording based on specific conditions.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {triggerGroups.map((group: SessionRecordingTriggerGroup) =>
                        editingGroupId === group.id ? (
                            <GroupForm
                                key={group.id}
                                group={group}
                                onSave={(updatedGroup) => {
                                    updateTriggerGroup(updatedGroup.id, updatedGroup)
                                    setEditingGroupId(null)
                                }}
                                onCancel={() => setEditingGroupId(null)}
                            />
                        ) : (
                            <TriggerGroupCard
                                key={group.id}
                                group={group}
                                onEdit={() => setEditingGroupId(group.id)}
                                onDelete={deleteTriggerGroup}
                            />
                        )
                    )}
                </div>
            )}
        </div>
    )
}

interface GroupFormProps {
    group?: SessionRecordingTriggerGroup
    onSave: (group: SessionRecordingTriggerGroup) => void
    onCancel: () => void
}

function GroupForm({ group, onSave, onCancel }: GroupFormProps): JSX.Element {
    const { triggerGroups } = useValues(replayTriggersV2Logic)
    const isEditing = !!group

    const [name, setName] = useState(group?.name || '')
    const [sampleRate, setSampleRate] = useState(Math.round((group?.sampleRate || 1) * 100))
    const [minDurationMs, setMinDurationMs] = useState<number | null>(group?.minDurationMs ?? null)
    const [matchType, setMatchType] = useState<'any' | 'all'>(group?.conditions.matchType || 'any')
    const [events, setEvents] = useState<string[]>(group?.conditions.events || [])
    const [urls, setUrls] = useState<UrlTriggerConfig[]>(group?.conditions.urls || [])
    const [flag, setFlag] = useState<string | null>(
        group?.conditions.flag
            ? typeof group.conditions.flag === 'string'
                ? group.conditions.flag
                : group.conditions.flag.key
            : null
    )

    const [isAddingUrl, setIsAddingUrl] = useState(false)
    const [newUrl, setNewUrl] = useState('')

    const handleSave = (): void => {
        const savedGroup: SessionRecordingTriggerGroup = {
            id: group?.id || `group-${Date.now()}`,
            name: name.trim() || (isEditing ? group!.name : `Group ${triggerGroups.length + 1}`),
            sampleRate: sampleRate / 100,
            minDurationMs: minDurationMs ?? undefined,
            conditions: {
                matchType,
                events: events.length > 0 ? events : undefined,
                urls: urls.length > 0 ? urls : undefined,
                flag: flag || undefined,
            },
        }
        onSave(savedGroup)
    }

    const removeEvent = (event: string): void => {
        setEvents(events.filter((e) => e !== event))
    }

    const addUrl = (): void => {
        if (newUrl.trim() && !urls.find((u) => u.url === newUrl.trim())) {
            setUrls([...urls, { url: newUrl.trim(), matching: 'regex' }])
            setNewUrl('')
            setIsAddingUrl(false)
        }
    }

    const removeUrl = (url: string): void => {
        setUrls(urls.filter((u) => u.url !== url))
    }

    const addFlag = (_id: number, key: string): void => {
        setFlag(key)
    }

    const removeFlag = (): void => {
        setFlag(null)
    }

    return (
        <div className="border rounded p-4 bg-bg-light space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold">{isEditing ? 'Edit' : 'New'} Trigger Group</h4>
            </div>

            <div className="space-y-4">
                <div>
                    <LemonLabel>Group name (optional)</LemonLabel>
                    <LemonInput
                        value={name}
                        onChange={setName}
                        placeholder="e.g., Error Tracking, Feature Testing"
                        fullWidth
                    />
                </div>

                <div className="flex gap-4">
                    <div className="flex-1">
                        <LemonLabel>Sample rate (%)</LemonLabel>
                        <LemonInput
                            type="number"
                            value={sampleRate}
                            onChange={(value) => setSampleRate(Number(value))}
                            min={0}
                            max={100}
                            fullWidth
                        />
                    </div>

                    <div className="flex-1">
                        <LemonLabel>Minimum duration (seconds)</LemonLabel>
                        <LemonSelect
                            value={minDurationMs}
                            onChange={setMinDurationMs}
                            options={SESSION_REPLAY_MINIMUM_DURATION_OPTIONS}
                            fullWidth
                        />
                    </div>
                </div>

                <div>
                    <LemonLabel>Match type</LemonLabel>
                    <LemonSelect
                        value={matchType}
                        onChange={(value) => setMatchType(value as 'any' | 'all')}
                        options={[
                            { value: 'any', label: 'ANY condition matches' },
                            { value: 'all', label: 'ALL conditions match' },
                        ]}
                        fullWidth
                    />
                </div>

                <div className="border-t pt-3">
                    <h5 className="font-semibold mb-3">Conditions</h5>

                    {/* Events */}
                    <div className="mb-4">
                        <div className="flex items-center gap-2 justify-between mb-2">
                            <LemonLabel>Event triggers</LemonLabel>
                            <EventTriggerSelect events={events} onChange={setEvents} />
                        </div>
                        {events.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {events.map((event) => (
                                    <LemonSnack key={event} onClose={() => removeEvent(event)}>
                                        {event}
                                    </LemonSnack>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* URLs */}
                    <div className="mb-4">
                        <div className="flex items-center gap-2 justify-between mb-2">
                            <LemonLabel>URL patterns (regex)</LemonLabel>
                            <LemonButton
                                type="secondary"
                                size="small"
                                icon={<IconPlus />}
                                onClick={() => setIsAddingUrl(true)}
                            >
                                Add
                            </LemonButton>
                        </div>

                        {isAddingUrl && (
                            <div className="border rounded p-3 bg-bg-3000 mb-2">
                                <LemonBanner type="info" className="text-sm mb-2">
                                    We always wrap the URL regex with anchors to avoid unexpected behavior (if you do
                                    not). This is because <code className="inline">https://example.com/</code> does not
                                    only match the homepage. You'd need{' '}
                                    <code className="inline">^https://example.com/$</code>
                                </LemonBanner>
                                <LemonLabel>Matching regex:</LemonLabel>
                                <div className="flex gap-2 mt-1">
                                    <LemonInput
                                        value={newUrl}
                                        onChange={setNewUrl}
                                        onPressEnter={addUrl}
                                        placeholder="e.g., /checkout/.*, ^https://example.com/page$"
                                        fullWidth
                                        autoFocus
                                    />
                                    <LemonButton type="secondary" onClick={() => setIsAddingUrl(false)}>
                                        Cancel
                                    </LemonButton>
                                    <LemonButton type="primary" onClick={addUrl}>
                                        Save
                                    </LemonButton>
                                </div>
                            </div>
                        )}

                        {urls.length > 0 && (
                            <div className="space-y-2">
                                {urls.map((urlConfig) => (
                                    <div key={urlConfig.url} className="border rounded flex items-center p-2 pl-4">
                                        <span className="flex-1 truncate">
                                            <span className="text-muted text-xs">Matches regex: </span>
                                            <code className="text-sm">{urlConfig.url}</code>
                                        </span>
                                        <LemonButton
                                            icon={<IconTrash />}
                                            size="small"
                                            status="danger"
                                            onClick={() => removeUrl(urlConfig.url)}
                                        >
                                            Remove
                                        </LemonButton>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Feature Flag */}
                    <div className="mb-4">
                        <div className="flex items-center gap-2 justify-between mb-2">
                            <LemonLabel>Feature flag</LemonLabel>
                            {!flag && (
                                <FlagSelector value={undefined} onChange={addFlag} initialButtonLabel="Add flag" />
                            )}
                        </div>
                        {flag && (
                            <div className="flex flex-wrap gap-2">
                                <LemonSnack onClose={removeFlag}>{flag}</LemonSnack>
                            </div>
                        )}
                    </div>

                    {events.length === 0 && urls.length === 0 && !flag && (
                        <p className="text-xs text-muted italic">
                            No conditions added yet. Add at least one event, URL pattern, or feature flag.
                        </p>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
                <LemonButton type="secondary" onClick={onCancel}>
                    Cancel
                </LemonButton>
                <LemonButton type="primary" onClick={handleSave}>
                    {isEditing ? 'Save Changes' : 'Add Group'}
                </LemonButton>
            </div>
        </div>
    )
}
