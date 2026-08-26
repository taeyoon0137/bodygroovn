import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { validateAeRecord, validationEnvironments } from './ae-record-validator.mjs'

const [directory, runId, runAttempt, validationRunId, validationRunAttempt, candidateSha256] = process.argv.slice(2)
const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()
if (files.length !== 4) throw new Error(`Expected four validation records, received ${files.length}`)
const records = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'))))
const environments = await Promise.all(records.map(record => validateAeRecord(record, {
  candidateRunId: runId,
  candidateRunAttempt: runAttempt,
  validationRunId,
  validationRunAttempt,
  candidateSha256,
  logPath: path.join(directory, `ae-validation-${record.os}-${record.ae.major}.log`),
})))
environments.sort()
if (environments.join('\n') !== validationEnvironments.join('\n')) throw new Error(`Validation matrix mismatch: ${environments.join(', ')}`)
console.log(`Verified complete 2x2 validation set for ${candidateSha256}.`)
