import { readFile } from 'node:fs/promises'

const status = JSON.parse(await readFile(process.argv[2], 'utf8'))
const expected = [{ name: '@taeyoon0137/bodygroovn', type: 'major', oldVersion: '5.12.0', newVersion: '6.0.0' }]
const releases = status.releases?.map(({ name, type, oldVersion, newVersion }) => ({ name, type, oldVersion, newVersion }))
if (JSON.stringify(releases) !== JSON.stringify(expected)) {
  throw new Error(`Expected exactly ${JSON.stringify(expected)}, received ${JSON.stringify(status.releases)}`)
}
console.log('Verified the single pending bodygroovn 6.0.0 release.')
