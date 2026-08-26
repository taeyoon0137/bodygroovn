import { execFileSync } from 'node:child_process'

const output = execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim()
const changed = output ? output.split('\n').map((line) => line.slice(3).replace(/^"|"$/g, '')) : []
const allowed = new Set([
  '.changeset/independent-bodygroovn-release.md',
  'CHANGELOG.md',
  'bundle/CSXS/manifest.xml',
  'bundle/jsx/helpers/versionHelper.jsx',
  'package.json',
  'yarn.lock',
])
for (const file of changed) if (!allowed.has(file)) throw new Error(`Unexpected release-version change: ${file}`)
for (const required of ['.changeset/independent-bodygroovn-release.md', 'bundle/CSXS/manifest.xml', 'bundle/jsx/helpers/versionHelper.jsx', 'package.json']) {
  if (!changed.includes(required)) throw new Error(`Missing expected release-version change: ${required}`)
}
console.log(`Verified ${changed.length} release-version changes.`)
