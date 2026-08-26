import fs from 'node:fs'

import {describe, expect, it} from 'vitest'

describe('release signature verification contract', () => {
  it('requires online revocation, timestamp validity, and embedded certificate identity', () => {
    const workflow = fs.readFileSync('.github/workflows/release-candidate.yml', 'utf8')
    const verifier = fs.readFileSync('scripts/release/verify-zxp-signature.ps1', 'utf8')

    expect(workflow).toContain('-verify $zxp -certInfo')
    expect(workflow).not.toContain('-skipOnlineRevocationChecks')
    expect(workflow).toContain('verify-zxp-signature.ps1')
    expect(workflow).toContain('verify-signing-certificate.ps1')
    expect(workflow).not.toContain('.Import(')
    expect(verifier).toContain('Revoked:\\s*false')
    expect(verifier).toContain('Valid and within certificate validity dates at time of signing')
    expect(verifier).toContain("META-INF/signatures.xml")
    expect(verifier).toContain("local-name()='X509Certificate'")
    expect(verifier).toContain('GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)')
    expect(verifier).toContain('CheckSignature($matchingCertificates[0], $true)')
    expect(verifier).toContain("@('C=KR', 'CN=taeyoon0137-bodygroovn', 'O=taeyoon0137', 'S=Seoul')")
  })

  it('normalizes empty PowerShell comparisons under StrictMode', () => {
    const signingVerifier = fs.readFileSync('scripts/release/verify-signing-certificate.ps1', 'utf8')
    const packageVerifier = fs.readFileSync('scripts/release/verify-zxp-signature.ps1', 'utf8')

    expect(signingVerifier).toContain('@(Compare-Object $actualSubjectParts $expectedSubjectParts).Count')
    expect(packageVerifier).toContain('@(Compare-Object $actualSubjectParts $expectedSubjectParts).Count')
  })

  it('installs the exact toolchain through pinned mise inputs', () => {
    const developWorkflow = fs.readFileSync('.github/workflows/develop-ci.yml', 'utf8')
    const candidateWorkflow = fs.readFileSync('.github/workflows/release-candidate.yml', 'utf8')
    const validationWorkflow = fs.readFileSync('.github/workflows/ae-validation.yml', 'utf8')
    const finalizerWorkflow = fs.readFileSync('.github/workflows/release-finalize.yml', 'utf8')
    const workflows = `${developWorkflow}\n${candidateWorkflow}\n${validationWorkflow}\n${finalizerWorkflow}`
    const config = fs.readFileSync('mise.toml', 'utf8')
    const lock = fs.readFileSync('mise.lock', 'utf8')
    const verifier = fs.readFileSync('scripts/ci/check-toolchain.mjs', 'utf8')
    const action = 'jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c'

    expect(developWorkflow.match(new RegExp(action, 'g'))).toHaveLength(2)
    expect(candidateWorkflow.match(new RegExp(action, 'g'))).toHaveLength(3)
    expect(validationWorkflow.match(new RegExp(action, 'g'))).toHaveLength(1)
    expect(finalizerWorkflow.match(new RegExp(action, 'g'))).toHaveLength(1)
    expect(workflows.match(/version: 2026\.8\.14/g)).toHaveLength(7)
    expect(workflows.match(/node scripts\/ci\/check-toolchain\.mjs/g)).toHaveLength(7)
    expect(workflows).not.toContain('actions/setup-node@')
    expect(workflows).not.toContain('activate-package-manager.mjs')
    expect(workflows.toLowerCase()).not.toContain('corepack')
    expect(config).toContain('node = "24.19.0"')
    expect(config).toContain('"aqua:yarnpkg/berry" = "4.18.0"')
    expect(config).toContain('activate_aggressive = true')
    for (const platform of ['linux-x64', 'macos-x64', 'macos-arm64', 'windows-x64']) {
      expect(config).toContain(`"${platform}"`)
      expect(lock).toContain(`platforms.${platform}`)
    }
    expect(verifier).toContain("mise: '2026.8.14'")
    expect(verifier).toContain("node: '24.19.0'")
    expect(verifier).toContain("yarn: '4.18.0'")
    expect(verifier).toContain("const YARN_SHA256 = 'fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5'")
    expect(verifier).toContain("readVersion('mise', ['which', 'yarn'])")
    expect(verifier).toContain("readFileSync(yarnPath)")
  })

  it('preserves byte-exact build inputs across platform checkouts', () => {
    const attributes = fs.readFileSync('.gitattributes', 'utf8')

    expect(attributes).toContain('* text=auto eol=lf')
    expect(attributes).toContain('.yarn/plugins/@echoscript-yarn-plugin.cjs text eol=lf')
    expect(attributes).toContain('lib/CSInterface/CSInterface.js text eol=lf')
    expect(attributes).toContain('player/lottie.js text eol=lf')
    expect(attributes).toContain('player/lottie.min.js text eol=lf')
  })
})
