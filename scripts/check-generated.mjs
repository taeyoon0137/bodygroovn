import { access, readFile } from 'node:fs/promises'

const guard = '/* eslint-disable */var define = define || null;'
const [playerSource, previewSource] = await Promise.all([
  readFile(new URL('../player/lottie.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lottie.js', import.meta.url), 'utf8'),
])
const expected = `${guard}${playerSource}`

if (previewSource !== expected) {
  throw new Error(
    'src/lottie.js is stale; run mise exec -- node scripts/ci/run-yarn.mjs build to regenerate it from player/lottie.js',
  )
}

try {
  await access(new URL('../src/bodymovin.js', import.meta.url))
  throw new Error('src/bodymovin.js must remain deleted; src/lottie.js is the only preview player source')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

console.log('Verified the preview player generation relationship and obsolete source absence.')
