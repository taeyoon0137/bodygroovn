import { lstat } from 'node:fs/promises'
import path from 'node:path'

export const validationEnvironments = ['macos-2025', 'macos-2026', 'windows-2025', 'windows-2026']

export const requiredChecks = [
  'installRemove',
  'menuPanel',
  'standard',
  'segmented',
  'demo',
  'standalone',
  'imagesFontsAudioExpressionsAnnotations',
  'essentialPropertiesGradientTextSlots',
  'pngPalettesAndPreservation',
  'iosAndroidReports',
  'localPreviewAndGzipPlayer',
  'serverRestartTokenRotation',
  'noUiFreeze',
  'canonicalDiffApproved',
]

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label)
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (actual.join('\n') !== required.join('\n')) throw new Error(`${label} keys do not match the schema`)
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
}

function assertIdentity(value, label) {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) throw new Error(`${label} must be a decimal string`)
}

export async function validateAeRecord(record, expected = {}) {
  assertExactKeys(record, ['schemaVersion', 'os', 'ae', 'candidate', 'validation', 'checks', 'human', 'harness'], 'record')
  if (record.schemaVersion !== 1) throw new Error('Unsupported validation schema version')
  if (!['windows', 'macos'].includes(record.os)) throw new Error('Invalid validation operating system')

  assertExactKeys(record.ae, ['major', 'version', 'build'], 'ae')
  if (!['2025', '2026'].includes(record.ae.major)) throw new Error('Invalid After Effects major version')
  assertNonemptyString(record.ae.version, 'After Effects version')
  assertNonemptyString(record.ae.build, 'After Effects build')

  assertExactKeys(record.candidate, ['runId', 'runAttempt', 'zxpSha256'], 'candidate')
  assertIdentity(record.candidate.runId, 'Candidate run ID')
  assertIdentity(record.candidate.runAttempt, 'Candidate run attempt')
  if (typeof record.candidate.zxpSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.candidate.zxpSha256)) {
    throw new Error('Candidate ZXP SHA-256 must be lowercase hexadecimal')
  }

  assertExactKeys(record.validation, ['runId', 'runAttempt'], 'validation')
  assertIdentity(record.validation.runId, 'Validation run ID')
  assertIdentity(record.validation.runAttempt, 'Validation run attempt')

  assertExactKeys(record.checks, requiredChecks, 'checks')
  for (const check of requiredChecks) if (record.checks[check] !== true) throw new Error(`Validation check did not pass: ${check}`)

  assertExactKeys(record.human, ['reviewer', 'approved'], 'human')
  assertNonemptyString(record.human.reviewer, 'Human reviewer')
  if (record.human.approved !== true) throw new Error('Human approval is required')

  assertObject(record.harness, 'harness')
  if (!Object.hasOwn(record.harness, 'logArtifact')) throw new Error('Harness log artifact is required')
  const expectedLogName = `ae-validation-${record.os}-${record.ae.major}.log`
  if (typeof record.harness.logArtifact !== 'string' || record.harness.logArtifact !== expectedLogName) {
    throw new Error('Harness log artifact identity mismatch')
  }

  const expectedValues = [
    ['os', record.os, expected.os],
    ['After Effects major', record.ae.major, expected.aeMajor],
    ['candidate run ID', record.candidate.runId, expected.candidateRunId],
    ['candidate run attempt', record.candidate.runAttempt, expected.candidateRunAttempt],
    ['validation run ID', record.validation.runId, expected.validationRunId],
    ['validation run attempt', record.validation.runAttempt, expected.validationRunAttempt],
    ['candidate ZXP SHA-256', record.candidate.zxpSha256, expected.candidateSha256],
  ]
  for (const [label, actual, wanted] of expectedValues) {
    if (wanted !== undefined && actual !== `${wanted}`) throw new Error(`Validation ${label} mismatch`)
  }

  if (expected.logPath) {
    const expectedPath = path.resolve(expected.logPath)
    if (path.basename(expectedPath) !== record.harness.logArtifact) throw new Error('Harness log path mismatch')
    const stats = await lstat(expectedPath)
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size === 0) {
      throw new Error('Harness log artifact is not a non-empty regular file')
    }
  }

  return `${record.os}-${record.ae.major}`
}
