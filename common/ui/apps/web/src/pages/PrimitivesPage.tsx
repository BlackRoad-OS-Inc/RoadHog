import * as React from 'react'

import { Separator } from '@posthog/ui-primitives'

import { registry } from '../registry/registry'

export function PrimitivesPage(): React.ReactElement {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Primitives</h1>
                <p className="mt-2 text-lg text-muted-foreground">All primitive components at a glance.</p>
            </div>

            {registry.map((entry) => (
                <React.Fragment key={entry.slug}>
                    <Separator />
                    <section>
                        <h2 className="mb-4 text-xl font-semibold">{entry.name}</h2>
                        <div className="space-y-6">
                            {entry.examples.map((example) => (
                                <div key={example.name} className="rounded-lg border border-border bg-card p-6">
                                    <React.Suspense
                                        fallback={<div className="text-sm text-muted-foreground">Loading...</div>}
                                    >
                                        <example.component />
                                    </React.Suspense>
                                </div>
                            ))}
                        </div>
                    </section>
                </React.Fragment>
            ))}
        </div>
    )
}
