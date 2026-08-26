import {execFileSync, spawnSync} from 'node:child_process'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

const repositoryRoot = process.cwd()
const temporaryDirectories = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bodygroovn-release-contract-'))
  temporaryDirectories.push(directory)
  return directory
}

function runScript(script, args, options = {}) {
  return execFileSync(process.execPath, [path.join(repositoryRoot, script), ...args], {
    encoding: 'utf8',
    ...options,
  })
}

function runFailingScript(script, args, options = {}) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, script), ...args], {
    encoding: 'utf8',
    ...options,
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {force: true, recursive: true})))
})

describe('release transaction contracts', () => {
  it('accepts only the exact pending bodygroovn 6.0.0 release', async () => {
    const directory = await createTemporaryDirectory()
    const statusPath = path.join(directory, 'status.json')
    const release = {
      name: '@taeyoon0137/bodygroovn',
      newVersion: '6.0.0',
      oldVersion: '5.12.0',
      type: 'major',
    }

    await writeFile(statusPath, `${JSON.stringify({releases: [release]})}\n`)
    expect(runScript('scripts/release/assert-changeset-release.mjs', [statusPath]))
      .toContain('Verified the single pending bodygroovn 6.0.0 release.')

    for (const releases of [
      [],
      [{...release, newVersion: '6.0.1'}],
      [release, release],
    ]) {
      await writeFile(statusPath, `${JSON.stringify({releases})}\n`)
      expect(runFailingScript('scripts/release/assert-changeset-release.mjs', [statusPath]).status).not.toBe(0)
    }
  })

  it('preserves the porcelain status prefix when the first release change is a deletion', async () => {
    const directory = await createTemporaryDirectory()
    const files = [
      '.changeset/independent-bodygroovn-release.md',
      'bundle/CSXS/manifest.xml',
      'bundle/jsx/helpers/versionHelper.jsx',
      'package.json',
    ]
    for (const file of files) {
      await mkdir(path.dirname(path.join(directory, file)), {recursive: true})
      await writeFile(path.join(directory, file), 'before\n')
    }
    const git = (...args) => execFileSync('git', args, {cwd: directory, encoding: 'utf8'})
    git('init', '--quiet')
    git('config', 'user.name', 'bodygroovn release test')
    git('config', 'user.email', 'release-test@bodygroovn.invalid')
    git('add', '--all')
    git('commit', '--quiet', '-m', 'test fixture')

    await rm(path.join(directory, files[0]))
    await Promise.all(files.slice(1).map(file => writeFile(path.join(directory, file), 'after\n')))

    expect(runScript('scripts/release/assert-release-diff.mjs', [], {cwd: directory}))
      .toContain('Verified 4 release-version changes.')
  })
})
