import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'

export const EXPECTED_TOOLCHAIN = {
  mise: '2026.8.14',
  node: '24.19.0',
  yarn: '4.18.0',
}
export const YARN_SHA256 = 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5'

function readCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`)
  return result.stdout.trim()
}

export function verifyToolchain() {
  const yarnPath = readCommand('mise', ['which', 'yarn'])
  const yarnSha256 = createHash('sha256').update(readFileSync(yarnPath)).digest('hex')
  if (yarnSha256 !== YARN_SHA256) {
    throw new Error(`Unexpected Yarn CLI SHA-256: expected ${YARN_SHA256}, received ${yarnSha256}`)
  }

  const actual = {
    mise: readCommand('mise').split(/\s+/, 1)[0],
    node: process.version.replace(/^v/, ''),
    yarn: readCommand(process.execPath, [yarnPath, '--version']),
  }
  for (const [tool, expectedVersion] of Object.entries(EXPECTED_TOOLCHAIN)) {
    if (actual[tool] !== expectedVersion) {
      throw new Error(`Unexpected ${tool} version: expected ${expectedVersion}, received ${actual[tool]}`)
    }
  }

  return {actual, yarnPath, yarnSha256}
}
