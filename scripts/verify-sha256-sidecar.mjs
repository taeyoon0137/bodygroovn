import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const input = process.argv[2]
const sidecar = process.argv[3] || (input ? `${input}.sha256` : '')
if (!input || !sidecar) {
  throw new Error('Usage: node scripts/verify-sha256-sidecar.mjs <file> [sidecar]')
}

const [inputBytes, sidecarBytes] = await Promise.all([readFile(input), readFile(sidecar)])
const digest = createHash('sha256').update(inputBytes).digest('hex')
const expected = Buffer.from(`${digest}  ${path.basename(input)}\n`, 'utf8')
if (!sidecarBytes.equals(expected)) {
  throw new Error('SHA-256 sidecar bytes do not match the required lowercase, two-space, LF format')
}
console.log(`Verified ${sidecar}.`)
