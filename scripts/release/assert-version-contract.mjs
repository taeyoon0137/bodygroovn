import { readFile } from 'node:fs/promises'

const expected = process.argv[2]
const [packageJson, helper, manifest] = await Promise.all([
  readFile(new URL('../../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../../bundle/jsx/helpers/versionHelper.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../bundle/CSXS/manifest.xml', import.meta.url), 'utf8'),
])
if (packageJson.version !== expected) throw new Error(`package.json version is ${packageJson.version}`)
for (const assertion of [
  [helper.includes(`var productVersion = '${expected}';`), 'productVersion'],
  [manifest.includes(`ExtensionBundleVersion="${expected}"`), 'ExtensionBundleVersion'],
  [manifest.includes(`Extension Id="com.bodymovin.bodymovin" Version="${expected}"`), 'Extension Version'],
  [manifest.includes('ExtensionManifest Version="12.0"'), 'manifest compatibility'],
  [manifest.includes('RequiredRuntime Name="CSXS" Version="12.0"'), 'runtime compatibility'],
]) if (!assertion[0]) throw new Error(`Invalid version contract: ${assertion[1]}`)
console.log(`Verified product version ${expected} and preserved CEP compatibility versions.`)
