import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

await import('./check-csinterface.mjs');

const echoscriptUrl = new URL('../.yarn/plugins/@echoscript-yarn-plugin.cjs', import.meta.url);
const echoscript = await readFile(echoscriptUrl);
const echoscriptSha256 = createHash('sha256').update(echoscript).digest('hex');
const expectedEchoscriptSha256 = 'ca9f43406c51d1e086bd8464f27d33f79c45a1bd59338ff0c24bc1073a506be3';
const miseConfig = await readFile(new URL('../mise.toml', import.meta.url), 'utf8');
const expectedMiseConfig = `[tools]
node = "24.19.0"
"aqua:yarnpkg/berry" = "4.18.0"

[settings]
activate_aggressive = true
lockfile = true
lockfile_platforms = [
  "linux-x64",
  "macos-x64",
  "macos-arm64",
  "windows-x64",
]
`;
const miseLock = await readFile(new URL('../mise.lock', import.meta.url), 'utf8');

if (echoscriptSha256 !== expectedEchoscriptSha256) {
  throw new Error(`Echoscript SHA-256 mismatch: expected ${expectedEchoscriptSha256}, received ${echoscriptSha256}`);
}

if (miseConfig !== expectedMiseConfig) {
  throw new Error('mise.toml does not match the pinned bodygroovn toolchain contract.');
}

const lockedInputs = [
  'lockfile_version = 1',
  'https://repo.yarnpkg.com/4.18.0/packages/yarnpkg-cli/bin/yarn.js',
  'sha256:f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4',
  'sha256:8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d',
  'sha256:d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316',
  'sha256:57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73',
];
for (const lockedInput of lockedInputs) {
  if (!miseLock.includes(lockedInput)) throw new Error(`mise.lock is missing ${lockedInput}.`);
}
for (const platform of ['linux-x64', 'macos-x64', 'macos-arm64', 'windows-x64']) {
  const occurrences = miseLock.match(new RegExp(`platforms\\.${platform}`, 'g'))?.length ?? 0;
  if (occurrences !== 2) throw new Error(`mise.lock does not contain both tool entries for ${platform}.`);
}

console.log(`Verified pinned Echoscript bundle (${echoscript.byteLength} bytes, ${echoscriptSha256}).`);
console.log('Verified the pinned cross-platform mise toolchain lock.');
