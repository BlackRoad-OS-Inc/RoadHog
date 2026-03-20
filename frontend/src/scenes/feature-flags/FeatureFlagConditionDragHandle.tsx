import { DraggableSyntheticListeners } from '@dnd-kit/core'

import { SortableDragIcon } from 'lib/lemon-ui/icons'

interface FeatureFlagConditionDragHandleProps {
    listeners: DraggableSyntheticListeners | undefined
    attributes: Record<string, any>
    setActivatorNodeRef: (element: HTMLElement | null) => void
    hasMultipleConditions: boolean
}

const DragHandle = ({
    listeners,
    attributes,
    setActivatorNodeRef,
}: {
    listeners: DraggableSyntheticListeners | undefined
    attributes: Record<string, any>
    setActivatorNodeRef: (element: HTMLElement | null) => void
}): JSX.Element => (
    <button
        type="button"
        ref={setActivatorNodeRef}
        className="FeatureFlagConditionDragHandle cursor-grab active:cursor-grabbing text-muted hover:text-default transition-colors border-none bg-transparent p-1 hover:bg-bg-dark rounded"
        aria-label="Reorder condition"
        {...listeners}
        {...attributes}
        data-attr="feature-flag-condition-drag-handle"
    >
        <SortableDragIcon />
    </button>
)

export function FeatureFlagConditionDragHandle({
    listeners,
    attributes,
    setActivatorNodeRef,
    hasMultipleConditions,
}: FeatureFlagConditionDragHandleProps): JSX.Element | null {
    if (!hasMultipleConditions) {
        return null
    }

    return <DragHandle listeners={listeners} attributes={attributes} setActivatorNodeRef={setActivatorNodeRef} />
}
