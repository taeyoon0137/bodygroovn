import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const CHECK_ONLY = process.argv.includes('--check');
const packageUrl = new URL('../package.json', import.meta.url);
const versionHelperUrl = new URL('../bundle/jsx/helpers/versionHelper.jsx', import.meta.url);
const manifestUrl = new URL('../bundle/CSXS/manifest.xml', import.meta.url);

const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'));
const version = packageJson.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${String(version)}`);
}

function replaceExactlyOnce(source, expression, replacement, label) {
  const matches = source.match(expression);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected one synchronized value, found ${matches ? matches.length : 0}`);
  }
  return source.replace(expression, replacement);
}

async function synchronize(url, transforms) {
  const current = await readFile(url, 'utf8');
  const expected = transforms.reduce((value, transform) => transform(value), current);
  if (current === expected) {
    return false;
  }
  if (CHECK_ONLY) {
    throw new Error(`${url.pathname} is not synchronized with package.json version ${version}`);
  }
  await writeFile(url, expected, 'utf8');
  return true;
}

const versionHelperChanged = await synchronize(versionHelperUrl, [
  (source) => replaceExactlyOnce(
    source,
    /var productVersion = '[^']+';/g,
    `var productVersion = '${version}';`,
    'versionHelper productVersion',
  ),
]);

const manifestChanged = await synchronize(manifestUrl, [
  (source) => replaceExactlyOnce(
    source,
    /ExtensionBundleVersion="[^"]+"/g,
    `ExtensionBundleVersion="${version}"`,
    'manifest ExtensionBundleVersion',
  ),
  (source) => replaceExactlyOnce(
    source,
    /(<Extension Id="com\.bodymovin\.bodymovin" Version=")[^"]+("\s*\/?>)/g,
    `$1${version}$2`,
    'manifest extension version',
  ),
]);

const mode = CHECK_ONLY ? 'checked' : 'synchronized';
const changed = versionHelperChanged || manifestChanged;
console.log(`Version ${mode}: ${version}${changed ? ' (updated files)' : ''}`);
