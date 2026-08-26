import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const input = process.argv[2]
const output = process.argv[3] || (input ? `${input}.sha256` : '')
if (!input || !output) {
  throw new Error('Usage: node scripts/write-sha256-sidecar.mjs <file> [sidecar]')
}

const digest = createHash('sha256').update(await readFile(input)).digest('hex')
const filename = path.basename(input)
const contents = `${digest}  ${filename}\n`
await writeFile(output, contents, { encoding: 'utf8', flag: 'wx' })
console.log(`Wrote ${output} for ${filename}.`)
