import { readFile } from 'node:fs/promises'

const [candidateWorkflowPath, candidateRunPath, validationWorkflowPath, validationRunPath, provenancePath,
  candidateRunId, candidateRunAttempt, validationRunId, validationRunAttempt, repository] = process.argv.slice(2)

if (!repository) {
  throw new Error('Usage: verify-run-metadata.mjs <candidate-workflow> <candidate-run> <validation-workflow> <validation-run> <provenance> <candidate-id> <candidate-attempt> <validation-id> <validation-attempt> <repository>')
}

const readJson = async file => JSON.parse(await readFile(file, 'utf8'))
const [candidateWorkflow, candidateRun, validationWorkflow, validationRun, provenance] = await Promise.all([
  readJson(candidateWorkflowPath),
  readJson(candidateRunPath),
  readJson(validationWorkflowPath),
  readJson(validationRunPath),
  readJson(provenancePath),
])

function assertDecimal(value, expected, label) {
  if (!/^[0-9]+$/.test(`${expected}`) || `${value}` !== `${expected}`) throw new Error(`${label} mismatch`)
}

function assertWorkflow(workflow, run, expectedPath, label) {
  if (!Number.isSafeInteger(workflow.id) || workflow.id <= 0 || workflow.path !== expectedPath) {
    throw new Error(`${label} workflow API identity mismatch`)
  }
  if (run.workflow_id !== workflow.id) throw new Error(`${label} run is not bound to the expected workflow ID`)
}

function assertRun(run, expected, label) {
  assertDecimal(run.id, expected.id, `${label} run ID`)
  assertDecimal(run.run_attempt, expected.attempt, `${label} run attempt`)
  if (run.event !== expected.event
    || run.head_branch !== 'main'
    || run.status !== 'completed'
    || run.conclusion !== 'success'
    || run.repository?.full_name !== repository
    || run.head_sha !== expected.headSha) {
    throw new Error(`${label} run metadata mismatch`)
  }
}

if (provenance.candidate?.runId !== `${candidateRunId}` || provenance.candidate?.runAttempt !== `${candidateRunAttempt}`) {
  throw new Error('Candidate provenance run identity mismatch')
}
if (!/^[0-9a-f]{40}$/.test(provenance.release?.parent)) throw new Error('Invalid release parent SHA')

assertWorkflow(candidateWorkflow, candidateRun, '.github/workflows/release-candidate.yml', 'Candidate')
assertWorkflow(validationWorkflow, validationRun, '.github/workflows/ae-validation.yml', 'Validation')
assertRun(candidateRun, {
  id: candidateRunId,
  attempt: candidateRunAttempt,
  event: 'push',
  headSha: provenance.release.parent,
}, 'Candidate')
assertRun(validationRun, {
  id: validationRunId,
  attempt: validationRunAttempt,
  event: 'workflow_dispatch',
  headSha: provenance.release.parent,
}, 'Validation')

console.log(`Verified candidate run ${candidateRunId}/${candidateRunAttempt} and validation run ${validationRunId}/${validationRunAttempt}.`)
