# Release Configuration

The release pipeline separates pull-request-controlled build work from trusted signing and publication.

## Trusted workflows

- `release-bootstrap-ci.yml` validates changes to the trusted automation itself.
- `release-candidate.yml` is dispatched from `main` with an exact product pull request number and head SHA.
- `release-finalize.yml` is dispatched from `main` with the exact tested candidate identity.

All action references are pinned to full commit SHAs. Candidate and finalizer runs are accepted only when their workflow commit is on trusted `main`.

## GitHub environments

### `release-signing`

- Deployment branches: `main` only
- Required reviewers: none
- Secrets:
  - `ZXP_CERTIFICATE_P12_BASE64`
  - `ZXP_CERTIFICATE_PASSWORD`
  - `ZXP_SIGNING_CERT_FINGERPRINT_SHA256`

Only the fresh Windows signing job uses this environment. The job checks out trusted `main`; it does not check out or execute pull request code.

### `production-release`

- Deployment branches: `main` only
- Required reviewer: maintainer
- Prevent self-review: off
- Approval timeout: no more than 30 days
- Concurrency cancellation: disabled

Approval authorizes publication only for the supplied pull request number, candidate run ID and attempt, and tested ZXP SHA-256.

## Permissions

Workflows default to `contents: read`. The candidate inspection job additionally reads pull request metadata. Only the finalizer receives `contents: write`; cross-run candidate retrieval receives `actions: read`. Signing secrets never enter the pull-request build job.

## Artifact contracts

The unsigned build artifact contains the exact extension payload, deterministic payload manifest, release Git bundle, and unsigned metadata. The signed internal candidate is named:

`release-candidate-v6.0.0-<run_id>-<run_attempt>`

It is retained for 90 days without overwrite and contains the signed ZXP, SHA-256 sidecar, Git bundle, unsigned payload manifest, release provenance, and signature verification report. Internal workflow artifacts are not public release files.

The public GitHub Release contains exactly the signed ZXP and its SHA-256 sidecar. A recovery run must identify and reuse the original candidate run and attempt; rebuilding or resigning during recovery is prohibited.

After approval, the finalizer atomically advances `main` and creates the annotated tag before it creates or resumes the draft Release. This ensures that GitHub can resolve the exact release commit. If draft creation, asset upload, or publication then fails, recovery validates the remote commit and tag and reuses the same signed candidate without rebuilding it.

See [PR_RELEASE.md](./PR_RELEASE.md) for the operator procedure.
