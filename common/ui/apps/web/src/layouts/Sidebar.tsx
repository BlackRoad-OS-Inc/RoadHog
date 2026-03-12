import * as React from 'react'
import { NavLink } from 'react-router'

import { cn } from '@posthog/ui-primitives'

function navLinkClass({ isActive }: { isActive: boolean }): string {
    return cn(
        'block rounded-md px-2 py-1 text-sm',
        isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
    )
}

export function Sidebar(): React.ReactElement {
    return (
        <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col overflow-y-auto border-r border-border p-4">
            <NavLink to="/" className="mb-6 text-lg font-semibold">
                PostHog UI
            </NavLink>

            <nav className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <NavLink to="/" end className={navLinkClass}>
                        Overview
                    </NavLink>
                    <NavLink to="/tokens" className={navLinkClass}>
                        Tokens
                        <p className="text-xs text-muted-foreground">
                            Design tokens for colors, spacing, typography, and other foundational values.
                        </p>
                    </NavLink>
                    <NavLink to="/primitives" end className={navLinkClass}>
                        Primitives
                        <p className="text-xs text-muted-foreground">
                            Low-level UI building blocks like buttons, toggles, inputs, and other base components.
                        </p>
                    </NavLink>
                    <NavLink to="/components" className={navLinkClass}>
                        Components
                        <p className="text-xs text-muted-foreground">
                            Higher-level components built on top of primitives for easier, more opinionated use.
                        </p>
                    </NavLink>
                    <NavLink to="/blocks" className={navLinkClass}>
                        Blocks
                        <p className="text-xs text-muted-foreground">
                            Composite patterns combining tokens, primitives, and components into ready-to-use sections.
                        </p>
                    </NavLink>
                </div>
            </nav>
        </aside>
    )
}
