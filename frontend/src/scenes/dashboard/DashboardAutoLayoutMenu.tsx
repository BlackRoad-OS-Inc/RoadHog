import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

interface DashboardAutoLayoutMenuProps {
    currentLayoutSize: string
    autoLayoutTiles: (columns: 1 | 2 | 3) => void
}

export function DashboardAutoLayoutMenu({
    currentLayoutSize,
    autoLayoutTiles,
}: DashboardAutoLayoutMenuProps): JSX.Element {
    return (
        <LemonMenu
            items={[
                {
                    label: '1 column',
                    'data-attr': 'dashboard-auto-layout-1-col',
                    onClick: () => {
                        autoLayoutTiles(1)
                    },
                },
                {
                    label: '2 columns',
                    'data-attr': 'dashboard-auto-layout-2-col',
                    onClick: () => {
                        autoLayoutTiles(2)
                    },
                },
                {
                    label: '3 columns',
                    'data-attr': 'dashboard-auto-layout-3-col',
                    onClick: () => {
                        autoLayoutTiles(3)
                    },
                },
            ]}
            placement="bottom-end"
            fallbackPlacements={['bottom-start', 'bottom']}
        >
            <LemonButton
                type="secondary"
                data-attr="dashboard-auto-layout-button"
                disabledReason={
                    currentLayoutSize === 'xs' ? 'Layout editing is disabled on smaller screens.' : undefined
                }
                size="small"
            >
                Auto layout
            </LemonButton>
        </LemonMenu>
    )
}
