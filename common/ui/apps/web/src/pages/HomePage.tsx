import * as React from 'react'
import { Link } from 'react-router'

const sections = [
    {
        title: 'Tokens',
        description: 'Design tokens for colors, spacing, typography, and other foundational values.',
        to: '/tokens',
    },
    {
        title: 'Primitives',
        description: 'Low-level UI building blocks like buttons, toggles, inputs, and other base components.',
        to: '/primitives',
    },
    {
        title: 'Components',
        description: 'Higher-level components built on top of primitives for easier, more opinionated use.',
        to: '/components',
    },
    {
        title: 'Blocks',
        description: 'Composite patterns combining tokens, primitives, and components into ready-to-use sections.',
        to: '/blocks',
    },
]

export function HomePage(): React.ReactElement {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">PostHog UI</h1>
                <p className="mt-2 text-lg text-muted-foreground">
                    A collection of accessible, composable React components built with Tailwind v4 and Base UI.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                {sections.map((section) => (
                    <Link
                        key={section.title}
                        to={section.to}
                        className="rounded-lg border border-border p-6 transition-colors hover:bg-accent shadow-elevate"
                    >
                        <h3 className="text-lg font-medium">{section.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
