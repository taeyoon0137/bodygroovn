import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  assertTrustedPayloadInventory,
  normalizeTrustedPayloadPath,
} from './trusted-payload-inventory.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const readRepositoryFile = (path) => readFile(resolve(repositoryRoot, path), 'utf8')

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const actionReferencePattern = /^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/gm

const jobBlock = (workflow, jobName) => {
  const escapedName = escapeRegExp(jobName)
  const match = workflow.match(
    new RegExp(`^  ${escapedName}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\n|(?![\\s\\S]))`, 'm'),
  )
  assert.ok(match, `Expected workflow job ${jobName}`)
  return match[0]
}

const validPullRequest = ({
  number = 27,
  repository = 'taeyoon0137/bodygroovn',
  baseSha = '1'.repeat(40),
  headSha = '2'.repeat(40),
} = {}) => ({
  number,
  state: 'open',
  draft: false,
  base: {
    ref: 'main',
    sha: baseSha,
    repo: {full_name: repository},
  },
  head: {
    ref: 'develop',
    sha: headSha,
    repo: {full_name: repository},
  },
})

const runPullRequestVerifier = async (pullRequest, expected = {}) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'bodygroovn-pr-source-'))
  const pullRequestPath = resolve(directory, 'pull-request.json')
  const outputPath = resolve(directory, 'github-output.txt')
  await writeFile(pullRequestPath, `${JSON.stringify(pullRequest)}\n`)

  const result = spawnSync(
    process.execPath,
    [
      resolve(repositoryRoot, 'scripts/release/verify-pr-source.mjs'),
      pullRequestPath,
      expected.repository ?? 'taeyoon0137/bodygroovn',
      `${expected.number ?? pullRequest.number}`,
      expected.headSha ?? pullRequest.head.sha,
      outputPath,
    ],
    {encoding: 'utf8'},
  )

  const output = result.status === 0 ? await readFile(outputPath, 'utf8') : ''
  await rm(directory, {recursive: true, force: true})
  return {...result, githubOutput: output}
}

const runRepositoryScript = (script, args) => spawnSync(
  process.execPath,
  [resolve(repositoryRoot, script), ...args],
  {encoding: 'utf8'},
)

const createCandidateFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'bodygroovn-candidate-'))
  const candidate = resolve(root, 'candidate')
  await mkdir(candidate)
  const repository = 'taeyoon0137/bodygroovn'
  const pullRequestNumber = '27'
  const runId = '101'
  const runAttempt = '2'
  const baseSha = '1'.repeat(40)
  const headSha = '2'.repeat(40)
  const releaseCommit = '3'.repeat(40)
  const releaseTree = '4'.repeat(40)
  const unsignedDigest = '5'.repeat(64)
  const certificateFingerprint = '6'.repeat(64)
  const zxpBytes = Buffer.from('signed ZXP fixture', 'utf8')
  const zxpDigest = createHash('sha256').update(zxpBytes).digest('hex')
  const unsignedMetadataPath = resolve(root, 'unsigned-release.json')

  await Promise.all([
    writeFile(resolve(candidate, 'bodygroovn-v6.0.0.git.bundle'), 'bundle fixture'),
    writeFile(resolve(candidate, 'bodygroovn-v6.0.0.zxp'), zxpBytes),
    writeFile(
      resolve(candidate, 'bodygroovn-v6.0.0.zxp.sha256'),
      `${zxpDigest}  bodygroovn-v6.0.0.zxp\n`,
    ),
    writeFile(resolve(candidate, 'unsigned-payload-manifest.json'), `${JSON.stringify({
      schemaVersion: 1,
      package: {name: '@taeyoon0137/bodygroovn', version: '6.0.0'},
      files: [{path: 'index.html', bytes: 1, sha256: '7'.repeat(64)}],
    })}\n`),
    writeFile(resolve(candidate, 'zxp-verify.txt'), 'valid signature fixture\n'),
    writeFile(unsignedMetadataPath, `${JSON.stringify({
      schemaVersion: 1,
      repository,
      workflow: {
        path: '.github/workflows/release-candidate.yml',
        commit: baseSha,
        event: 'workflow_dispatch',
        actor: 'taeyoon0137',
      },
      pullRequest: {
        number: Number(pullRequestNumber),
        base: {repository, ref: 'main', sha: baseSha},
        head: {repository, ref: 'develop', sha: headSha},
      },
      candidate: {
        runId,
        runAttempt,
        unsignedArtifactName: `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`,
      },
      release: {
        version: '6.0.0',
        tag: 'v6.0.0',
        parent: headSha,
        commit: releaseCommit,
        tree: releaseTree,
      },
    })}\n`),
  ])

  const writer = runRepositoryScript('scripts/release/write-provenance.mjs', [
    candidate,
    unsignedMetadataPath,
    repository,
    pullRequestNumber,
    runId,
    runAttempt,
    certificateFingerprint,
    unsignedDigest,
  ])
  assert.equal(writer.status, 0, writer.stderr)

  return {
    root,
    candidate,
    repository,
    pullRequestNumber,
    runId,
    runAttempt,
    baseSha,
    headSha,
    releaseCommit,
    unsignedDigest,
    zxpDigest,
  }
}

