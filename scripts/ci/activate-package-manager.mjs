import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const NODE_VERSION = 'v24.19.0'
const COREPACK_VERSION = '0.35.0'
const YARN_VERSION = '4.18.0'

function requireEnvironmentPath(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function runNodeCli(scriptPath, args, capture = false) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${path.basename(scriptPath)} exited with status ${result.status}`)
  return capture ? result.stdout.trim() : ''
}

if (process.version !== NODE_VERSION) {
  throw new Error(`Unexpected Node version: ${process.version}`)
}

const runnerTemp = requireEnvironmentPath('RUNNER_TEMP')
const githubPath = requireEnvironmentPath('GITHUB_PATH')
const toolchainRoot = path.join(runnerTemp, 'bodygroovn-package-manager')
const nodeDirectory = path.dirname(process.execPath)
const npmCliCandidates = process.platform === 'win32'
  ? [path.join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  : [path.resolve(nodeDirectory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
const npmCli = npmCliCandidates.find(candidate => fs.existsSync(candidate))
if (!npmCli) throw new Error(`Could not locate npm relative to ${process.execPath}`)

runNodeCli(npmCli, ['install', '--global', '--prefix', toolchainRoot, `corepack@${COREPACK_VERSION}`])

const executableDirectory = process.platform === 'win32' ? toolchainRoot : path.join(toolchainRoot, 'bin')
const moduleDirectory = process.platform === 'win32'
  ? path.join(toolchainRoot, 'node_modules')
  : path.join(toolchainRoot, 'lib', 'node_modules')
const corepackCli = path.join(moduleDirectory, 'corepack', 'dist', 'corepack.js')
const yarnCli = path.join(moduleDirectory, 'corepack', 'dist', 'yarn.js')
const corepackShim = path.join(executableDirectory, process.platform === 'win32' ? 'corepack.cmd' : 'corepack')
const yarnShim = path.join(executableDirectory, process.platform === 'win32' ? 'yarn.cmd' : 'yarn')

for (const requiredPath of [corepackCli, yarnCli, corepackShim, yarnShim]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Package manager bootstrap did not create ${requiredPath}`)
}

runNodeCli(corepackCli, ['prepare', `yarn@${YARN_VERSION}`, '--activate'])
const actualCorepackVersion = runNodeCli(corepackCli, ['--version'], true)
const actualYarnVersion = runNodeCli(yarnCli, ['--version'], true)
if (actualCorepackVersion !== COREPACK_VERSION) {
  throw new Error(`Unexpected Corepack version: ${actualCorepackVersion}`)
}
if (actualYarnVersion !== YARN_VERSION) {
  throw new Error(`Unexpected Yarn version: ${actualYarnVersion}`)
}

fs.appendFileSync(githubPath, `${executableDirectory}\n`, 'utf8')
console.log(`Activated Node ${NODE_VERSION}, Corepack ${COREPACK_VERSION}, and Yarn ${YARN_VERSION}.`)
