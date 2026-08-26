import {createHash} from 'node:crypto'
import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'

const [directory, unsignedMetadataPath, repository, pullRequestNumber, runId, runAttempt,
  certificateFingerprint, unsignedArtifactDigest] = process.argv.slice(2)
const shaPattern = /^[0-9a-f]{40}$/
const digestPattern = /^[0-9a-f]{64}$/
const expectedUnsignedArtifact = `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`
const expectedCandidateArtifact = `release-candidate-v6.0.0-${runId}-${runAttempt}`
const artifactFiles = [
  'bodygroovn-v6.0.0.git.bundle',
  'bodygroovn-v6.0.0.zxp',
  'bodygroovn-v6.0.0.zxp.sha256',
  'unsigned-payload-manifest.json',
  'zxp-verify.txt',
]

if (!directory || !unsignedMetadataPath || !repository
  || !/^[1-9][0-9]*$/.test(`${pullRequestNumber}`)
  || !/^[1-9][0-9]*$/.test(`${runId}`)
  || !/^[1-9][0-9]*$/.test(`${runAttempt}`)
  || !digestPattern.test(certificateFingerprint)
  || !digestPattern.test(unsignedArtifactDigest)) {
  throw new Error('Invalid release provenance input')
}

const unsigned = JSON.parse(await readFile(unsignedMetadataPath, 'utf8'))
if (unsigned.schemaVersion !== 1
  || unsigned.repository !== repository
  || unsigned.workflow?.path !== '.github/workflows/release-candidate.yml'
  || unsigned.workflow?.event !== 'workflow_dispatch'
  || !shaPattern.test(unsigned.workflow?.commit)
  || typeof unsigned.workflow?.actor !== 'string'
  || unsigned.workflow.actor.length === 0
  || unsigned.workflow.actor.length > 100
  || unsigned.pullRequest?.number !== Number(pullRequestNumber)
  || unsigned.pullRequest?.base?.repository !== repository
  || unsigned.pullRequest?.base?.ref !== 'main'
  || !shaPattern.test(unsigned.pullRequest?.base?.sha)
  || unsigned.pullRequest?.head?.repository !== repository
  || unsigned.pullRequest?.head?.ref !== 'develop'
  || !shaPattern.test(unsigned.pullRequest?.head?.sha)
  || unsigned.workflow.commit !== unsigned.pullRequest.base.sha
  || unsigned.candidate?.runId !== `${runId}`
  || unsigned.candidate?.runAttempt !== `${runAttempt}`
  || unsigned.candidate?.unsignedArtifactName !== expectedUnsignedArtifact
  || unsigned.release?.version !== '6.0.0'
  || unsigned.release?.tag !== 'v6.0.0'
  || unsigned.release?.parent !== unsigned.pullRequest.head.sha
  || !shaPattern.test(unsigned.release?.commit)
  || !shaPattern.test(unsigned.release?.tree)) {
  throw new Error('Unsigned release metadata does not match the trusted release request')
}

const sha256 = async name => createHash('sha256')
  .update(await readFile(path.join(directory, name)))
  .digest('hex')
const artifacts = {}
for (const name of artifactFiles) artifacts[name] = await sha256(name)

const provenance = {
  schemaVersion: 2,
  repository,
  workflow: unsigned.workflow,
  pullRequest: unsigned.pullRequest,
  candidate: {
    runId: `${runId}`,
    runAttempt: `${runAttempt}`,
    unsignedArtifactName: expectedUnsignedArtifact,
    unsignedArtifactSha256: unsignedArtifactDigest,
    artifactName: expectedCandidateArtifact,
  },
  release: unsigned.release,
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
    certificateFingerprintSha256: certificateFingerprint,
    timestampAuthority: 'http://timestamp.digicert.com/',
  },
  artifacts,
}

await writeFile(path.join(directory, 'release-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, {
  flag: 'wx',
})
console.log(`Wrote provenance for candidate ${runId}/${runAttempt} and pull request #${pullRequestNumber}.`)
