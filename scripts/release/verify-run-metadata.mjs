import {readFile} from 'node:fs/promises'

const [candidateWorkflowPath, candidateRunPath, candidateJobsPath, pullRequestPath, provenancePath,
  repository, pullRequestNumber, runId, runAttempt, unsignedArtifactDigest,
  expectedZxpDigest] = process.argv.slice(2)
const shaPattern = /^[0-9a-f]{40}$/
const digestPattern = /^[0-9a-f]{64}$/

if (!expectedZxpDigest
  || !/^[1-9][0-9]*$/.test(`${pullRequestNumber}`)
  || !/^[1-9][0-9]*$/.test(`${runId}`)
  || !/^[1-9][0-9]*$/.test(`${runAttempt}`)
  || !digestPattern.test(unsignedArtifactDigest)
  || !digestPattern.test(expectedZxpDigest)) {
  throw new Error('Invalid run metadata verification input')
}

const readJson = async file => JSON.parse(await readFile(file, 'utf8'))
const [workflow, run, jobsResponse, pullRequest, provenance] = await Promise.all([
  readJson(candidateWorkflowPath),
  readJson(candidateRunPath),
  readJson(candidateJobsPath),
  readJson(pullRequestPath),
  readJson(provenancePath),
])

if (!Number.isSafeInteger(workflow.id) || workflow.id <= 0
  || workflow.path !== '.github/workflows/release-candidate.yml'
  || run.workflow_id !== workflow.id) {
  throw new Error('Candidate run is not bound to the trusted candidate workflow')
}
if (`${run.id}` !== `${runId}`
  || `${run.run_attempt}` !== `${runAttempt}`
  || run.event !== 'workflow_dispatch'
  || run.head_branch !== 'main'
  || run.head_sha !== provenance.workflow?.commit
  || run.actor?.login !== provenance.workflow?.actor
  || run.status !== 'completed'
  || run.conclusion !== 'success'
  || run.repository?.full_name !== repository) {
  throw new Error('Candidate workflow run metadata mismatch')
}

if (!Array.isArray(jobsResponse.jobs)) throw new Error('Candidate jobs response is invalid')
for (const name of ['inspect', 'build-release-tree', 'sign-candidate']) {
  const matches = jobsResponse.jobs.filter(job => job.name === name)
  if (matches.length !== 1
    || matches[0].status !== 'completed'
    || matches[0].conclusion !== 'success'
    || `${matches[0].run_id}` !== `${runId}`
    || `${matches[0].run_attempt}` !== `${runAttempt}`) {
    throw new Error(`Candidate job metadata mismatch: ${name}`)
  }
}

const isOpenCandidate = pullRequest.state === 'open'
  && pullRequest.draft === false
  && pullRequest.merged !== true
const isPublishedRecovery = pullRequest.state === 'closed'
  && pullRequest.merged === true

if (`${pullRequest.number}` !== `${pullRequestNumber}`
  || (!isOpenCandidate && !isPublishedRecovery)
  || pullRequest.base?.repo?.full_name !== repository
  || pullRequest.base?.ref !== 'main'
  || pullRequest.head?.repo?.full_name !== repository
  || pullRequest.head?.ref !== 'develop'
  || pullRequest.head?.sha !== provenance.pullRequest?.head?.sha) {
  throw new Error('Release pull request changed after the candidate was built')
}

if (provenance.schemaVersion !== 2
  || provenance.repository !== repository
  || provenance.workflow?.path !== '.github/workflows/release-candidate.yml'
  || provenance.workflow?.event !== 'workflow_dispatch'
  || !shaPattern.test(provenance.workflow?.commit)
  || provenance.workflow.commit !== provenance.pullRequest.base.sha
  || provenance.pullRequest?.number !== Number(pullRequestNumber)
  || provenance.pullRequest?.base?.repository !== repository
  || provenance.pullRequest?.base?.ref !== 'main'
  || !shaPattern.test(provenance.pullRequest?.base?.sha)
  || provenance.pullRequest?.head?.repository !== repository
  || provenance.pullRequest?.head?.ref !== 'develop'
  || !shaPattern.test(provenance.pullRequest?.head?.sha)
  || provenance.candidate?.runId !== `${runId}`
  || provenance.candidate?.runAttempt !== `${runAttempt}`
  || provenance.candidate?.unsignedArtifactName !== `unsigned-release-tree-v6.0.0-${runId}-${runAttempt}`
  || provenance.candidate?.unsignedArtifactSha256 !== unsignedArtifactDigest
  || provenance.candidate?.artifactName !== `release-candidate-v6.0.0-${runId}-${runAttempt}`
  || provenance.release?.version !== '6.0.0'
  || provenance.release?.tag !== 'v6.0.0'
  || provenance.release?.parent !== provenance.pullRequest.head.sha
  || !shaPattern.test(provenance.release?.commit)
  || !shaPattern.test(provenance.release?.tree)
  || provenance.artifacts?.['bodygroovn-v6.0.0.zxp'] !== expectedZxpDigest) {
  throw new Error('Candidate provenance does not match the requested finalization')
}

console.log(`Verified candidate run ${runId}/${runAttempt} and unchanged pull request #${pullRequestNumber}.`)
