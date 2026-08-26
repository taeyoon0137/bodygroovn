param(
    [Parameter(Mandatory = $true)]
    [string]$CertificatePath,

    [Parameter(Mandatory = $true)]
    [string]$CertificatePassword,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedFingerprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$normalizedFingerprint = $ExpectedFingerprint.ToLowerInvariant()
if ($normalizedFingerprint -cnotmatch '^[0-9a-f]{64}$') {
    throw 'The expected signing certificate fingerprint is not a SHA-256 digest.'
}

$flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    (Resolve-Path $CertificatePath).Path,
    $CertificatePassword,
    $flags
)
try {
    if (!$certificate.HasPrivateKey) {
        throw 'The signing certificate does not contain a private key.'
    }
    $actualFingerprint = $certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()
    if ($actualFingerprint -cne $normalizedFingerprint) {
        throw 'The signing certificate SHA-256 fingerprint does not match the release secret.'
    }

    $actualSubjectParts = @($certificate.Subject -split ',\s*' | ForEach-Object {
        if ($_ -cmatch '^ST=') { $_ -creplace '^ST=', 'S=' } else { $_ }
    } | Sort-Object)
    $expectedSubjectParts = @('C=KR', 'CN=taeyoon0137-bodygroovn', 'O=taeyoon0137', 'S=Seoul') | Sort-Object
    if ((Compare-Object $actualSubjectParts $expectedSubjectParts).Count -ne 0) {
        throw "The signing certificate subject is invalid: $($certificate.Subject)"
    }

    $subjectBytes = [Convert]::ToHexString($certificate.SubjectName.RawData)
    $issuerBytes = [Convert]::ToHexString($certificate.IssuerName.RawData)
    if ($subjectBytes -cne $issuerBytes) {
        throw 'The signing certificate is not self-issued.'
    }
    $validityDays = ($certificate.NotAfter.ToUniversalTime() - $certificate.NotBefore.ToUniversalTime()).TotalDays
    if ([Math]::Abs($validityDays - 1460) -gt (1 / 1440)) {
        throw "The signing certificate validity is not exactly 1460 days: $validityDays"
    }
    if ($certificate.NotAfter.ToUniversalTime() -lt [DateTime]::UtcNow.AddDays(90)) {
        throw 'The signing certificate expires within 90 days.'
    }

    $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
    try {
        $chain.ChainPolicy.TrustMode = [Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
        [void]$chain.ChainPolicy.CustomTrustStore.Add($certificate)
        $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
        if (!$chain.Build($certificate) -or $chain.ChainElements.Count -ne 1) {
            throw 'The signing certificate does not validate as a self-signed certificate.'
        }
    } finally {
        $chain.Dispose()
    }
} finally {
    $certificate.Dispose()
}

Write-Output 'Verified the self-signed release certificate, private key, subject, validity, and SHA-256 fingerprint.'
