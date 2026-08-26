import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const { version } = require('./package.json')

export default defineConfig({
  define: {
    __BODYGROOVN_VERSION__: JSON.stringify(version),
  },
  oxc: {
    exclude: /node_modules/,
    include: /\.(js|jsx)$/,
    lang: 'jsx',
    jsx: {
      runtime: 'automatic',
    },
  },
  plugins: [
    react({
      include: /\.(js|jsx)$/,
    }),
  ],
  test: {
    environment: 'happy-dom',
    globals: true,
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'test/contracts/**/*.{test,spec}.{js,jsx}',
    ],
  },
})
