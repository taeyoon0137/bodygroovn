param(
    [Parameter(Mandatory = $true)]
    [string]$ZxpPath,

    [Parameter(Mandatory = $true)]
    [string]$VerificationLogPath,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedFingerprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedSubjectParts = @('C=KR', 'CN=taeyoon0137-bodygroovn', 'O=taeyoon0137', 'S=Seoul') | Sort-Object
$normalizedFingerprint = $ExpectedFingerprint.ToLowerInvariant()
if ($normalizedFingerprint -cnotmatch '^[0-9a-f]{64}$') {
    throw 'The expected signing certificate fingerprint is not a SHA-256 digest.'
}

$verificationText = [IO.File]::ReadAllText((Resolve-Path $VerificationLogPath))
$requiredEvidence = @(
    '(?mi)^\s*CN:\s*taeyoon0137-bodygroovn\s*$',
    '(?mi)^\s*Revoked:\s*false\s*$',
    '(?mi)^\s*Timestamp:\s*Valid and within certificate validity dates at time of signing\s*$',
    '(?mi)^\s*Signing Certificate:\s*Valid \(from .+ until .+\)\s*$'
)
foreach ($pattern in $requiredEvidence) {
    if ($verificationText -cnotmatch $pattern) {
        throw "ZXPSignCmd verification evidence is missing required marker: $pattern"
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Security.Cryptography.Xml
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $ZxpPath).Path)
$matchingCertificates = @()
try {
    $signatureEntry = $archive.GetEntry('META-INF/signatures.xml')
    if ($null -eq $signatureEntry) {
        throw 'The signed ZXP does not contain META-INF/signatures.xml.'
    }

    $stream = $signatureEntry.Open()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
    try {
        $signatureText = $reader.ReadToEnd()
    } finally {
        $reader.Dispose()
        $stream.Dispose()
    }

    $signatureXml = [Xml.XmlDocument]::new()
    $signatureXml.PreserveWhitespace = $true
    $signatureXml.LoadXml($signatureText)

    $certificateNodes = $signatureXml.SelectNodes("//*[local-name()='X509Certificate']")
    if ($null -eq $certificateNodes -or $certificateNodes.Count -eq 0) {
        throw 'The signed ZXP does not expose an X509Certificate in signatures.xml.'
    }

    foreach ($certificateNode in $certificateNodes) {
        $certificateBytes = [Convert]::FromBase64String(($certificateNode.InnerText -replace '\s', ''))
        $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateBytes)
        $actualFingerprint = $certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()
        if ($actualFingerprint -ceq $normalizedFingerprint) {
            $matchingCertificates += $certificate
        } else {
            $certificate.Dispose()
        }
    }

    if ($matchingCertificates.Count -ne 1) {
        throw "Expected exactly one embedded signing certificate with fingerprint $normalizedFingerprint; found $($matchingCertificates.Count)."
    }
    $actualSubjectParts = @($matchingCertificates[0].Subject -split ',\s*' | ForEach-Object {
        if ($_ -cmatch '^ST=') { $_ -creplace '^ST=', 'S=' } else { $_ }
    } | Sort-Object)
    if ((Compare-Object $actualSubjectParts $expectedSubjectParts).Count -ne 0) {
        throw "The embedded signing certificate subject is invalid: $($matchingCertificates[0].Subject)"
    }

    $packageSignature = $signatureXml.SelectSingleNode("//*[local-name()='Signature' and @Id='PackageSignature']")
    if ($null -eq $packageSignature) {
        throw 'The signed ZXP does not contain the PackageSignature XML signature.'
    }
    $signedXml = [Security.Cryptography.Xml.SignedXml]::new($signatureXml)
    $signedXml.LoadXml($packageSignature)
    if (!$signedXml.CheckSignature($matchingCertificates[0], $true)) {
        throw 'The expected signing certificate did not create the ZXP PackageSignature.'
    }
} finally {
    foreach ($certificate in $matchingCertificates) {
        $certificate.Dispose()
    }
    $archive.Dispose()
}

Write-Output "Verified the ZXP signature, timestamp, signer identity, and certificate SHA-256 fingerprint."
