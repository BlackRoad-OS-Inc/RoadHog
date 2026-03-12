import * as React from 'react'

import { Separator } from '@posthog/ui-primitives'
import { borderRadius, semanticColors, shadow, spacing } from '@posthog/ui-tokens'
import type { SemanticColorKey } from '@posthog/ui-tokens'

// ── Colors ────────────────────────────────────────────

function ColorSwatch({ name, light, dark }: { name: string; light: string; dark: string }): React.ReactElement {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex h-16 overflow-hidden rounded-lg border border-border">
                <div className="flex-1" style={{ backgroundColor: light }} title={`Light: ${light}`} />
                <div className="flex-1" style={{ backgroundColor: dark }} title={`Dark: ${dark}`} />
            </div>
            <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="font-mono text-xs text-muted-foreground">{light}</p>
            </div>
        </div>
    )
}

function ColorsSection(): React.ReactElement {
    const entries = Object.entries(semanticColors) as [SemanticColorKey, readonly [string, string]][]

    return (
        <section>
            <h2 id="colors" className="mb-2 text-2xl font-semibold">
                Colors
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
                Semantic color tokens. Each swatch shows light (left) and dark (right) values.
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {entries.map(([name, [light, dark]]) => (
                    <ColorSwatch key={name} name={name} light={light} dark={dark} />
                ))}
            </div>
        </section>
    )
}

// ── Spacing ───────────────────────────────────────────

function SpacingSection(): React.ReactElement {
    const entries = Object.entries(spacing)

    return (
        <section>
            <h2 id="spacing" className="mb-2 text-2xl font-semibold">
                Spacing
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">Spacing scale used for padding, margin, and gaps.</p>
            <div className="flex flex-col gap-3">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-4">
                        <span className="w-8 text-right font-mono text-sm text-muted-foreground">{key}</span>
                        <div className="h-4 rounded-sm bg-primary" style={{ width: value }} />
                        <span className="font-mono text-xs text-muted-foreground">{value}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ── Border radius ─────────────────────────────────────

function BorderRadiusSection(): React.ReactElement {
    const entries = Object.entries(borderRadius)

    return (
        <section>
            <h2 id="border-radius" className="mb-2 text-2xl font-semibold">
                Border radius
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">Radius tokens for rounded corners.</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex flex-col items-center gap-2">
                        <div
                            className="flex h-20 w-20 items-center justify-center border-2 border-primary bg-primary/10"
                            style={{ borderRadius: value }}
                        />
                        <div className="text-center">
                            <p className="text-sm font-medium">{key}</p>
                            <p className="font-mono text-xs text-muted-foreground">{value}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ── Shadows ───────────────────────────────────────────

function ShadowsSection(): React.ReactElement {
    const entries = Object.entries(shadow)

    return (
        <section>
            <h2 id="shadows" className="mb-2 text-2xl font-semibold">
                Shadows
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">Elevation shadow tokens.</p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex flex-col items-center gap-3">
                        <div
                            className="flex h-24 w-full items-center justify-center rounded-lg border border-border bg-card"
                            style={{ boxShadow: value }}
                        />
                        <div className="text-center">
                            <p className="text-sm font-medium">{key}</p>
                            <p className="max-w-48 font-mono text-xs text-muted-foreground">{value}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ── Page ──────────────────────────────────────────────

export function TokensPage(): React.ReactElement {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Tokens</h1>
                <p className="mt-2 text-lg text-muted-foreground">
                    Design tokens for colors, spacing, border radius, and shadows.
                </p>
            </div>

            <Separator />
            <ColorsSection />
            <Separator />
            <SpacingSection />
            <Separator />
            <BorderRadiusSection />
            <Separator />
            <ShadowsSection />
        </div>
    )
}
