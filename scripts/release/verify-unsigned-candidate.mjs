import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {lstat, mkdtemp, readFile, readdir, rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'

import {assertTrustedPayloadInventory} from './trusted-payload-inventory.mjs'

const [directory, runId, runAttempt, repository, pullRequestNumber, baseSha, headSha,
  workflowCommit, expectedActor] = process.argv.slice(2)
const shaPattern = /^[0-9a-f]{40}$/
const projectRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const expectedUnsignedArtifact = `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`
const expectedRootEntries = [
  'bodygroovn-v6.0.0.git.bundle',
  'payload',
  'unsigned-payload-manifest.json',
  'unsigned-release.json',
].sort()
const forbiddenNames = new Set(['.debug', '.DS_Store', '__MACOSX', 'node_modules', 'package-lock.json'])
const forbiddenExtensions = new Set(['.map', '.p12', '.pem', '.key', '.exe', '.dll', '.dylib', '.so'])

if (!directory || !repository
  || !/^[1-9][0-9]*$/.test(`${runId}`)
  || !/^[1-9][0-9]*$/.test(`${runAttempt}`)
  || !/^[1-9][0-9]*$/.test(`${pullRequestNumber}`)
  || !shaPattern.test(baseSha)
  || !shaPattern.test(headSha)
  || !shaPattern.test(workflowCommit)
  || workflowCommit !== baseSha
  || !expectedActor
  || expectedActor.length > 100) {
  throw new Error('Invalid unsigned candidate verification input')
}

const sha256 = value => createHash('sha256').update(value).digest('hex')
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8'}).trim()

const trustedAutomationPaths = (await readFile(
  path.join(projectRoot, 'release', 'trusted-release-automation.txt'),
  'utf8',
)).split(/\r?\n/).filter(Boolean)
if (trustedAutomationPaths.join('\n') !== [...trustedAutomationPaths].sort().join('\n')
  || new Set(trustedAutomationPaths).size !== trustedAutomationPaths.length) {
  throw new Error('Trusted release automation inventory must be sorted and contain no duplicates')
}

async function inventory(payloadRoot, prefix = '') {
  const entries = await readdir(payloadRoot, {withFileTypes: true})
  const files = []
  for (const entry of entries.sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ))) {
    const absolutePath = path.join(payloadRoot, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const stats = await lstat(absolutePath)
    if (stats.isSymbolicLink()) throw new Error(`Unsigned payload contains a symlink: ${relativePath}`)
    if (forbiddenNames.has(entry.name)) throw new Error(`Unsigned payload contains a forbidden entry: ${relativePath}`)
    if (entry.isDirectory()) {
      files.push(...await inventory(absolutePath, relativePath))
      continue
    }
    if (!entry.isFile()) throw new Error(`Unsigned payload contains an unsupported entry: ${relativePath}`)
    if (forbiddenExtensions.has(path.extname(entry.name).toLowerCase()) || /^node(?:\.exe)?$/i.test(entry.name)) {
      throw new Error(`Unsigned payload contains a forbidden binary or secret: ${relativePath}`)
    }
    const contents = await readFile(absolutePath)
    files.push({path: relativePath, bytes: contents.byteLength, sha256: sha256(contents)})
  }
  return files
}

function assertExactChildren(files, directoryName, expected) {
  const prefix = `${directoryName}/`
  const actual = files
    .map(file => file.path)
    .filter(filePath => filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes('/'))
    .map(filePath => filePath.slice(prefix.length))
    .sort()
  if (actual.join('\n') !== [...expected].sort().join('\n')) {
    throw new Error(`${directoryName} inventory mismatch`)
  }
}

