import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

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

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function createCandidate(directory) {
  const contents = {
    'bodygroovn-v6.0.0.git.bundle': Buffer.from('git bundle fixture'),
    'bodygroovn-v6.0.0.zxp': Buffer.from('signed zxp fixture'),
    'unsigned-payload-manifest.json': Buffer.from('{"fixture":true}\n'),
    'zxp-verify.txt': Buffer.from('signature verified\n'),
  }
  const zxpDigest = sha256(contents['bodygroovn-v6.0.0.zxp'])
  contents['bodygroovn-v6.0.0.zxp.sha256'] = Buffer.from(`${zxpDigest}  bodygroovn-v6.0.0.zxp\n`)
  for (const [name, bytes] of Object.entries(contents)) await writeFile(path.join(directory, name), bytes)
  const provenance = {
    schemaVersion: 1,
    candidate: { runId: '10', runAttempt: '2' },
    release: {
      version: '6.0.0',
      tag: 'v6.0.0',
      parent: 'a'.repeat(40),
      commit: 'b'.repeat(40),
      tree: 'c'.repeat(40),
    },
    toolchain: {
      mise: '2026.8.14',
      miseAction: 'c2a87611a18de5b3828c5652fe268e992400cb5c',
      node: '24.19.0',
      yarn: '4.18.0',
      yarnSha256: 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5',
    },
    signing: {
      signer: {
        sourceCommit: 'fcee8de5537d2dd2ed3d91d5a495b7041155b280',
        sourcePath: 'ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe',
        bytes: 4_542_464,
        sha256: 'ffc2223167225ce61d024eb463fc5ad1a1be16133f99ef334a646f7311916c98',
      },
      certificateFingerprintSha256: 'd'.repeat(64),
      timestampAuthority: 'http://timestamp.digicert.com/',
    },
    artifacts: Object.fromEntries(Object.entries(contents).map(([name, bytes]) => [name, sha256(bytes)])),
  }
  await writeFile(path.join(directory, 'release-provenance.json'), `${JSON.stringify(provenance)}\n`)
  return provenance
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('release transaction contracts', () => {
  it('classifies only the exact pending bodygroovn 6.0.0 release', async () => {
    const directory = await createTemporaryDirectory()
    const statusPath = path.join(directory, 'status.json')
    const outputPath = path.join(directory, 'output.txt')
    const release = {
      name: '@taeyoon0137/bodygroovn',
      newVersion: '6.0.0',
      oldVersion: '5.12.0',
      type: 'major',
    }

    await writeFile(statusPath, `${JSON.stringify({ releases: [release] })}\n`)
    runScript('scripts/release/classify-changeset-release.mjs', [statusPath, outputPath])
    expect(await readFile(outputPath, 'utf8')).toBe('mode=release\n')

    await writeFile(statusPath, `${JSON.stringify({ releases: [] })}\n`)
    await writeFile(outputPath, '')
    runScript('scripts/release/classify-changeset-release.mjs', [statusPath, outputPath])
    expect(await readFile(outputPath, 'utf8')).toBe('mode=none\n')

    await writeFile(statusPath, `${JSON.stringify({ releases: [{ ...release, newVersion: '6.0.1' }] })}\n`)
    expect(runFailingScript('scripts/release/classify-changeset-release.mjs', [statusPath]).status).not.toBe(0)
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
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await writeFile(path.join(directory, file), 'before\n')
    }
    const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' })
    git('init', '--quiet')
    git('config', 'user.name', 'bodygroovn release test')
    git('config', 'user.email', 'release-test@bodygroovn.invalid')
    git('add', '--all')
    git('commit', '--quiet', '-m', 'test fixture')

    await rm(path.join(directory, files[0]))
    await Promise.all(files.slice(1).map(file => writeFile(path.join(directory, file), 'after\n')))

    expect(runScript('scripts/release/assert-release-diff.mjs', [], { cwd: directory }))
      .toContain('Verified 4 release-version changes.')
  })

  it('requires a non-empty environment-specific harness log', async () => {
    const directory = await createTemporaryDirectory()
    const record = JSON.parse(await readFile(path.join(repositoryRoot, 'release/ae-validation.example.json'), 'utf8'))
    const recordName = 'ae-validation-windows-2025.json'
    const logName = record.harness.logArtifact
    await writeFile(path.join(directory, recordName), `${JSON.stringify(record)}\n`)
    await writeFile(path.join(directory, logName), 'bodygroovn harness evidence\n')

    expect(runScript('scripts/release/validate-ae-record.mjs', [
      recordName,
      'windows',
      '2025',
      '1',
      '1',
      '2',
      '1',
      logName,
    ], { cwd: directory })).toContain('Validated windows / After Effects 2025 record.')

    await writeFile(path.join(directory, logName), '')
    expect(runFailingScript('scripts/release/validate-ae-record.mjs', [
      recordName,
      'windows',
      '2025',
      '1',
      '1',
      '2',
      '1',
      logName,
    ], { cwd: directory }).status).not.toBe(0)
  })

  it('rejects schema-invalid and adversarial AE records through the shared validator', async () => {
    const directory = await createTemporaryDirectory()
    const template = JSON.parse(await readFile(path.join(repositoryRoot, 'release/ae-validation.example.json'), 'utf8'))
    const logName = template.harness.logArtifact
    await writeFile(path.join(directory, logName), 'bodygroovn harness evidence\n')
    const mutations = [
      record => { record.schemaVersion = '1' },
      record => { record.unexpected = true },
      record => { record.ae.unexpected = true },
      record => { record.ae.version = [] },
      record => { record.ae.build = '   ' },
      record => { record.candidate.runId = 1 },
      record => { record.candidate.zxpSha256 = 'A'.repeat(64) },
      record => { record.checks.unexpected = true },
      record => { record.human.reviewer = '   ' },
      record => { record.harness.logArtifact = '../ae-validation-windows-2025.log' },
    ]

    for (const mutate of mutations) {
      const record = structuredClone(template)
      mutate(record)
      await writeFile(path.join(directory, 'record.json'), `${JSON.stringify(record)}\n`)
      expect(runFailingScript('scripts/release/validate-ae-record.mjs', [
        'record.json', 'windows', '2025', '1', '1', '2', '1', logName,
      ], { cwd: directory }).status).not.toBe(0)
    }
  })

  it('accepts only a complete four-log validation matrix for one candidate digest', async () => {
    const directory = await createTemporaryDirectory()
    const template = JSON.parse(await readFile(path.join(repositoryRoot, 'release/ae-validation.example.json'), 'utf8'))
    const environments = [
      ['windows', '2025'],
      ['windows', '2026'],
      ['macos', '2025'],
      ['macos', '2026'],
    ]

    for (const [platform, major] of environments) {
      const record = structuredClone(template)
      record.os = platform
      record.ae.major = major
      record.harness.logArtifact = `ae-validation-${platform}-${major}.log`
      await writeFile(path.join(directory, `ae-validation-${platform}-${major}.json`), `${JSON.stringify(record)}\n`)
      await writeFile(path.join(directory, record.harness.logArtifact), `${platform} ${major} harness evidence\n`)
    }

    expect(runScript('scripts/release/verify-validation-set.mjs', [
      directory,
      '1',
      '1',
      '2',
      '1',
      template.candidate.zxpSha256,
    ])).toContain('Verified complete 2x2 validation set')

    await writeFile(path.join(directory, 'ae-validation-macos-2026.log'), '')
    expect(runFailingScript('scripts/release/verify-validation-set.mjs', [
      directory,
      '1',
      '1',
      '2',
      '1',
      template.candidate.zxpSha256,
    ]).status).not.toBe(0)

    await writeFile(path.join(directory, 'ae-validation-macos-2026.log'), 'restored harness evidence\n')
    const malformedPath = path.join(directory, 'ae-validation-macos-2026.json')
    const malformed = JSON.parse(await readFile(malformedPath, 'utf8'))
    malformed.candidate.extra = 'not allowed'
    await writeFile(malformedPath, `${JSON.stringify(malformed)}\n`)
    expect(runFailingScript('scripts/release/verify-validation-set.mjs', [
      directory, '1', '1', '2', '1', template.candidate.zxpSha256,
    ]).status).not.toBe(0)
  })

  it('binds candidate and validation runs to API-resolved workflow identities and the release parent', async () => {
    const directory = await createTemporaryDirectory()
    const provenance = await createCandidate(directory)
    const files = {
      candidateWorkflow: { id: 101, path: '.github/workflows/release-candidate.yml' },
      candidateRun: {
        id: 10, run_attempt: 2, workflow_id: 101, event: 'push', head_branch: 'main', head_sha: provenance.release.parent,
        status: 'completed', conclusion: 'success', repository: { full_name: 'taeyoon0137/bodygroovn' },
      },
      validationWorkflow: { id: 202, path: '.github/workflows/ae-validation.yml' },
      validationRun: {
        id: 20, run_attempt: 3, workflow_id: 202, event: 'workflow_dispatch', head_branch: 'main', head_sha: provenance.release.parent,
        status: 'completed', conclusion: 'success', repository: { full_name: 'taeyoon0137/bodygroovn' },
      },
    }
    const paths = {}
    for (const [name, value] of Object.entries(files)) {
      paths[name] = path.join(directory, `${name}.json`)
      await writeFile(paths[name], `${JSON.stringify(value)}\n`)
    }
    const args = [paths.candidateWorkflow, paths.candidateRun, paths.validationWorkflow, paths.validationRun,
      path.join(directory, 'release-provenance.json'), '10', '2', '20', '3', 'taeyoon0137/bodygroovn']
    expect(runScript('scripts/release/verify-run-metadata.mjs', args)).toContain('Verified candidate run 10/2')

    const mutations = [
      ['candidateWorkflow', value => { value.path = '.github/workflows/develop-ci.yml' }],
      ['candidateRun', value => { value.workflow_id = 999 }],
      ['candidateRun', value => { value.event = 'workflow_dispatch' }],
      ['candidateRun', value => { value.conclusion = 'failure' }],
      ['validationRun', value => { value.head_sha = 'e'.repeat(40) }],
      ['validationRun', value => { value.repository.full_name = 'attacker/bodygroovn' }],
    ]
    for (const [name, mutate] of mutations) {
      const changed = structuredClone(files[name])
      mutate(changed)
      await writeFile(paths[name], `${JSON.stringify(changed)}\n`)
      expect(runFailingScript('scripts/release/verify-run-metadata.mjs', args).status).not.toBe(0)
      await writeFile(paths[name], `${JSON.stringify(files[name])}\n`)
    }
  })

  it('requires the exact candidate digest inventory, lowercase hashes, and sidecar bytes', async () => {
    const directory = await createTemporaryDirectory()
    const provenance = await createCandidate(directory)
    const provenancePath = path.join(directory, 'release-provenance.json')
    const verify = () => runScript('scripts/release/verify-candidate.mjs', [directory, '10', '2'])
    const fail = () => runFailingScript('scripts/release/verify-candidate.mjs', [directory, '10', '2'])
    expect(verify()).toContain('Verified candidate 10/2')

    const missing = structuredClone(provenance)
    delete missing.artifacts['zxp-verify.txt']
    await writeFile(provenancePath, `${JSON.stringify(missing)}\n`)
    expect(fail().status).not.toBe(0)

    const extra = structuredClone(provenance)
    extra.artifacts['release-provenance.json'] = 'e'.repeat(64)
    await writeFile(provenancePath, `${JSON.stringify(extra)}\n`)
    expect(fail().status).not.toBe(0)

    const invalid = structuredClone(provenance)
    invalid.artifacts['bodygroovn-v6.0.0.zxp'] = invalid.artifacts['bodygroovn-v6.0.0.zxp'].toUpperCase()
    await writeFile(provenancePath, `${JSON.stringify(invalid)}\n`)
    expect(fail().status).not.toBe(0)

    await writeFile(provenancePath, `${JSON.stringify(provenance)}\n`)
    await writeFile(path.join(directory, 'bodygroovn-v6.0.0.zxp.sha256'), `${provenance.artifacts['bodygroovn-v6.0.0.zxp']} bodygroovn-v6.0.0.zxp\r\n`)
    const changedSidecar = structuredClone(provenance)
    changedSidecar.artifacts['bodygroovn-v6.0.0.zxp.sha256'] = sha256(await readFile(path.join(directory, 'bodygroovn-v6.0.0.zxp.sha256')))
    await writeFile(provenancePath, `${JSON.stringify(changedSidecar)}\n`)
    expect(fail().status).not.toBe(0)
  })

  it('keeps the exact draft selector, atomic lease push, and two public assets', async () => {
    const finalizer = await readFile(path.join(repositoryRoot, 'scripts/release/finalize-release.sh'), 'utf8')

    expect(finalizer).toContain('select(.draft == true and .tag_name == "v6.0.0")')
    expect(finalizer).toContain('git push --atomic --force-with-lease="refs/heads/main:$trigger_sha"')
    expect(finalizer).toContain("'bodygroovn-v6.0.0.zxp bodygroovn-v6.0.0.zxp.sha256'")
    expect(finalizer).not.toContain('ae26-gradient-fix-v5.12.0-f878530b9db0')
  })
})
