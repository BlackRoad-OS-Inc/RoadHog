import { useValues } from 'kea'

import { SceneExport } from 'scenes/sceneTypes'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { ProductKey } from '~/queries/schema/schema-general'

import { NodeDetailDetails } from './NodeDetailDetails'
import { NodeDetailHeader } from './NodeDetailHeader'
import { NodeDetailMaterialization } from './NodeDetailMaterialization'
import type { NodeDetailSceneLogicProps } from './nodeDetailSceneLogic'
import { nodeDetailSceneLogic } from './nodeDetailSceneLogic'
import { NodeDetailLineage } from './tabs/NodeDetailLineage'
import { NodeDetailQuery } from './tabs/NodeDetailQuery'

export const scene: SceneExport<NodeDetailSceneLogicProps> = {
    component: NodeDetailScene,
    logic: nodeDetailSceneLogic,
    productKey: ProductKey.DATA_WAREHOUSE_SAVED_QUERY,
    paramsToProps: ({ params: { id } }) => ({ id }),
}

export function NodeDetailScene({ id }: NodeDetailSceneLogicProps): JSX.Element {
    const { node, nodeLoading, showMaterializationSection } = useValues(nodeDetailSceneLogic({ id }))

    return (
        <SceneContent className="pb-16">
            <NodeDetailHeader id={id} />
            {!nodeLoading && node && <NodeDetailDetails id={id} />}
            {!nodeLoading && node && node.type !== 'table' && <NodeDetailQuery id={id} />}
            <NodeDetailLineage id={id} />
            {showMaterializationSection && <NodeDetailMaterialization id={id} />}
        </SceneContent>
    )
}
