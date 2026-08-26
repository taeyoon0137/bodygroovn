import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { build as viteBuild } from 'vite'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const buildRoot = path.join(projectRoot, 'build')
const payloadRoot = path.join(buildRoot, 'bodygroovn')

function projectPath(...parts) {
  return path.join(projectRoot, ...parts)
}

function runNodeScript(script, ...args) {
  const result = spawnSync(process.execPath, [projectPath('scripts', script), ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`)
  }
}

async function copyTree(source, destination) {
  const entries = await readdir(source, { withFileTypes: true })
  await mkdir(destination, { recursive: true })
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing to copy symlink into payload: ${sourcePath}`)
    }
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      await writeFile(destinationPath, await readFile(sourcePath))
    } else {
      throw new Error(`Unsupported payload source entry: ${sourcePath}`)
    }
  }
}

async function generatePreviewPlayer() {
  const guard = '/* eslint-disable */var define = define || null;'
  const source = await readFile(projectPath('player', 'lottie.js'), 'utf8')
  await writeFile(projectPath('src', 'lottie.js'), `${guard}${source}`, 'utf8')
}

async function buildServerEntry(entryName) {
  await viteBuild({
    build: {
      emptyOutDir: false,
      lib: {
        entry: projectPath('bundle', 'server', `${entryName}.js`),
        fileName: () => `${entryName}.js`,
        formats: ['cjs'],
      },
      minify: false,
      outDir: path.join(payloadRoot, 'server'),
      rolldownOptions: {
        external: [
          'crypto',
          'fs',
          'http',
          'os',
          'path',
          'worker_threads',
          /^node:/,
        ],
        output: {
          codeSplitting: false,
          exports: 'named',
        },
      },
      sourcemap: false,
      target: 'node17',
    },
    configFile: false,
    logLevel: 'info',
    publicDir: false,
    ssr: {
      noExternal: true,
    },
  })
}

async function copyExtensionSources() {
  await Promise.all([
    copyTree(projectPath('bundle', 'jsx'), path.join(payloadRoot, 'jsx')),
    copyTree(projectPath('bundle', 'assets', 'annotations'), path.join(payloadRoot, 'assets', 'annotations')),
    copyTree(projectPath('bundle', 'assets', 'templates'), path.join(payloadRoot, 'assets', 'templates')),
  ])

  const developmentManifest = await readFile(projectPath('bundle', 'CSXS', 'manifest.xml'), 'utf8')
  const developmentMainPath = '<MainPath>http://127.0.0.1:3000/</MainPath>'
  if (developmentManifest.split(developmentMainPath).length !== 2) {
    throw new Error('Development manifest must contain exactly one Vite MainPath')
  }
  const productionManifest = developmentManifest.replace(developmentMainPath, '<MainPath>./index.html</MainPath>')
  await mkdir(path.join(payloadRoot, 'CSXS'), { recursive: true })
  await writeFile(path.join(payloadRoot, 'CSXS', 'manifest.xml'), productionManifest, 'utf8')
}

async function generatePlayerPayload() {
  const playerDirectory = path.join(payloadRoot, 'assets', 'player')
  const minifiedPlayer = await readFile(projectPath('player', 'lottie.min.js'))
  const demoTemplate = await readFile(projectPath('bundle', 'assets', 'player', 'demo.html'), 'utf8')
  const marker = /<!-- build:scripto --><script>[\s\S]*?<\/script><!-- endbuild -->/
  const matches = demoTemplate.match(marker)
  if (!matches || matches.length !== 1) {
    throw new Error('Demo template must contain exactly one player insertion marker')
  }

  await rm(playerDirectory, { recursive: true, force: true })
  await mkdir(playerDirectory, { recursive: true })
  await Promise.all([
    writeFile(path.join(playerDirectory, 'lottie.js'), minifiedPlayer),
    writeFile(path.join(playerDirectory, 'standalone.js'), minifiedPlayer),
    writeFile(
      path.join(playerDirectory, 'demo.html'),
      demoTemplate.replace(marker, `<!-- build:scripto --><script>${minifiedPlayer.toString('utf8')}</script><!-- endbuild -->`),
      'utf8',
    ),
  ])

  const compressed = gzipSync(minifiedPlayer, { level: 9, mtime: 0 })
  compressed.fill(0, 4, 8)
  compressed[9] = 255
  await writeFile(path.join(playerDirectory, 'lottie.js.gz'), compressed)
}

runNodeScript('sync-version.mjs', '--check')
runNodeScript('check-provenance.mjs')
await generatePreviewPlayer()
await rm(buildRoot, { recursive: true, force: true })

await viteBuild({
  build: {
    emptyOutDir: true,
    outDir: payloadRoot,
    sourcemap: false,
  },
  configFile: projectPath('vite.config.mjs'),
})

await copyExtensionSources()
await buildServerEntry('main')
await buildServerEntry('pngWorker')
await writeFile(path.join(payloadRoot, 'server', 'package.json'), '{"private":true,"type":"commonjs"}\n', 'utf8')
await generatePlayerPayload()

const payloadStats = await stat(payloadRoot)
if (!payloadStats.isDirectory()) {
  throw new Error('Production payload was not created')
}

runNodeScript('check-payload.mjs', payloadRoot)