const actualRootEntries = (await readdir(directory)).sort()
if (actualRootEntries.join('\n') !== expectedRootEntries.join('\n')) {
  throw new Error(`Unsigned candidate root inventory mismatch: ${actualRootEntries.join(', ')}`)
}
for (const name of expectedRootEntries.filter(name => name !== 'payload')) {
  const stats = await lstat(path.join(directory, name))
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Unsigned candidate entry is not a regular file: ${name}`)
}
const payloadStats = await lstat(path.join(directory, 'payload'))
if (!payloadStats.isDirectory() || payloadStats.isSymbolicLink()) throw new Error('Unsigned payload is not a regular directory')

const [metadata, manifest] = await Promise.all([
  readFile(path.join(directory, 'unsigned-release.json'), 'utf8').then(JSON.parse),
  readFile(path.join(directory, 'unsigned-payload-manifest.json'), 'utf8').then(JSON.parse),
])
if (metadata.schemaVersion !== 1
  || metadata.repository !== repository
  || metadata.workflow?.path !== '.github/workflows/release-candidate.yml'
  || metadata.workflow?.commit !== workflowCommit
  || metadata.workflow?.event !== 'workflow_dispatch'
  || metadata.workflow?.actor !== expectedActor
  || metadata.pullRequest?.number !== Number(pullRequestNumber)
  || metadata.pullRequest?.base?.repository !== repository
  || metadata.pullRequest?.base?.ref !== 'main'
  || metadata.pullRequest?.base?.sha !== baseSha
  || metadata.pullRequest?.head?.repository !== repository
  || metadata.pullRequest?.head?.ref !== 'develop'
  || metadata.pullRequest?.head?.sha !== headSha
  || metadata.candidate?.runId !== `${runId}`
  || metadata.candidate?.runAttempt !== `${runAttempt}`
  || metadata.candidate?.unsignedArtifactName !== expectedUnsignedArtifact
  || metadata.release?.version !== '6.0.0'
  || metadata.release?.tag !== 'v6.0.0'
  || metadata.release?.parent !== headSha
  || !shaPattern.test(metadata.release?.commit)
  || !shaPattern.test(metadata.release?.tree)) {
  throw new Error('Unsigned release metadata mismatch')
}
if (manifest.schemaVersion !== 1
  || manifest.package?.name !== '@taeyoon0137/bodygroovn'
  || manifest.package?.version !== '6.0.0'
  || !Array.isArray(manifest.files)) {
  throw new Error('Unsigned payload manifest identity mismatch')
}

const files = await inventory(path.join(directory, 'payload'))
const expectedInventory = (await readFile(path.join(projectRoot, 'release', 'payload-inventory.txt'), 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
assertTrustedPayloadInventory(files.map(file => file.path), expectedInventory)
if (JSON.stringify(files) !== JSON.stringify(manifest.files)) {
  throw new Error('Unsigned payload bytes do not match the payload manifest')
}
assertExactChildren(files, 'assets/player', ['demo.html', 'lottie.js', 'lottie.js.gz', 'standalone.js'])
assertExactChildren(files, 'lib/CSInterface', ['CSInterface.js'])
assertExactChildren(files, 'server', ['main.js', 'package.json', 'pngWorker.js'])

const payloadRoot = path.join(directory, 'payload')
const [productionManifest, builtIndex, csInterface, player, standalone, compressedPlayer, demo] = await Promise.all([
  readFile(path.join(payloadRoot, 'CSXS', 'manifest.xml'), 'utf8'),
  readFile(path.join(payloadRoot, 'index.html'), 'utf8'),
  readFile(path.join(payloadRoot, 'lib', 'CSInterface', 'CSInterface.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'lottie.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'standalone.js')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'lottie.js.gz')),
  readFile(path.join(payloadRoot, 'assets', 'player', 'demo.html'), 'utf8'),
])
if (!productionManifest.includes('ExtensionBundleVersion="6.0.0"')
  || !productionManifest.includes('<Extension Id="com.bodymovin.bodymovin" Version="6.0.0"')
  || !productionManifest.includes('<MainPath>./index.html</MainPath>')
  || productionManifest.includes('127.0.0.1:3000')) {
  throw new Error('Unsigned production manifest mismatch')
}
const csInterfacePosition = builtIndex.indexOf('./lib/CSInterface/CSInterface.js')
const modulePosition = builtIndex.indexOf('type="module"')
if (csInterfacePosition === -1 || modulePosition === -1 || csInterfacePosition > modulePosition) {
  throw new Error('CSInterface.js is not loaded before the Vite module')
}
if (csInterface.byteLength !== 42_759
  || sha256(csInterface) !== '3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783') {
  throw new Error('Vendored CSInterface.js provenance mismatch')
}
if (!player.equals(standalone)
  || !gunzipSync(compressedPlayer).equals(player)
  || !compressedPlayer.subarray(4, 8).equals(Buffer.alloc(4))
  || compressedPlayer[9] !== 255) {
  throw new Error('Player payload or deterministic gzip metadata mismatch')
}
const demoMatch = demo.match(/<!-- build:scripto --><script>([\s\S]*?)<\/script><!-- endbuild -->/)
if (!demoMatch || demoMatch[1] !== player.toString('utf8')) throw new Error('Demo player insertion mismatch')

const temporaryRepository = await mkdtemp(path.join(os.tmpdir(), 'bodygroovn-trusted-bundle-'))
try {
  git(temporaryRepository, 'init', '--quiet')
  const bundlePath = path.resolve(directory, 'bodygroovn-v6.0.0.git.bundle')
  git(temporaryRepository, 'bundle', 'verify', bundlePath)
  const heads = git(temporaryRepository, 'bundle', 'list-heads', bundlePath).split(/\r?\n/).filter(Boolean)
  if (heads.length !== 1
    || heads[0] !== `${metadata.release.commit} refs/bodygroovn/release-candidate`) {
    throw new Error('Release Git bundle ref mismatch')
  }
  git(temporaryRepository, 'fetch', '--quiet', bundlePath,
    'refs/bodygroovn/release-candidate:refs/remotes/candidate/release')
  const releaseRef = 'refs/remotes/candidate/release'
  if (git(temporaryRepository, 'show', '-s', '--format=%H %P', releaseRef)
    !== `${metadata.release.commit} ${headSha}`
    || git(temporaryRepository, 'rev-parse', `${releaseRef}^{tree}`) !== metadata.release.tree
    || git(temporaryRepository, 'log', '-1', '--pretty=%s', releaseRef) !== 'chore(release): v6.0.0') {
    throw new Error('Release Git bundle commit identity mismatch')
  }
  git(temporaryRepository, 'merge-base', '--is-ancestor', baseSha, releaseRef)
  for (const filePath of trustedAutomationPaths) {
    let baseObject
    let headObject
    try {
      baseObject = git(temporaryRepository, 'rev-parse', `${baseSha}:${filePath}`)
      headObject = git(temporaryRepository, 'rev-parse', `${headSha}:${filePath}`)
    } catch {
      throw new Error(`Trusted release automation is missing: ${filePath}`)
    }
    if (baseObject !== headObject) {
      throw new Error(`Pull request changed trusted release automation: ${filePath}`)
    }
  }
  const pullRequestChanges = execFileSync(
    'git',
    ['diff', '--name-only', '-z', baseSha, headSha],
    {cwd: temporaryRepository},
  ).toString('utf8').split('\0').filter(Boolean)
  const trustedAutomation = new Set(trustedAutomationPaths)
  const forbiddenAutomationChanges = pullRequestChanges.filter(filePath => (
    filePath.startsWith('.github/workflows/') || trustedAutomation.has(filePath)
  ))
  if (forbiddenAutomationChanges.length !== 0) {
    throw new Error(`Pull request changed trusted release automation: ${forbiddenAutomationChanges.join(', ')}`)
  }
  const changed = git(temporaryRepository, 'diff-tree', '--no-commit-id', '--name-status', '-r', `${releaseRef}^`, releaseRef)
    .split(/\r?\n/)
    .filter(Boolean)
    .sort()
  const expectedChanged = [
    'A\tCHANGELOG.md',
    'D\t.changeset/independent-bodygroovn-release.md',
    'M\tbundle/CSXS/manifest.xml',
    'M\tbundle/jsx/helpers/versionHelper.jsx',
    'M\tpackage.json',
  ].sort()
  if (changed.join('\n') !== expectedChanged.join('\n')) throw new Error('Release commit changed unexpected files')

  const packageJson = JSON.parse(git(temporaryRepository, 'show', `${releaseRef}:package.json`))
  const sourceManifest = git(temporaryRepository, 'show', `${releaseRef}:bundle/CSXS/manifest.xml`)
  const versionHelper = git(temporaryRepository, 'show', `${releaseRef}:bundle/jsx/helpers/versionHelper.jsx`)
  if (packageJson.name !== '@taeyoon0137/bodygroovn' || packageJson.version !== '6.0.0' || packageJson.private !== true
    || !sourceManifest.includes('ExtensionBundleVersion="6.0.0"')
    || !sourceManifest.includes('<Extension Id="com.bodymovin.bodymovin" Version="6.0.0"')
    || !sourceManifest.includes('<ExtensionManifest Version="12.0"')
    || !sourceManifest.includes('<RequiredRuntime Name="CSXS" Version="12.0"')
    || !versionHelper.includes("compatibilityVersion = '5.12.0'")
    || !versionHelper.includes("productVersion = '6.0.0'")) {
    throw new Error('Release tree version contract mismatch')
  }
} finally {
  await rm(temporaryRepository, {recursive: true, force: true})
}

console.log(`Verified trusted unsigned candidate ${runId}/${runAttempt} for pull request #${pullRequestNumber}.`)
