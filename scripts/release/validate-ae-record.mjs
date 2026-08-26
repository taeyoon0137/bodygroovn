import { readFile } from 'node:fs/promises'

import { validateAeRecord } from './ae-record-validator.mjs'

const [file, os, aeMajor, runId, runAttempt, validationRunId, validationRunAttempt, expectedLogPath] = process.argv.slice(2)
const record = JSON.parse(await readFile(file, 'utf8'))
await validateAeRecord(record, {
  os,
  aeMajor,
  candidateRunId: runId,
  candidateRunAttempt: runAttempt,
  validationRunId,
  validationRunAttempt,
  logPath: expectedLogPath,
})
console.log(`Validated ${os} / After Effects ${aeMajor} record.`)
