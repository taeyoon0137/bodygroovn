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

  it('bootstraps the exact package managers without replacing runner-global shims', () => {
    const developWorkflow = fs.readFileSync('.github/workflows/develop-ci.yml', 'utf8')
    const candidateWorkflow = fs.readFileSync('.github/workflows/release-candidate.yml', 'utf8')
    const bootstrap = fs.readFileSync('scripts/ci/activate-package-manager.mjs', 'utf8')

    expect(developWorkflow.match(/node scripts\/ci\/activate-package-manager\.mjs/g)).toHaveLength(2)
    expect(candidateWorkflow.match(/node scripts\/ci\/activate-package-manager\.mjs/g)).toHaveLength(3)
    expect(`${developWorkflow}\n${candidateWorkflow}`).not.toContain('npm install --global corepack')
    expect(bootstrap).toContain("const NODE_VERSION = 'v24.19.0'")
    expect(bootstrap).toContain("const COREPACK_VERSION = '0.35.0'")
    expect(bootstrap).toContain("const YARN_VERSION = '4.18.0'")
    expect(bootstrap).toContain("'--global', '--prefix', toolchainRoot")
    expect(bootstrap).toContain("requireEnvironmentPath('GITHUB_PATH')")
  })
})
