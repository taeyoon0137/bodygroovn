import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, transformWithOxc } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { version } = require('./package.json')

function copyCsInterface() {
  return {
    name: 'copy-csinterface',
    async writeBundle(options) {
      const outputDirectory = path.resolve(projectRoot, options.dir || 'build')
      const destinationDirectory = path.join(outputDirectory, 'lib', 'CSInterface')
      await mkdir(destinationDirectory, { recursive: true })
      await copyFile(
        path.join(projectRoot, 'lib', 'CSInterface', 'CSInterface.js'),
        path.join(destinationDirectory, 'CSInterface.js'),
      )
    },
  }
}

function transformJavaScriptJsx() {
  return {
    enforce: 'pre',
    name: 'transform-javascript-jsx',
    async transform(code, id) {
      const file = id.split('?', 1)[0]
      if (!file.includes('/src/') || !file.endsWith('.js') || /\/src\/(?:bodymovin|lottie)\.js$/.test(file)) {
        return null
      }

      return transformWithOxc(code, file, {
        jsx: {
          runtime: 'automatic',
        },
        lang: 'jsx',
        sourcemap: true,
      })
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __BODYGROOVN_VERSION__: JSON.stringify(version),
  },
  build: {
    emptyOutDir: true,
    outDir: 'build',
    rolldownOptions: {
      moduleTypes: {
        '.js': 'jsx',
      },
    },
    target: 'chrome99',
  },
  plugins: [
    transformJavaScriptJsx(),
    copyCsInterface(),
    react({
      include: /\.(js|jsx)$/,
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
})
