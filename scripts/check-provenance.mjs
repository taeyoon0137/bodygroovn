import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

await import('./check-csinterface.mjs');

const echoscriptUrl = new URL('../.yarn/plugins/@echoscript-yarn-plugin.cjs', import.meta.url);
const echoscript = await readFile(echoscriptUrl);
const echoscriptSha256 = createHash('sha256').update(echoscript).digest('hex');
const expectedEchoscriptSha256 = 'ca9f43406c51d1e086bd8464f27d33f79c45a1bd59338ff0c24bc1073a506be3';

if (echoscriptSha256 !== expectedEchoscriptSha256) {
  throw new Error(`Echoscript SHA-256 mismatch: expected ${expectedEchoscriptSha256}, received ${echoscriptSha256}`);
}

console.log(`Verified pinned Echoscript bundle (${echoscript.byteLength} bytes, ${echoscriptSha256}).`);
