import { useActions, useValues } from 'kea'

import { LemonButton, LemonInput } from '@posthog/lemon-ui'

import { snippetVersionPinLogic } from './snippetVersionPinLogic'

export function SnippetVersionPin(): JSX.Element {
    const { versionPinResponse, versionPinResponseLoading, localPin } = useValues(snippetVersionPinLogic)
    const { saveVersionPin, setLocalPin } = useActions(snippetVersionPinLogic)

    const savedPin = versionPinResponse?.snippet_version_pin ?? ''
    const resolvedVersion = versionPinResponse?.resolved_version
    const hasChanged = (localPin || null) !== (savedPin || null)

    return (
        <div className="space-y-4 max-w-160">
            <div className="flex items-center gap-2">
                <LemonInput
                    className="w-32"
                    value={localPin}
                    onChange={setLocalPin}
                    placeholder="1 (default)"
                    disabled={versionPinResponseLoading}
                />
                <LemonButton
                    type="primary"
                    onClick={() => saveVersionPin({ pin: localPin || null })}
                    disabled={!hasChanged || versionPinResponseLoading}
                    loading={versionPinResponseLoading}
                >
                    Save
                </LemonButton>
            </div>
            {resolvedVersion && (
                <p className="text-muted text-xs">
                    Currently resolves to: <strong>{resolvedVersion}</strong>
                </p>
            )}
            <p className="text-muted text-xs">
                Accepted formats: major version (<code>1</code>), minor version (<code>1.358</code>), or exact version (
                <code>1.358.0</code>).
            </p>
        </div>
    )
}
