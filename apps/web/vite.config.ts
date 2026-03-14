import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = new URL('../..', import.meta.url)

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
  }
})