const runGit = (cwd, args, options = {}) => {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', ...options})
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

const createFinalizerFixture = async ({
  remoteReleased = false,
  releaseState,
  failIdentityField,
  untaggedPostResponses = 0,
  extraReleaseParent = false,
} = {}) => {
  const root = await mkdtemp(resolve(tmpdir(), 'bodygroovn-finalizer-'))
  const origin = resolve(root, 'origin.git')
  const work = resolve(root, 'work')
  const candidate = resolve(root, 'candidate')
  const bin = resolve(root, 'bin')
  const statePath = resolve(root, 'gh-state.json')
  const logPath = resolve(root, 'gh.log')
  await Promise.all([mkdir(candidate), mkdir(bin), mkdir(resolve(work, 'scripts'), {recursive: true})])
  runGit(root, ['init', '--bare', origin])
  runGit(root, ['init', work])
  runGit(work, ['config', 'user.name', 'Fixture Author'])
  runGit(work, ['config', 'user.email', 'fixture@example.invalid'])
  runGit(work, ['remote', 'add', 'origin', origin])

  await writeFile(resolve(work, 'fixture.txt'), 'base\n')
  runGit(work, ['add', 'fixture.txt'])
  runGit(work, ['commit', '-m', 'base'])
  const baseSha = runGit(work, ['rev-parse', 'HEAD'])
  await writeFile(resolve(work, 'fixture.txt'), 'head\n')
  runGit(work, ['commit', '-am', 'product change'])
  const headSha = runGit(work, ['rev-parse', 'HEAD'])
  await writeFile(resolve(work, 'fixture.txt'), 'release\n')
  runGit(work, ['commit', '-am', 'chore(release): v6.0.0'])
  let releaseCommit = runGit(work, ['rev-parse', 'HEAD'])
  const releaseTree = runGit(work, ['rev-parse', 'HEAD^{tree}'])
  if (extraReleaseParent) {
    releaseCommit = runGit(
      work,
      ['commit-tree', releaseTree, '-p', headSha, '-p', baseSha],
      {input: 'chore(release): v6.0.0\n'},
    )
    runGit(work, ['reset', '--hard', releaseCommit])
  }
  runGit(work, ['push', 'origin', `${baseSha}:refs/heads/main`])
  if (remoteReleased) {
    runGit(work, ['tag', '-a', 'v6.0.0', releaseCommit, '-m', 'Release bodygroovn v6.0.0'])
    runGit(work, ['push', 'origin', `${releaseCommit}:refs/heads/main`, 'refs/tags/v6.0.0'])
  }
  runGit(work, ['update-ref', 'refs/bodygroovn/release-candidate', releaseCommit])
  runGit(work, [
    'bundle', 'create', resolve(candidate, 'bodygroovn-v6.0.0.git.bundle'),
    'refs/bodygroovn/release-candidate',
  ])

  const zxp = resolve(candidate, 'bodygroovn-v6.0.0.zxp')
  const sidecar = resolve(candidate, 'bodygroovn-v6.0.0.zxp.sha256')
  const zxpBytes = Buffer.from('signed finalizer fixture', 'utf8')
  const zxpDigest = createHash('sha256').update(zxpBytes).digest('hex')
  await Promise.all([
    writeFile(zxp, zxpBytes),
    writeFile(sidecar, `${zxpDigest}  bodygroovn-v6.0.0.zxp\n`),
    writeFile(
      resolve(work, 'scripts/verify-sha256-sidecar.mjs'),
      await readRepositoryFile('scripts/verify-sha256-sidecar.mjs'),
    ),
  ])
  const sidecarDigest = createHash('sha256').update(await readFile(sidecar)).digest('hex')
  const repository = 'taeyoon0137/bodygroovn'
  const pullRequestNumber = 27
  const runId = '101'
  const runAttempt = '2'
  const releaseBody = `First independently maintained bodygroovn release.\n\nPull request: #${pullRequestNumber}\nCandidate run: ${runId}/${runAttempt}\nRelease commit: ${releaseCommit}\nZXP SHA-256: ${zxpDigest}`
  await writeFile(resolve(candidate, 'release-provenance.json'), `${JSON.stringify({
    pullRequest: {number: pullRequestNumber, base: {sha: baseSha}, head: {sha: headSha}},
    candidate: {runId, runAttempt},
    release: {commit: releaseCommit, tree: releaseTree},
    artifacts: {'bodygroovn-v6.0.0.zxp': zxpDigest},
  })}\n`)

  const initialState = releaseState === 'draft'
    ? {
        failReleaseList: false,
        releases: [{
          id: 600,
          tag_name: 'v6.0.0',
          name: 'bodygroovn v6.0.0',
          target_commitish: releaseCommit,
          body: releaseBody,
          draft: true,
          prerelease: false,
          assets: [{name: 'bodygroovn-v6.0.0.zxp', digest: `sha256:${zxpDigest}`}],
        }],
      }
    : releaseState === 'published'
      ? {
          failReleaseList: false,
          releases: [{
            id: 600,
            tag_name: 'v6.0.0',
            name: 'bodygroovn v6.0.0',
            target_commitish: releaseCommit,
            body: releaseBody,
            draft: false,
            prerelease: false,
            assets: [
              {name: 'bodygroovn-v6.0.0.zxp', digest: `sha256:${zxpDigest}`},
              {name: 'bodygroovn-v6.0.0.zxp.sha256', digest: `sha256:${sidecarDigest}`},
            ],
          }],
        }
      : releaseState === 'none'
        ? {failReleaseList: false, releases: []}
        : {failReleaseList: true, releases: []}
  initialState.failIdentityField = failIdentityField ?? null
  initialState.untaggedPostResponses = untaggedPostResponses
  initialState.postAttempts = 0
  await writeFile(statePath, `${JSON.stringify(initialState)}\n`)

  const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs')
const crypto = require('node:crypto')
const statePath = process.env.FAKE_GH_STATE
const logPath = process.env.FAKE_GH_LOG
const args = process.argv.slice(2)
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
fs.appendFileSync(logPath, JSON.stringify(args) + '\\n')
const save = () => fs.writeFileSync(statePath, JSON.stringify(state) + '\\n')
const valueAfter = flag => args[args.indexOf(flag) + 1]
const formValue = name => {
  const value = args.find(arg => arg.startsWith(name + '='))
  return value && value.slice(name.length + 1)
}
const apiPath = args.find(value => value.startsWith('repos/'))
if (args[0] === 'api' && apiPath && apiPath.includes('/releases?')) {
  if (state.failReleaseList) process.exit(42)
  const wantsDraft = valueAfter('--jq').includes('draft == true')
  for (const release of state.releases.filter(item => item.draft === wantsDraft && item.tag_name === 'v6.0.0')) console.log(release.id)
  process.exit(0)
}
if (args[0] === 'api' && apiPath && /\\/releases\\/\\d+\\/assets$/.test(apiPath)) {
  const id = Number(apiPath.match(/releases\\/(\\d+)/)[1])
  const release = state.releases.find(item => item.id === id)
  const jq = valueAfter('--jq')
  if (jq === '.[].name') for (const asset of release.assets) console.log(asset.name)
  else {
    const name = jq.match(/name == \\"([^\\"]+)\\"/)[1]
    const asset = release.assets.find(item => item.name === name)
    if (asset) console.log(asset.digest)
  }
  process.exit(0)
}
if (args[0] === 'api' && apiPath && /\\/releases\\/\\d+$/.test(apiPath)) {
  const id = Number(apiPath.match(/releases\\/(\\d+)$/)[1])
  const release = state.releases.find(item => item.id === id)
  if (args.includes('--method') && valueAfter('--method') === 'DELETE') {
    state.releases = state.releases.filter(item => item.id !== id)
    save()
    process.exit(0)
  }
  if (args.includes('--method') && valueAfter('--method') === 'PATCH') {
    release.draft = false
    save()
    process.exit(0)
  }
  const field = valueAfter('--jq').slice(1)
  if (state.failIdentityField === field) process.exit(43)
  console.log(typeof release[field] === 'boolean' ? String(release[field]) : release[field])
  process.exit(0)
}
if (args[0] === 'api' && args.includes('--method') && valueAfter('--method') === 'POST' && apiPath && /\\/releases$/.test(apiPath)) {
  state.postAttempts += 1
  const isPlaceholder = state.postAttempts <= state.untaggedPostResponses
  const release = {
    id: 600 + state.postAttempts,
    tag_name: isPlaceholder ? 'untagged-' + state.postAttempts : formValue('tag_name'),
    name: formValue('name'),
    target_commitish: formValue('target_commitish'),
    body: formValue('body'),
    draft: formValue('draft') === 'true',
    prerelease: formValue('prerelease') === 'true',
    assets: [],
  }
  state.releases.push(release)
  save()
  console.log(JSON.stringify(release))
  process.exit(0)
}
if (args[0] === 'release' && args[1] === 'upload') {
  const file = args[3]
  const release = state.releases.find(item => item.tag_name === args[2] && item.draft)
  const bytes = fs.readFileSync(file)
  release.assets.push({name: require('node:path').basename(file), digest: 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex')})
  save()
  process.exit(0)
}
console.error('Unsupported fake gh invocation:', args)
process.exit(64)
`
  const ghPath = resolve(bin, 'gh')
  const sleepPath = resolve(bin, 'sleep')
  await writeFile(ghPath, fakeGh)
  await writeFile(
    sleepPath,
    '#!/bin/sh\nprintf \'["sleep","%s"]\\n\' "$1" >> "$FAKE_GH_LOG"\nexit 0\n',
  )
  await Promise.all([chmod(ghPath, 0o755), chmod(sleepPath, 0o755)])

  return {
    root,
    work,
    origin,
    candidate,
    statePath,
    logPath,
    repository,
    baseSha,
    headSha,
    releaseCommit,
    run: () => spawnSync(
      'bash',
      [resolve(repositoryRoot, 'scripts/release/finalize-release.sh'), candidate],
      {
        cwd: work,
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_REPO: repository,
          FAKE_GH_STATE: statePath,
          FAKE_GH_LOG: logPath,
          PATH: `${bin}:${process.env.PATH}`,
        },
      },
    ),
  }
}

test('verify-pr-source accepts an open same-repository develop-to-main pull request', async () => {
  const pullRequest = validPullRequest()
  const result = await runPullRequestVerifier(pullRequest)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    result.githubOutput,
    `base_sha=${pullRequest.base.sha}\nhead_sha=${pullRequest.head.sha}\npull_request_number=27\n`,
  )
})

test('verify-pr-source rejects a pull request from a fork', async () => {
  const pullRequest = validPullRequest()
  pullRequest.head.repo.full_name = 'untrusted/bodygroovn'

  const result = await runPullRequestVerifier(pullRequest)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /same-repository develop-to-main/)
})

test('verify-pr-source rejects a draft pull request', async () => {
  const pullRequest = validPullRequest()
  pullRequest.draft = true

  const result = await runPullRequestVerifier(pullRequest)

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /open and ready for review/)
})

test('trusted inventory normalizes only exact Vite entry hashes', () => {
  assert.equal(normalizeTrustedPayloadPath('assets/index-CUk9D5mt.js'), 'assets/index-[hash].js')
  assert.equal(normalizeTrustedPayloadPath('assets/index-ClBhKo8T.css'), 'assets/index-[hash].css')
  assert.equal(normalizeTrustedPayloadPath('assets/index-short.js'), 'assets/index-short.js')
  assertTrustedPayloadInventory(
    ['assets/index-CUk9D5mt.js', 'assets/index-ClBhKo8T.css'],
    ['assets/index-[hash].css', 'assets/index-[hash].js'],
  )
  assert.throws(
    () => assertTrustedPayloadInventory(
      ['assets/index-short.js', 'assets/index-ClBhKo8T.css'],
      ['assets/index-[hash].css', 'assets/index-[hash].js'],
    ),
    /does not match/,
  )
  assert.throws(
    () => assertTrustedPayloadInventory(['b', 'a'], ['b', 'a']),
    /sorted and contain no duplicates/,
  )
})

test('candidate provenance binds the pull request, artifact run, and exact ZXP digest', async () => {
  const fixture = await createCandidateFixture()
  try {
    const verifierArguments = [
      fixture.candidate,
      fixture.repository,
      fixture.pullRequestNumber,
      fixture.runId,
      fixture.runAttempt,
      fixture.unsignedDigest,
      fixture.zxpDigest,
    ]
    const valid = runRepositoryScript('scripts/release/verify-candidate.mjs', verifierArguments)
    assert.equal(valid.status, 0, valid.stderr)

    const wrongDigest = runRepositoryScript('scripts/release/verify-candidate.mjs', [
      ...verifierArguments.slice(0, -2),
      '8'.repeat(64),
      fixture.zxpDigest,
    ])
    assert.notEqual(wrongDigest.status, 0)
    assert.match(wrongDigest.stderr, /trust binding mismatch/)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer reads dotted artifact filenames as literal provenance keys', async () => {
  const fixture = await createCandidateFixture()
  try {
    const result = spawnSync(
      'bash',
      [resolve(repositoryRoot, 'scripts/release/finalize-release.sh'), fixture.candidate],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {...process.env, GH_REPO: fixture.repository},
      },
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /bundle/i)
    assert.doesNotMatch(result.stderr, /TypeError|Cannot read properties of undefined/)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer rejects a release bundle whose commit has an extra parent', async () => {
  const fixture = await createFinalizerFixture({extraReleaseParent: true})
  try {
    assert.equal(
      runGit(fixture.work, ['rev-list', '--parents', '-n', '1', fixture.releaseCommit]),
      `${fixture.releaseCommit} ${fixture.headSha} ${fixture.baseSha}`,
    )
    const result = fixture.run()

    assert.notEqual(result.status, 0)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']).split('\t')[0], fixture.baseSha)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0']), '')
    const calls = await readFile(fixture.logPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    assert.equal(calls, '')
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer fails closed when the GitHub release listing API fails', async () => {
  const fixture = await createFinalizerFixture()
  try {
    const result = fixture.run()

    assert.notEqual(result.status, 0)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']).split('\t')[0], fixture.baseSha)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0']), '')
    const calls = (await readFile(fixture.logPath, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(calls.length, 1)
    assert.match(calls[0].join(' '), /releases\?per_page=100/)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer fails closed when release identity lookup fails', async () => {
  const fixture = await createFinalizerFixture({
    remoteReleased: true,
    releaseState: 'draft',
    failIdentityField: 'name',
  })
  try {
    const beforeState = await readFile(fixture.statePath, 'utf8')
    const beforeMain = runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main'])
    const beforeTag = runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}'])
    const result = fixture.run()

    assert.notEqual(result.status, 0)
    const calls = (await readFile(fixture.logPath, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(calls.filter(args => args[0] === 'release' && args[1] === 'upload').length, 0)
    assert.equal(calls.filter(args => args.includes('--method')).length, 0)
    assert.equal(await readFile(fixture.statePath, 'utf8'), beforeState)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']), beforeMain)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}']), beforeTag)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer deletes untagged placeholders before accepting the exact initial release draft', async () => {
  const fixture = await createFinalizerFixture({releaseState: 'none', untaggedPostResponses: 2})
  try {
    const result = fixture.run()

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const calls = (await readFile(fixture.logPath, 'utf8')).trim().split('\n').map(JSON.parse)
    const creates = calls
      .map((args, index) => ({args, index}))
      .filter(({args}) => args.includes('--method') && args.includes('POST'))
    const deletes = calls
      .map((args, index) => ({args, index}))
      .filter(({args}) => args.includes('--method') && args.includes('DELETE'))
    const sleeps = calls
      .map((args, index) => ({args, index}))
      .filter(({args}) => args[0] === 'sleep')
    assert.equal(creates.length, 3)
    assert.deepEqual(deletes.map(({args}) => args.find(value => /releases\/\d+$/.test(value))), [
      `repos/${fixture.repository}/releases/601`,
      `repos/${fixture.repository}/releases/602`,
    ])
    assert.deepEqual(sleeps.map(({args}) => args[1]), ['5', '5'])
    assert.ok(creates[0].index < deletes[0].index && deletes[0].index < sleeps[0].index)
    assert.ok(sleeps[0].index < creates[1].index && creates[1].index < deletes[1].index)
    assert.ok(deletes[1].index < sleeps[1].index && sleeps[1].index < creates[2].index)
    assert.equal(calls.filter(args => args[0] === 'release' && args[1] === 'upload').length, 2)
    assert.equal(calls.filter(args => args.includes('--method') && args.includes('PATCH')).length, 1)
    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.releases.length, 1)
    assert.equal(state.releases[0].id, 603)
    assert.equal(state.releases[0].draft, false)
    assert.equal(state.releases[0].target_commitish, fixture.releaseCommit)
    assert.equal(state.releases[0].assets.length, 2)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']).split('\t')[0], fixture.releaseCommit)
    assert.equal(
      runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}']).split('\t')[0],
      fixture.releaseCommit,
    )
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer resumes the exact partial draft and uploads only its missing allowed asset', async () => {
  const fixture = await createFinalizerFixture({remoteReleased: true, releaseState: 'draft'})
  try {
    const result = fixture.run()

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /Published v6\.0\.0 from pull request #27/)
    const calls = (await readFile(fixture.logPath, 'utf8')).trim().split('\n').map(JSON.parse)
    const uploads = calls.filter(args => args[0] === 'release' && args[1] === 'upload')
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0][2], 'v6.0.0')
    assert.equal(uploads[0][3].split('/').at(-1), 'bodygroovn-v6.0.0.zxp.sha256')
    assert.equal(calls.filter(args => args.includes('--method') && args.includes('POST')).length, 0)
    assert.equal(calls.filter(args => args.includes('--method') && args.includes('PATCH')).length, 1)
    assert.ok(
      calls.filter(args => args.some(value => value.includes('/releases/600'))).length > 0,
      'Recovery must continue using the existing draft id',
    )

    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
    assert.equal(state.releases.length, 1)
    assert.equal(state.releases[0].id, 600)
    assert.equal(state.releases[0].draft, false)
    assert.deepEqual(
      state.releases[0].assets.map(asset => asset.name).sort(),
      ['bodygroovn-v6.0.0.zxp', 'bodygroovn-v6.0.0.zxp.sha256'],
    )
    assert.ok(state.releases[0].assets.every(asset => /^sha256:[0-9a-f]{64}$/.test(asset.digest)))
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']).split('\t')[0], fixture.releaseCommit)
    assert.equal(
      runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}']).split('\t')[0],
      fixture.releaseCommit,
    )
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('finalizer verifies an already-published release without uploads or mutations', async () => {
  const fixture = await createFinalizerFixture({remoteReleased: true, releaseState: 'published'})
  try {
    const beforeState = await readFile(fixture.statePath, 'utf8')
    const beforeMain = runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main'])
    const beforeTag = runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}'])
    const result = fixture.run()

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /Verified already-published v6\.0\.0/)
    const calls = (await readFile(fixture.logPath, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.equal(calls.filter(args => args[0] === 'release' && args[1] === 'upload').length, 0)
    assert.equal(calls.filter(args => args.includes('--method')).length, 0)
    assert.equal(await readFile(fixture.statePath, 'utf8'), beforeState)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/heads/main']), beforeMain)
    assert.equal(runGit(fixture.work, ['ls-remote', 'origin', 'refs/tags/v6.0.0^{}']), beforeTag)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('run metadata accepts an unchanged open PR and graph-bound merged recovery', async () => {
  const fixture = await createCandidateFixture()
  try {
    const workflowPath = resolve(fixture.root, 'workflow.json')
    const runPath = resolve(fixture.root, 'run.json')
    const jobsPath = resolve(fixture.root, 'jobs.json')
    const pullRequestPath = resolve(fixture.root, 'pull-request.json')
    const provenancePath = resolve(fixture.candidate, 'release-provenance.json')
    await Promise.all([
      writeFile(workflowPath, JSON.stringify({
        id: 44,
        path: '.github/workflows/release-candidate.yml',
      })),
      writeFile(runPath, JSON.stringify({
        id: Number(fixture.runId),
        run_attempt: Number(fixture.runAttempt),
        workflow_id: 44,
        event: 'workflow_dispatch',
        head_branch: 'main',
        head_sha: fixture.baseSha,
        actor: {login: 'taeyoon0137'},
        status: 'completed',
        conclusion: 'success',
        repository: {full_name: fixture.repository},
      })),
      writeFile(jobsPath, JSON.stringify({
        jobs: ['inspect', 'build-release-tree', 'sign-candidate'].map(name => ({
          name,
          run_id: Number(fixture.runId),
          run_attempt: Number(fixture.runAttempt),
          status: 'completed',
          conclusion: 'success',
        })),
      })),
      writeFile(pullRequestPath, JSON.stringify({
        ...validPullRequest({
          number: Number(fixture.pullRequestNumber),
          repository: fixture.repository,
          baseSha: fixture.baseSha,
          headSha: fixture.headSha,
        }),
        merged: false,
      })),
    ])
    const argumentsFor = path => [
      workflowPath,
      runPath,
      jobsPath,
      path,
      provenancePath,
      fixture.repository,
      fixture.pullRequestNumber,
      fixture.runId,
      fixture.runAttempt,
      fixture.unsignedDigest,
      fixture.zxpDigest,
    ]

    const open = runRepositoryScript('scripts/release/verify-run-metadata.mjs', argumentsFor(pullRequestPath))
    assert.equal(open.status, 0, open.stderr)

    const openRecoveryPath = resolve(fixture.root, 'open-recovery-pull-request.json')
    await writeFile(openRecoveryPath, JSON.stringify({
      ...validPullRequest({
        number: Number(fixture.pullRequestNumber),
        repository: fixture.repository,
        baseSha: fixture.releaseCommit,
        headSha: fixture.headSha,
      }),
      merged: false,
    }))
    const openRecovery = runRepositoryScript(
      'scripts/release/verify-run-metadata.mjs',
      argumentsFor(openRecoveryPath),
    )
    assert.equal(openRecovery.status, 0, openRecovery.stderr)

    const recoveryPath = resolve(fixture.root, 'recovery-pull-request.json')
    await writeFile(recoveryPath, JSON.stringify({
      ...validPullRequest({
        number: Number(fixture.pullRequestNumber),
        repository: fixture.repository,
        baseSha: fixture.releaseCommit,
        headSha: fixture.headSha,
      }),
      state: 'closed',
      merged: true,
      merge_commit_sha: null,
    }))
    const recovery = runRepositoryScript('scripts/release/verify-run-metadata.mjs', argumentsFor(recoveryPath))
    assert.equal(recovery.status, 0, recovery.stderr)

    const changedPath = resolve(fixture.root, 'changed-pull-request.json')
    await writeFile(changedPath, JSON.stringify({
      ...validPullRequest({
        number: Number(fixture.pullRequestNumber),
        repository: fixture.repository,
        baseSha: fixture.baseSha,
        headSha: '9'.repeat(40),
      }),
      merged: false,
    }))
    const changed = runRepositoryScript('scripts/release/verify-run-metadata.mjs', argumentsFor(changedPath))
    assert.notEqual(changed.status, 0)
    assert.match(changed.stderr, /changed after the candidate/)
  } finally {
    await rm(fixture.root, {recursive: true, force: true})
  }
})

test('release bootstrap CI validates pull requests to main without secrets', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-bootstrap-ci.yml')

  assert.match(workflow, /^\s*pull_request:\s*$/m)
  assert.match(workflow, /branches:\s*\[?main\]?/)
  assert.match(workflow, /contents:\s*read/)
  assert.doesNotMatch(workflow, /\bsecrets\./)
  assert.doesNotMatch(workflow, /contents:\s*write/)
})

test('develop CI covers feature-to-develop and develop-to-main product pull requests', async () => {
  const workflow = await readRepositoryFile('.github/workflows/develop-ci.yml')
  const expectedCondition = "github.event_name == 'push' || (github.event_name == 'pull_request' && (github.event.pull_request.base.ref == 'develop' || github.event.pull_request.head.ref == 'develop'))"

  for (const jobName of ['verify', 'node-17-runtime']) {
    assert.match(jobBlock(workflow, jobName), new RegExp(`^ {4}if: ${escapeRegExp(expectedCondition)}$`, 'm'))
  }
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head\.ref == 'develop'\)\s*$/m)
})

test('release automation pull requests exercise the secretless Windows signing contract', async () => {
  const workflow = await readRepositoryFile('.github/workflows/develop-ci.yml')
  const signingContract = jobBlock(workflow, 'signing-certificate-contract')

  assert.doesNotMatch(signingContract, /^    if:/m)
  assert.doesNotMatch(signingContract, /\bsecrets\./)
  assert.match(signingContract, /verify-signing-certificate\.ps1/)
  assert.match(signingContract, /verify-zxp-signature\.ps1/)
})

test('trusted workflows pin actions and disable shared tool caches', async () => {
  for (const path of [
    '.github/workflows/develop-ci.yml',
    '.github/workflows/release-bootstrap-ci.yml',
    '.github/workflows/release-candidate.yml',
    '.github/workflows/release-finalize.yml',
  ]) {
    const workflow = await readRepositoryFile(path)
    for (const reference of workflow.matchAll(actionReferencePattern)) {
      assert.match(reference[1], /@[0-9a-f]{40}$/, `${path} contains an unpinned action`)
    }
    assert.doesNotMatch(workflow, /cache:\s*true/, `${path} enables a shared tool cache`)
  }
})

test('action pin scanner includes references with trailing comments', () => {
  const workflow = '- uses: jdx/mise-action@main # deliberately unpinned fixture\n'
  const references = [...workflow.matchAll(actionReferencePattern)].map(match => match[1])

  assert.deepEqual(references, ['jdx/mise-action@main'])
  assert.doesNotMatch(references[0], /@[0-9a-f]{40}$/)
})

test('product pull requests cannot replace trusted recovery or signing automation', async () => {
  const [inventoryText, verifier] = await Promise.all([
    readRepositoryFile('release/trusted-release-automation.txt'),
    readRepositoryFile('scripts/release/verify-unsigned-candidate.mjs'),
  ])
  const inventory = inventoryText.split(/\r?\n/).filter(Boolean)
  assert.deepEqual(inventory, [...inventory].sort())
  assert.equal(new Set(inventory).size, inventory.length)
  for (const path of [
    '.github/workflows/develop-ci.yml',
    '.github/workflows/release-candidate.yml',
    '.github/workflows/release-finalize.yml',
    'mise.toml',
    'scripts/release/finalize-release.sh',
    'scripts/release/verify-unsigned-candidate.mjs',
  ]) {
    assert.ok(inventory.includes(path), `Missing trusted automation path: ${path}`)
  }
  assert.match(verifier, /filePath\.startsWith\('\.github\/workflows\/'\)/)
  assert.match(verifier, /baseObject !== headObject/)
})

test('unsigned metadata writer and verifier require exactly one release parent', async () => {
  const [writer, verifier] = await Promise.all([
    readRepositoryFile('scripts/release/write-unsigned-metadata.mjs'),
    readRepositoryFile('scripts/release/verify-unsigned-candidate.mjs'),
  ])

  assert.match(writer, /releaseParents\.length !== 2/)
  assert.match(writer, /releaseParents\[0\] !== releaseCommit/)
  assert.match(writer, /releaseParent !== headSha/)
  assert.match(verifier, /show', '-s', '--format=%H %P', releaseRef/)
  assert.match(verifier, /`\$\{metadata\.release\.commit\} \$\{headSha\}`/)
})

test('legacy source-selectable signing workflow is removed', async () => {
  await assert.rejects(
    readRepositoryFile('.github/workflows/build-zxp-release.yml'),
    {code: 'ENOENT'},
  )
})

test('release candidate workflow is manually dispatched from main only', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-candidate.yml')

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m)
  assert.match(
    workflow,
    /github\.ref\s*==\s*['"]refs\/heads\/main['"]/,
  )
  assert.doesNotMatch(workflow, /^\s*pull_request_target:\s*$/m)
})

test('release candidate workflow keeps the pull request build job secretless', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-candidate.yml')
  const buildJob = jobBlock(workflow, 'build-release-tree')

  assert.doesNotMatch(buildJob, /^\s{4}environment:/m)
  assert.doesNotMatch(buildJob, /\bsecrets\./)
  assert.match(buildJob, /ref:\s*\$\{\{\s*needs\.inspect\.outputs\.head_sha\s*\}\}/)
})

test('release candidate workflow confines signing secrets to the trusted signing job', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-candidate.yml')
  const signingJob = jobBlock(workflow, 'sign-candidate')

  assert.match(signingJob, /^\s{4}environment:\s*release-signing\s*$/m)
  assert.match(signingJob, /ZXP_CERTIFICATE_P12_BASE64/)
  assert.match(signingJob, /ZXP_CERTIFICATE_PASSWORD/)
  assert.match(signingJob, /ZXP_SIGNING_CERT_FINGERPRINT_SHA256/)
})

test('release signing job checks out trusted main instead of pull request code', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-candidate.yml')
  const signingJob = jobBlock(workflow, 'sign-candidate')

  assert.equal(
    [...signingJob.matchAll(/uses:\s*actions\/checkout@[0-9a-f]{40}/g)].length,
    1,
    'The signing job must contain exactly one trusted checkout',
  )
  assert.match(signingJob, /ref:\s*\$\{\{\s*github\.sha\s*\}\}/)
  assert.doesNotMatch(signingJob, /ref:\s*\$\{\{\s*(?:inputs\.pr_head_sha|needs\.[^}]*head_sha)/)
  assert.doesNotMatch(signingJob, /^\s+path:\s*source\s*$/m)
})

test('release signing job never executes files from the downloaded unsigned artifact', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-candidate.yml')
  const signingJob = jobBlock(workflow, 'sign-candidate')

  assert.doesNotMatch(signingJob, /working-directory:\s*(?:\.\/)?unsigned(?:\/|\s*$)/m)
  assert.doesNotMatch(
    signingJob,
    /(?:node|bash|sh|pwsh|powershell|yarn|npm|mise)\s+[^\n]*\bunsigned[\\/]/i,
  )
  assert.doesNotMatch(
    signingJob,
    /(?:Start-Process|Import-Module|Invoke-Expression|\biex\b|&\s+(?:\.\\)?unsigned[\\/])/i,
  )
})

test('release finalizer requires the exact tested candidate identity', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-finalize.yml')

  for (const input of ['pr_number', 'candidate_run_id', 'candidate_run_attempt', 'expected_zxp_sha256']) {
    assert.match(workflow, new RegExp(`^ {6}${input}:$`, 'm'))
  }
  assert.match(workflow, /^\s{4}environment:\s*production-release\s*$/m)
  assert.match(
    workflow,
    /actions\/runs\/\$CANDIDATE_RUN_ID\/attempts\/\$CANDIDATE_RUN_ATTEMPT"/,
  )
  assert.match(
    workflow,
    /actions\/runs\/\$CANDIDATE_RUN_ID\/attempts\/\$CANDIDATE_RUN_ATTEMPT\/jobs\?per_page=100/,
  )
})

test('release finalizer is manually dispatched from main only', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-finalize.yml')

  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m)
  assert.match(
    workflow,
    /github\.ref\s*==\s*['"]refs\/heads\/main['"]/,
  )
  assert.doesNotMatch(workflow, /^\s*pull_request_target:\s*$/m)
})

test('release finalizer isolates mise from product-tree configuration', async () => {
  const workflow = await readRepositoryFile('.github/workflows/release-finalize.yml')

  for (const contract of [
    /MISE_OVERRIDE_CONFIG_FILENAMES:\s*mise\.toml/,
    /MISE_OVERRIDE_TOOL_VERSIONS_FILENAMES:\s*none/,
    /MISE_CEILING_PATHS:\s*\$\{\{\s*github\.workspace\s*\}\}\/\.\./,
    /MISE_CONFIG_DIR:/,
    /MISE_SYSTEM_CONFIG_DIR:/,
    /MISE_NO_ENV:\s*'1'/,
    /MISE_NO_HOOKS:\s*'1'/,
    /install:\s*false/,
    /env:\s*false/,
    /export_path:\s*false/,
    /mise -C "\$GITHUB_WORKSPACE" install --locked/,
  ]) {
    assert.match(workflow, contract)
  }
  assert.doesNotMatch(workflow, /MISE_(?:CONFIG|SYSTEM_CONFIG)_DIR:\s*\$\{\{\s*runner\./)
})

test('release finalizer has no automated After Effects matrix gate', async () => {
  const [workflow, candidateWorkflow, releaseProcedure] = await Promise.all([
    readRepositoryFile('.github/workflows/release-finalize.yml'),
    readRepositoryFile('.github/workflows/release-candidate.yml'),
    readRepositoryFile('release/PR_RELEASE.md'),
  ])

  assert.doesNotMatch(workflow, /self-hosted/i)
  assert.doesNotMatch(workflow, /ae[-_ ]validation|ae\s*2025|ae\s*2026|2\s*[x×]\s*2/i)
  assert.match(candidateWorkflow, /Required approval matrix: Windows\/macOS x After Effects 2025\/2026/)
  for (const environment of [
    'Windows with After Effects 2025',
    'Windows with After Effects 2026',
    'macOS with After Effects 2025',
    'macOS with After Effects 2026',
  ]) {
    assert.match(releaseProcedure, new RegExp(escapeRegExp(environment)))
  }
})

test('release finalizer leases main against the pull request base SHA', async () => {
  const script = await readRepositoryFile('scripts/release/finalize-release.sh')

  assert.match(script, /pr_base=.*json_value pullRequest base sha/)
  assert.match(script, /--force-with-lease=["']?refs\/heads\/main:\$pr_base/)
  assert.doesNotMatch(script, /--force-with-lease=["']?refs\/heads\/main:\$trigger_sha/)
})

test('release finalizer publishes exactly the ZXP and its SHA-256 sidecar', async () => {
  const script = await readRepositoryFile('scripts/release/finalize-release.sh')

  assert.match(script, /zxp=.*bodygroovn-v6\.0\.0\.zxp/)
  assert.match(script, /sidecar=.*bodygroovn-v6\.0\.0\.zxp\.sha256/)
  assert.match(
    script,
    /names_output.*bodygroovn-v6\.0\.0\.zxp\\nbodygroovn-v6\.0\.0\.zxp\.sha256/,
  )
  assert.match(script, /verify_release_assets "\$draft_id"/)
  assert.match(script, /verify_release_identity "\$published_id" false/)
  assert.match(script, /verify_release_identity "\$draft_id" true/)
  assert.match(script, /--jq \.prerelease/)
  assert.match(script, /--jq \.name/)
  assert.match(script, /published_ids/)
  assert.match(script, /Verified already-published v6\.0\.0/)
  assert.match(
    script,
    /verify_release_assets "\$draft_id"\s+verify_remote_release_refs\s+gh api --method PATCH/,
    'The draft asset digests and remote refs must be verified before publication',
  )
  const pushIndex = script.indexOf('git push --atomic')
  const createDraftCallIndex = script.lastIndexOf('\n  create_release_draft\n')
  assert.ok(pushIndex >= 0 && createDraftCallIndex >= 0 && pushIndex < createDraftCallIndex,
    'The release commit and tag must be remotely reachable before draft creation')
  assert.doesNotMatch(script, /gh release upload[^\n]*(?:git\.bundle|release-provenance|payload-manifest|zxp-verify)/)
})
