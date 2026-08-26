import {createHash} from 'node:crypto'
import {lstat, readFile, readdir} from 'node:fs/promises'
import path from 'node:path'

const [directory, repository, pullRequestNumber, runId, runAttempt, unsignedArtifactDigest,
  expectedZxpDigest] = process.argv.slice(2)
const shaPattern = /^[0-9a-f]{40}$/
const digestPattern = /^[0-9a-f]{64}$/
const expectedFiles = [
  'bodygroovn-v6.0.0.git.bundle',
  'bodygroovn-v6.0.0.zxp',
  'bodygroovn-v6.0.0.zxp.sha256',
  'release-provenance.json',
  'unsigned-payload-manifest.json',
  'zxp-verify.txt',
].sort()
const artifactFiles = expectedFiles.filter(name => name !== 'release-provenance.json')
const expectedToolchain = {
  mise: '2026.8.14',
  miseAction: 'c2a87611a18de5b3828c5652fe268e992400cb5c',
  node: '24.19.0',
  yarn: '4.18.0',
  yarnSha256: 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5',
}
const expectedSigner = {
  sourceCommit: 'fcee8de5537d2dd2ed3d91d5a495b7041155b280',
  sourcePath: 'ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe',
  bytes: 4_542_464,
  sha256: 'ffc2223167225ce61d024eb463fc5ad1a1be16133f99ef334a646f7311916c98',
}

if (!directory || !repository
  || !/^[1-9][0-9]*$/.test(`${pullRequestNumber}`)
  || !/^[1-9][0-9]*$/.test(`${runId}`)
  || !/^[1-9][0-9]*$/.test(`${runAttempt}`)
  || !digestPattern.test(unsignedArtifactDigest)
  || !digestPattern.test(expectedZxpDigest)) {
  throw new Error('Invalid candidate verification input')
}

const actualFiles = (await readdir(directory)).sort()
if (actualFiles.join('\n') !== expectedFiles.join('\n')) {
  throw new Error(`Candidate inventory mismatch: ${actualFiles.join(', ')}`)
}
for (const name of expectedFiles) {
  const stats = await lstat(path.join(directory, name))
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Candidate entry is not a regular file: ${name}`)
  }
}

const provenance = JSON.parse(await readFile(path.join(directory, 'release-provenance.json'), 'utf8'))
if (provenance.schemaVersion !== 2
  || provenance.repository !== repository
  || provenance.workflow?.path !== '.github/workflows/release-candidate.yml'
  || provenance.workflow?.event !== 'workflow_dispatch'
  || !shaPattern.test(provenance.workflow?.commit)
  || typeof provenance.workflow?.actor !== 'string'
  || provenance.workflow.actor.length === 0
  || provenance.workflow.actor.length > 100
  || provenance.pullRequest?.number !== Number(pullRequestNumber)
  || provenance.pullRequest?.base?.repository !== repository
  || provenance.pullRequest?.base?.ref !== 'main'
  || !shaPattern.test(provenance.pullRequest?.base?.sha)
  || provenance.pullRequest?.head?.repository !== repository
  || provenance.pullRequest?.head?.ref !== 'develop'
  || !shaPattern.test(provenance.pullRequest?.head?.sha)
  || provenance.workflow.commit !== provenance.pullRequest.base.sha
  || provenance.candidate?.runId !== `${runId}`
  || provenance.candidate?.runAttempt !== `${runAttempt}`
  || provenance.candidate?.unsignedArtifactName !== `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`
  || provenance.candidate?.unsignedArtifactSha256 !== unsignedArtifactDigest
  || provenance.candidate?.artifactName !== `release-candidate-v6.0.0-${runId}-${runAttempt}`
  || provenance.release?.version !== '6.0.0'
  || provenance.release?.tag !== 'v6.0.0'
  || provenance.release?.parent !== provenance.pullRequest.head.sha
  || !shaPattern.test(provenance.release?.commit)
  || !shaPattern.test(provenance.release?.tree)) {
  throw new Error('Candidate provenance trust binding mismatch')
}
if (JSON.stringify(provenance.toolchain) !== JSON.stringify(expectedToolchain)) {
  throw new Error('Candidate toolchain provenance mismatch')
}
if (JSON.stringify(provenance.signing?.signer) !== JSON.stringify(expectedSigner)
  || provenance.signing?.timestampAuthority !== 'http://timestamp.digicert.com/'
  || !digestPattern.test(provenance.signing?.certificateFingerprintSha256)) {
  throw new Error('Signing provenance mismatch')
}
if (!provenance.artifacts || typeof provenance.artifacts !== 'object' || Array.isArray(provenance.artifacts)
  || Object.keys(provenance.artifacts).sort().join('\n') !== artifactFiles.join('\n')) {
  throw new Error('Candidate artifact digest inventory mismatch')
}

for (const name of artifactFiles) {
  const expected = provenance.artifacts[name]
  if (!digestPattern.test(expected)) throw new Error(`Invalid ${name} digest`)
  const actual = createHash('sha256')
    .update(await readFile(path.join(directory, name)))
    .digest('hex')
  if (actual !== expected) throw new Error(`${name} digest mismatch`)
}
if (provenance.artifacts['bodygroovn-v6.0.0.zxp'] !== expectedZxpDigest) {
  throw new Error('Candidate ZXP digest does not match the approved digest')
}

const sidecarBytes = await readFile(path.join(directory, 'bodygroovn-v6.0.0.zxp.sha256'))
const expectedSidecar = Buffer.from(`${expectedZxpDigest}  bodygroovn-v6.0.0.zxp\n`, 'utf8')
if (!sidecarBytes.equals(expectedSidecar)) throw new Error('Candidate SHA-256 sidecar byte format mismatch')
if ((await readFile(path.join(directory, 'zxp-verify.txt'))).byteLength === 0) {
  throw new Error('ZXP verification evidence is empty')
}

const manifest = JSON.parse(await readFile(path.join(directory, 'unsigned-payload-manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 1
  || manifest.package?.name !== '@taeyoon0137/bodygroovn'
  || manifest.package?.version !== '6.0.0'
  || !Array.isArray(manifest.files)
  || manifest.files.length === 0) {
  throw new Error('Unsigned payload manifest identity mismatch')
}

console.log(`Verified candidate ${runId}/${runAttempt} for pull request #${pullRequestNumber} (${provenance.release.commit}).`)
