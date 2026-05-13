import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = new URL('../..', import.meta.url)
const packagesDir = fileURLToPath(new URL('packages/', root))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@arduconfig/transport': fileURLToPath(new URL('packages/transport/src/index.ts', root)),
      '@arduconfig/protocol-mavlink': fileURLToPath(new URL('packages/protocol-mavlink/src/index.ts', root)),
      '@arduconfig/ardupilot-core': fileURLToPath(new URL('packages/ardupilot-core/src/index.ts', root)),
      '@arduconfig/param-metadata': fileURLToPath(new URL('packages/param-metadata/src/index.ts', root)),
      '@arduconfig/ui-kit': fileURLToPath(new URL('packages/ui-kit/src/index.tsx', root))
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Workspace packages are aliased to their source under packages/<name>/src,
          // so split them by directory rather than by node_modules name.
          if (id.startsWith(packagesDir)) {
            const rest = id.slice(packagesDir.length)
            const pkg = rest.slice(0, rest.indexOf('/'))
            if (pkg === 'protocol-mavlink' || pkg === 'transport' || pkg === 'ardupilot-core') {
              return 'runtime'
            }
            if (pkg === 'param-metadata') {
              return 'param-metadata'
            }
          }
          if (id.includes('/node_modules/')) {
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor'
            }
            if (id.includes('/node_modules/three/')) {
              // Pull the GLTF/utility surface in examples/jsm out of the core
              // three.module.js bundle so the renderer/math core lands in its own chunk.
              if (id.includes('/node_modules/three/examples/')) {
                return 'three-examples'
              }
              return 'three-vendor'
            }
          }
          return undefined
        }
      }
    }
  }
})
