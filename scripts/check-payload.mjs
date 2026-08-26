import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const payloadRoot = path.resolve(process.argv[2] || path.join(projectRoot, 'build', 'bodygroovn'))
const manifestPath = path.resolve(
  process.env.BODYGROOVN_PAYLOAD_MANIFEST || path.join(projectRoot, 'build', 'unsigned-payload-manifest.json'),
)
const forbiddenNames = new Set(['.debug', '.DS_Store', '__MACOSX', 'node_modules', 'package-lock.json'])
const forbiddenExtensions = new Set(['.map', '.p12', '.pem', '.key', '.exe', '.dll', '.dylib', '.so'])

async function inventory(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const stats = await lstat(absolutePath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Production payload contains a symlink: ${relativePath}`)
    }
    if (forbiddenNames.has(entry.name)) {
      throw new Error(`Production payload contains forbidden entry: ${relativePath}`)
    }
    if (entry.isDirectory()) {
      files.push(...await inventory(absolutePath, relativePath))
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`Production payload contains unsupported entry: ${relativePath}`)
    }
    if (forbiddenExtensions.has(path.extname(entry.name).toLowerCase()) || /^node(?:\.exe)?$/i.test(entry.name)) {
      throw new Error(`Production payload contains forbidden binary or secret: ${relativePath}`)
    }
    const contents = await readFile(absolutePath)
    files.push({
      path: relativePath,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
  }
  return files
}

function assertExactChildren(files, directory, expected) {
  const prefix = `${directory}/`
  const actual = files
    .map((file) => file.path)
    .filter((filePath) => filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes('/'))
    .map((filePath) => filePath.slice(prefix.length))
    .sort()
  const target = [...expected].sort()
  if (actual.join('\n') !== target.join('\n')) {
    throw new Error(`${directory} inventory mismatch\nexpected: ${target.join(', ')}\nactual: ${actual.join(', ')}`)
  }
}

const files = await inventory(payloadRoot)
assertExactChildren(files, 'assets/player', ['demo.html', 'lottie.js', 'lottie.js.gz', 'standalone.js'])
assertExactChildren(files, 'lib/CSInterface', ['CSInterface.js'])
assertExactChildren(files, 'server', ['main.js', 'package.json', 'pngWorker.js'])

for (const required of [
  'CSXS/manifest.xml',
  'index.html',
  'jsx/hostscript.jsx',
  'assets/player/demo.html',
  'assets/player/lottie.js',
  'assets/player/lottie.js.gz',
  'assets/player/standalone.js',
  'lib/CSInterface/CSInterface.js',
  'server/main.js',
  'server/pngWorker.js',
]) {
  if (!files.some((file) => file.path === required)) {
    throw new Error(`Production payload is missing ${required}`)
  }
}

const [packageJson, productionManifest, builtIndex] = await Promise.all([
  readFile(path.join(projectRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(payloadRoot, 'CSXS', 'manifest.xml'), 'utf8'),
  readFile(path.join(payloadRoot, 'index.html'), 'utf8'),
])
if (!productionManifest.includes('<MainPath>./index.html</MainPath>') || productionManifest.includes('127.0.0.1:3000')) {
  throw new Error('Production manifest MainPath is not ./index.html')
}
const csInterfacePosition = builtIndex.indexOf('./lib/CSInterface/CSInterface.js')
const modulePosition = builtIndex.indexOf('type="module"')
if (csInterfacePosition === -1 || modulePosition === -1 || csInterfacePosition > modulePosition) {
  throw new Error('CSInterface.js must load as a classic script before the Vite module')
}

const [playerInput, payloadPlayer, standalonePlayer, compressedPlayer, demoTemplate, builtDemo] = await Promise.all([
  readFile(path.join(projectRoot, 'player', 'lottie.min.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'lottie.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'standalone.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'lottie.js.gz')),
  readFile(path.join(projectRoot, 'bundle', 'assets', 'player', 'demo.html'), 'utf8'),
  readFile(path.join(payloadRoot, 'assets', 'player', 'demo.html'), 'utf8'),
])
if (!payloadPlayer.equals(playerInput) || !standalonePlayer.equals(playerInput)) {
  throw new Error('Player payload files do not match player/lottie.min.js')
}
if (!gunzipSync(compressedPlayer).equals(playerInput)
  || !compressedPlayer.subarray(4, 8).equals(Buffer.alloc(4))
  || compressedPlayer[9] !== 255) {
  throw new Error('lottie.js.gz content or fixed gzip metadata is invalid')
}
const marker = /<!-- build:scripto --><script>[\s\S]*?<\/script><!-- endbuild -->/
const expectedDemo = demoTemplate.replace(marker, `<!-- build:scripto --><script>${playerInput.toString('utf8')}</script><!-- endbuild -->`)
if (builtDemo !== expectedDemo) {
  throw new Error('demo.html was not generated at the fixed player marker')
}

const payloadManifest = {
  schemaVersion: 1,
  package: {
    name: packageJson.name,
    version: packageJson.version,
  },
  files,
}
await writeFile(manifestPath, `${JSON.stringify(payloadManifest, null, 2)}\n`, 'utf8')
console.log(`Verified ${files.length} payload files and wrote ${manifestPath}.`)
