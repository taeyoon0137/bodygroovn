import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'

const [directory, repository, pullRequestNumber, baseSha, headSha, workflowCommit, actor,
  runId, runAttempt, unsignedArtifactName] = process.argv.slice(2)
const shaPattern = /^[0-9a-f]{40}$/

if (!directory || !repository
  || !/^[1-9][0-9]*$/.test(`${pullRequestNumber}`)
  || !shaPattern.test(baseSha)
  || !shaPattern.test(headSha)
  || !shaPattern.test(workflowCommit)
  || workflowCommit !== baseSha
  || !actor
  || actor.length > 100
  || !/^[1-9][0-9]*$/.test(`${runId}`)
  || !/^[1-9][0-9]*$/.test(`${runAttempt}`)
  || unsignedArtifactName !== `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`) {
  throw new Error('Invalid unsigned release metadata input')
}

const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim()
const releaseCommit = git('rev-parse', 'HEAD')
const releaseParents = git('show', '-s', '--format=%H %P', 'HEAD').split(/\s+/)
const releaseParent = releaseParents[1]
const releaseTree = git('rev-parse', 'HEAD^{tree}')

if (releaseParents.length !== 2
  || releaseParents[0] !== releaseCommit
  || releaseParent !== headSha
  || git('log', '-1', '--pretty=%s') !== 'chore(release): v6.0.0') {
  throw new Error('Release commit is not the expected child of the pull request head')
}

const metadata = {
  schemaVersion: 1,
  repository,
  workflow: {
    path: '.github/workflows/release-candidate.yml',
    commit: workflowCommit,
    event: 'workflow_dispatch',
    actor,
  },
  pullRequest: {
    number: Number(pullRequestNumber),
    base: {repository, ref: 'main', sha: baseSha},
    head: {repository, ref: 'develop', sha: headSha},
  },
  candidate: {
    runId: `${runId}`,
    runAttempt: `${runAttempt}`,
    unsignedArtifactName,
  },
  release: {
    version: '6.0.0',
    tag: 'v6.0.0',
    parent: releaseParent,
    commit: releaseCommit,
    tree: releaseTree,
  },
}

await writeFile(path.join(directory, 'unsigned-release.json'), `${JSON.stringify(metadata, null, 2)}\n`, {
  flag: 'wx',
})
console.log(`Wrote unsigned release metadata for ${releaseCommit}.`)
