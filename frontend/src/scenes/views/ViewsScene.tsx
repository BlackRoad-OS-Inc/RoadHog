import { LemonButton } from '@posthog/lemon-ui'

import { AppShortcut } from 'lib/components/AppShortcuts/AppShortcut'
import { keyBinds } from 'lib/components/AppShortcuts/shortcuts'
import { sceneConfigurations } from 'scenes/scenes'
import { Scene, SceneExport } from 'scenes/sceneTypes'
import { urls } from 'scenes/urls'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import { ProductKey } from '~/queries/schema/schema-general'

import { ViewsTab } from '../data-warehouse/scene/ViewsTab'

export const scene: SceneExport = {
    component: ViewsScene,
    productKey: ProductKey.DATA_WAREHOUSE_SAVED_QUERY,
}

export function ViewsScene(): JSX.Element {
    return (
        <SceneContent>
            <SceneTitleSection
                name={sceneConfigurations[Scene.Views].name}
                description={sceneConfigurations[Scene.Views].description}
                resourceType={{
                    type: sceneConfigurations[Scene.Views].iconType || 'default_icon_type',
                }}
                actions={
                    <div className="flex gap-2">
                        <AppShortcut
                            name="NewView"
                            keybind={[keyBinds.new]}
                            intent="New view"
                            interaction="click"
                            scope={Scene.Views}
                        >
                            <LemonButton
                                type="primary"
                                to={urls.sqlEditor()}
                                size="small"
                                tooltip="Create view"
                                data-attr="new-view-button"
                            >
                                Create view
                            </LemonButton>
                        </AppShortcut>
                    </div>
                }
            />
            <ViewsTab />
        </SceneContent>
    )
}
