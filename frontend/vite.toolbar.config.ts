import { resolve } from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

import { toolbarModuleReplacementPlugin } from './vite-toolbar-plugin'

// Inject `var define = undefined;` inside the IIFE scope after minification.
// This shadows the global AMD `define` so libraries that check `typeof define !== 'undefined' && define.amd`
// won't try to register as AMD modules. We can't use Rollup's `intro` because esbuild's minifier
// strips it as "dead code" (not realizing it shadows a global).
function neutralizeAmdDefinePlugin(): Plugin {
    return {
        name: 'neutralize-amd-define',
        enforce: 'post',
        generateBundle(_options, bundle) {
            for (const chunk of Object.values(bundle)) {
                if (chunk.type === 'chunk' && chunk.fileName === 'toolbar.js') {
                    // Insert after the IIFE opening and "use strict" directive
                    chunk.code = chunk.code.replace(/^(\(function\(\)\s*\{(?:"use strict";)?)/, '$1var define=void 0;')
                }
            }
        },
    }
}

const __dirname = resolve(import.meta.dirname)

// Separate Vite config for building the toolbar as a standalone IIFE bundle.
// The toolbar is loaded on customer websites via posthog-js, so it must be
// self-contained and cannot use Vite's dev module system.
export default defineConfig(({ mode }) => {
    const isDev = mode === 'development'

    return {
        plugins: [toolbarModuleReplacementPlugin(__dirname), neutralizeAmdDefinePlugin()],
        resolve: {
            alias: {
                '~': resolve(__dirname, 'src'),
                '@': resolve(__dirname, 'src'),
                lib: resolve(__dirname, 'src/lib'),
                scenes: resolve(__dirname, 'src/scenes'),
                queries: resolve(__dirname, 'src/queries'),
                layout: resolve(__dirname, 'src/layout'),
                toolbar: resolve(__dirname, 'src/toolbar'),
                taxonomy: resolve(__dirname, 'src/taxonomy'),
                models: resolve(__dirname, 'src/models'),
                exporter: resolve(__dirname, 'src/exporter'),
                types: resolve(__dirname, 'src/types.ts'),
                '@posthog/lemon-ui': resolve(__dirname, '@posthog/lemon-ui/src/index'),
                '@posthog/lemon-ui/': resolve(__dirname, '@posthog/lemon-ui/src/'),
                public: resolve(__dirname, 'src/assets'),
                products: resolve(__dirname, '../products'),
                '@posthog/shared-onboarding': resolve(__dirname, '../docs/onboarding'),
                buffer: resolve(__dirname, 'node_modules/buffer/index.js'),
            },
        },
        build: {
            outDir: 'dist',
            emptyOutDir: false,
            sourcemap: true,
            minify: !isDev,
            watch: isDev ? {} : null,
            rollupOptions: {
                // Don't fail on missing named exports (e.g. icons not yet published)
                shimMissingExports: true,
                input: resolve(__dirname, 'src/toolbar/index.tsx'),
                output: {
                    format: 'iife',
                    name: 'posthogToolbar',
                    entryFileNames: 'toolbar.js',
                    assetFileNames: 'assets/[name]-[hash].[ext]',
                    // Inline all dynamic imports since IIFE can't do code splitting
                    inlineDynamicImports: true,
                },
            },
        },
        define: {
            global: 'globalThis',
            'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
        },
        // Experimental: use the base Vite public path for asset URLs
        base: isDev ? '/static/' : 'https://us.posthog.com/static/',
    }
})
