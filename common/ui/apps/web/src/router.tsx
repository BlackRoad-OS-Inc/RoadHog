import { createBrowserRouter } from 'react-router'

import { DocsLayout } from './layouts/DocsLayout'
import { ComponentPage } from './pages/ComponentPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PrimitivesPage } from './pages/PrimitivesPage'
import { TokensPage } from './pages/TokensPage'
import { registry } from './registry/registry'

export const router = createBrowserRouter([
    {
        element: <DocsLayout />,
        children: [
            { index: true, element: <HomePage /> },
            { path: 'tokens', element: <TokensPage /> },
            { path: 'primitives', element: <PrimitivesPage /> },
            ...registry.map((entry) => ({
                path: `primitives/${entry.slug}`,
                element: <ComponentPage slug={entry.slug} />,
            })),
            { path: '*', element: <NotFoundPage /> },
        ],
    },
])
