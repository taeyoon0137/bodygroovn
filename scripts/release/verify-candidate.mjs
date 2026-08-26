import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const [directory, runId, runAttempt] = process.argv.slice(2)
const expectedFiles = ['bodygroovn-v6.0.0.git.bundle', 'bodygroovn-v6.0.0.zxp', 'bodygroovn-v6.0.0.zxp.sha256', 'release-provenance.json', 'unsigned-payload-manifest.json', 'zxp-verify.txt'].sort()
const artifactFiles = ['bodygroovn-v6.0.0.git.bundle', 'bodygroovn-v6.0.0.zxp', 'bodygroovn-v6.0.0.zxp.sha256', 'unsigned-payload-manifest.json', 'zxp-verify.txt'].sort()
const actualFiles = (await readdir(directory)).sort()
if (actualFiles.join('\n') !== expectedFiles.join('\n')) throw new Error(`Candidate inventory mismatch: ${actualFiles.join(', ')}`)
for (const name of expectedFiles) {
  const stats = await lstat(path.join(directory, name))
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Candidate entry is not a regular file: ${name}`)
}
const provenance = JSON.parse(await readFile(path.join(directory, 'release-provenance.json'), 'utf8'))
if (provenance.schemaVersion !== 1) throw new Error('Candidate provenance schema mismatch')
if (`${provenance.candidate.runId}` !== runId || `${provenance.candidate.runAttempt}` !== runAttempt) throw new Error('Candidate run identity mismatch')
if (provenance.release.version !== '6.0.0' || provenance.release.tag !== 'v6.0.0') throw new Error('Candidate release identity mismatch')
for (const [label, value] of Object.entries({ parent: provenance.release.parent, commit: provenance.release.commit, tree: provenance.release.tree })) {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`Invalid release ${label}`)
}
const expectedSigner = {
  sourceCommit: 'fcee8de5537d2dd2ed3d91d5a495b7041155b280',
  sourcePath: 'ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe',
  bytes: 4_542_464,
  sha256: 'ffc2223167225ce61d024eb463fc5ad1a1be16133f99ef334a646f7311916c98',
}
if (JSON.stringify(provenance.signing?.signer) !== JSON.stringify(expectedSigner)
  || provenance.signing?.timestampAuthority !== 'http://timestamp.digicert.com/'
  || !/^[0-9a-f]{64}$/.test(provenance.signing?.certificateFingerprintSha256)) {
  throw new Error('Signing provenance mismatch')
}
const expectedToolchain = {
  mise: '2026.8.14',
  miseAction: 'c2a87611a18de5b3828c5652fe268e992400cb5c',
  node: '24.19.0',
  yarn: '4.18.0',
  yarnSha256: 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5',
}
if (JSON.stringify(provenance.toolchain) !== JSON.stringify(expectedToolchain)) {
  throw new Error('Candidate toolchain provenance mismatch')
}
if (!provenance.artifacts || typeof provenance.artifacts !== 'object' || Array.isArray(provenance.artifacts)) {
  throw new Error('Candidate artifact digests are missing')
}
const artifactNames = Object.keys(provenance.artifacts).sort()
if (artifactNames.join('\n') !== artifactFiles.join('\n')) throw new Error('Candidate artifact digest inventory mismatch')
for (const name of artifactFiles) {
  const expected = provenance.artifacts[name]
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) throw new Error(`Invalid ${name} digest`)
  const actual = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex')
  if (actual !== expected) throw new Error(`${name} digest mismatch`)
}
const zxpBytes = await readFile(path.join(directory, 'bodygroovn-v6.0.0.zxp'))
const zxpDigest = createHash('sha256').update(zxpBytes).digest('hex')
const sidecarBytes = await readFile(path.join(directory, 'bodygroovn-v6.0.0.zxp.sha256'))
const expectedSidecar = Buffer.from(`${zxpDigest}  bodygroovn-v6.0.0.zxp\n`, 'utf8')
if (!sidecarBytes.equals(expectedSidecar)) throw new Error('Candidate SHA-256 sidecar byte format mismatch')
if ((await readFile(path.join(directory, 'zxp-verify.txt'))).byteLength === 0) throw new Error('ZXP verification evidence is empty')
console.log(`Verified candidate ${runId}/${runAttempt} (${provenance.release.commit}).`)
