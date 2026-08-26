# Release environment configuration

The repository environments are administrative prerequisites and are not created by a workflow.

## `release-signing`

- Restrict deployments to the `main` branch.
- Do not configure required reviewers.
- Store `ZXP_CERTIFICATE_P12_BASE64`, `ZXP_CERTIFICATE_PASSWORD`, and `ZXP_SIGNING_CERT_FINGERPRINT_SHA256` as environment secrets.
- Provision the certificate with `C=KR, ST=Seoul, O=taeyoon0137, CN=taeyoon0137-bodygroovn`, a 1460-day validity period, and a new random password. Replace it at least 90 days before expiry.

## `production-release`

- Restrict deployments to the `main` branch.
- Require a maintainer reviewer and leave prevent-self-review disabled.
- Keep approvals usable for up to 30 days.

The candidate workflow has read-only repository permission. Only the finalizer receives `contents: write`; `actions: read` is limited to the validation and finalizer jobs that retrieve artifacts from explicit workflow run IDs. No workflow creates branch rulesets or protection policies.

The finalizer must receive the original candidate run ID and attempt and the original validation run ID and attempt. Candidate and validation artifact names bind all four values, and the records and provenance repeat them for independent verification. A recovery execution downloads and verifies those artifacts and never rebuilds or resigns the ZXP. The legacy draft release with ID `344027289` has another tag and is outside the exact `draft == true && tag_name == "v6.0.0"` selector.

Release provenance records `http://timestamp.digicert.com/` as the timestamp endpoint configured for signing. The separate ZXPSignCmd verification evidence proves that the embedded timestamp is valid; the timestamp token itself does not encode the configured request URL.
