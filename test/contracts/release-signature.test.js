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
})
