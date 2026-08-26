import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [directory, parent, runId, runAttempt, certificateFingerprint] = process.argv.slice(2)
if (!/^[0-9a-f]{64}$/i.test(certificateFingerprint)) throw new Error('Invalid certificate SHA-256 fingerprint')
const sha256 = async (name) => createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const provenance = {
  schemaVersion: 1,
  candidate: { runId, runAttempt },
  release: { version: '6.0.0', tag: 'v6.0.0', parent, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
  toolchain: { node: '24.19.0', corepack: '0.35.0', yarn: '4.18.0' },
  signing: {
    signer: {
      sourceCommit: 'fcee8de5537d2dd2ed3d91d5a495b7041155b280',
      sourcePath: 'ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe',
      bytes: 4_542_464,
      sha256: 'ffc2223167225ce61d024eb463fc5ad1a1be16133f99ef334a646f7311916c98',
    },
    certificateFingerprintSha256: certificateFingerprint.toLowerCase(),
    timestampAuthority: 'http://timestamp.digicert.com/',
  },
  artifacts: {
    'bodygroovn-v6.0.0.zxp': await sha256('bodygroovn-v6.0.0.zxp'),
    'bodygroovn-v6.0.0.zxp.sha256': await sha256('bodygroovn-v6.0.0.zxp.sha256'),
    'bodygroovn-v6.0.0.git.bundle': await sha256('bodygroovn-v6.0.0.git.bundle'),
    'unsigned-payload-manifest.json': await sha256('unsigned-payload-manifest.json'),
    'zxp-verify.txt': await sha256('zxp-verify.txt'),
  },
}
await writeFile(path.join(directory, 'release-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx' })
console.log(`Wrote provenance for ${provenance.release.commit}.`)
