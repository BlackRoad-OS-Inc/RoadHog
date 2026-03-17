import { useFeatureFlag } from 'lib/hooks/useFeatureFlag'

import { DashboardPlacement } from '~/types'

import { DashboardAutoLayoutMenu } from './DashboardAutoLayoutMenu'
import { DashboardZoomControl } from './DashboardZoomControl'

interface DashboardLayoutConfigProps {
    canEditDashboard: boolean
    placement: DashboardPlacement
    layoutZoom: number
    setLayoutZoom: (value: number) => void
    currentLayoutSize: string
    autoLayoutTiles: (columns: 1 | 2 | 3) => void
}

export function DashboardLayoutConfig({
    canEditDashboard,
    placement,
    layoutZoom,
    setLayoutZoom,
    currentLayoutSize,
    autoLayoutTiles,
}: DashboardLayoutConfigProps): JSX.Element | null {
    const showDashboardGrid = useFeatureFlag('DASHBOARD_GRID')
    const canShowZoomControl =
        canEditDashboard &&
        [DashboardPlacement.Dashboard, DashboardPlacement.ProjectHomepage, DashboardPlacement.Builtin].includes(
            placement
        )

    return (
        <div className="flex items-center gap-2">
            {canShowZoomControl && <DashboardZoomControl layoutZoom={layoutZoom} setLayoutZoom={setLayoutZoom} />}
            {showDashboardGrid && (
                <DashboardAutoLayoutMenu currentLayoutSize={currentLayoutSize} autoLayoutTiles={autoLayoutTiles} />
            )}
        </div>
    )
}
