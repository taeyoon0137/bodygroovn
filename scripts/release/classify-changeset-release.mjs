import { appendFile, readFile } from 'node:fs/promises'

const [statusPath, outputPath] = process.argv.slice(2)
const status = JSON.parse(await readFile(statusPath, 'utf8'))
let mode
if (Array.isArray(status.releases) && status.releases.length === 0) {
  mode = 'none'
} else {
  const expected = [{ name: '@taeyoon0137/bodygroovn', type: 'major', oldVersion: '5.12.0', newVersion: '6.0.0' }]
  const releases = status.releases?.map(({ name, type, oldVersion, newVersion }) => ({ name, type, oldVersion, newVersion }))
  if (JSON.stringify(releases) !== JSON.stringify(expected)) {
    throw new Error(`Unsupported pending release set: ${JSON.stringify(status.releases)}`)
  }
  mode = 'release'
}
if (outputPath) await appendFile(outputPath, `mode=${mode}\n`, 'utf8')
console.log(`Changeset release mode: ${mode}`)
