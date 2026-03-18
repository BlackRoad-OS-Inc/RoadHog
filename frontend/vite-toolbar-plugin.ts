import { resolve } from 'path'
import type { Plugin } from 'vite'

// Modules replaced with lightweight kea logic shims that satisfy connect() contracts
// without side effects. If the upstream logic adds new connect() values, the shim
// will silently return undefined — keep shims in sync when connect contracts change.
const shimmedModules: Record<string, string> = {
    'scenes/userLogic': 'src/toolbar/shims/userLogic.ts',
    'scenes/organization/membersLogic': 'src/toolbar/shims/membersLogic.ts',
    'scenes/sceneLogic': 'src/toolbar/shims/sceneLogic.ts',
    'scenes/teamLogic': 'src/toolbar/shims/teamLogic.ts',
    'lib/logic/featureFlagLogic': 'src/toolbar/shims/featureFlagLogic.ts',
}

// Modules replaced with an inert proxy that logs access in debug mode
const deniedPaths = [
    '~/lib/hooks/useUploadFiles',
    '~/queries/nodes/InsightViz/InsightViz',
    'lib/hog',
    'lib/api',
    'scenes/activity/explore/EventDetails',
    'scenes/web-analytics/WebAnalyticsDashboard',
    'scenes/session-recordings/player/snapshot-processing/DecompressionWorkerManager.ts',
]

const deniedPatterns = [
    /monaco/,
    /scenes\/insights\/filters\/ActionFilter/,
    /lib\/components\/CodeSnippet/,
    /scenes\/session-recordings\/player/,
    /queries\/schema-guard/,
    /queries\/schema.json/,
    /queries\/QueryEditor\/QueryEditor/,
    /scenes\/billing/,
    /scenes\/data-warehouse/,
    /LineGraph/,
]

const DENIED_MODULE_PREFIX = '\0toolbar-denied:'

/**
 * Vite/Rollup plugin that replaces toolbar imports:
 * - Shimmed modules get swapped for lightweight kea logics (needed by connect())
 * - Denied modules get replaced with an inert proxy
 *
 * This is the Vite equivalent of the esbuild plugin in toolbar-config.mjs.
 */
export function toolbarModuleReplacementPlugin(dirname: string): Plugin {
    return {
        name: 'toolbar-module-replacements',
        enforce: 'pre',
        resolveId(source) {
            const shimFile = shimmedModules[source]
            if (shimFile) {
                return resolve(dirname, shimFile)
            }

            const shouldDeny = deniedPaths.includes(source) || deniedPatterns.some((pattern) => pattern.test(source))
            if (shouldDeny) {
                return DENIED_MODULE_PREFIX + source
            }
        },
        load(id) {
            if (id.startsWith(DENIED_MODULE_PREFIX)) {
                const originalPath = id.slice(DENIED_MODULE_PREFIX.length)
                return {
                    code: `
                        const proxy = new Proxy({}, {
                            get: function(target, prop) {
                                if (prop === 'then') return undefined;
                                if (prop === '__esModule') return false;
                                const shouldLog = window && window.posthog && window.posthog.config && window.posthog.config.debug;
                                if (shouldLog) {
                                    console.warn('[TOOLBAR] Attempted to use denied module:', ${JSON.stringify(originalPath)});
                                }
                                return function() {
                                    return {}
                                }
                            }
                        });
                        export default proxy;
                    `,
                    // Allow `import { foo } from 'denied-module'` to resolve foo from the default export proxy
                    syntheticNamedExports: true,
                }
            }
        },
    }
}
