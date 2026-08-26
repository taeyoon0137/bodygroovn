import { readFile } from 'node:fs/promises'

const guard = '/* eslint-disable */var define = define || null;'
const [playerSource, previewSource] = await Promise.all([
  readFile(new URL('../player/lottie.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lottie.js', import.meta.url), 'utf8'),
])
const expected = `${guard}${playerSource}`

if (previewSource !== expected) {
  throw new Error('src/lottie.js is stale; run yarn build to regenerate it from player/lottie.js')
}

console.log('Verified src/lottie.js generation relationship.')
