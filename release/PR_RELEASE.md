# Pull Request Release Flow

bodygroovn v6.0.0 uses a signed-candidate workflow with an explicit maintainer test gate. Product changes remain on `develop` until the exact signed candidate has been tested.

## One-time bootstrap

The trusted release workflows and their verification scripts are introduced in a small automation-only pull request. Merge that bootstrap pull request into `main` before opening the product pull request. This is necessary because signing and finalization must execute workflow code already trusted on the default branch.

The bootstrap does not publish a product release. It only installs the trusted automation used by later candidate and finalization runs.

## Candidate build

1. Open the product pull request from the repository's `develop` branch to `main`.
2. Record its pull request number and exact head SHA.
3. Dispatch `release-candidate.yml` from `main` with those two values.
4. The secretless build job checks out the exact pull request head, runs the full build and verification suite, creates the release commit, and uploads an unsigned payload plus its Git bundle and metadata.
5. A fresh Windows signing job checks out trusted `main` only. It verifies the unsigned artifact, signs it with the fixed release certificate, verifies the signature, and uploads `release-candidate-v6.0.0-<run_id>-<run_attempt>`.

The signing job must never execute code from the pull request checkout or from the downloaded unsigned artifact.

## Maintainer test and approval

Download the signed candidate once. The same ZXP SHA-256 must pass all four required environments:

- Windows with After Effects 2025
- Windows with After Effects 2026
- macOS with After Effects 2025
- macOS with After Effects 2026

Create one test record for each environment and include all of the following:

- Operating system and version
- After Effects version and build
- Pull request number and head SHA
- Candidate run ID and attempt
- `bodygroovn-v6.0.0.zxp` SHA-256

In every environment, install and remove the signed ZXP with UPIA and verify the `bodygroovn` menu and panel, Standard and segmented exports, Demo and Standalone outputs, image/font/audio/expression/annotation handling, Essential Properties and gradient/text slots, every PNG palette setting and unsupported-PNG preservation, iOS and Android reports, local preview, the gzip player download, server token rotation, and the absence of UI freezes. The SHA-256 supplied to finalization must be the exact SHA-256 recorded in all four tests.

Any failure or SHA mismatch blocks the release. Fix the product pull request and create a new candidate instead of modifying or substituting an existing artifact.

After testing succeeds, dispatch `release-finalize.yml` from `main` with the pull request number, candidate run ID, candidate run attempt, and tested ZXP SHA-256. Approval of the `production-release` environment is the maintainer's authorization to publish that exact candidate.

## Finalization

The trusted finalizer verifies that the pull request still identifies the recorded repository, branches, and head commit, downloads the named candidate without rebuilding or resigning it, verifies its provenance and digests, and reconstructs the release commit from the internal Git bundle. The remote Git graph, rather than mutable pull request base metadata, determines whether this is the initial publication or a recovery. The finalizer leases `main` against the recorded pull request base, atomically advances `main` to the release commit with the annotated `v6.0.0` tag, and only then creates or resumes the GitHub Release with exactly:

- `bodygroovn-v6.0.0.zxp`
- `bodygroovn-v6.0.0.zxp.sha256`

This atomic finalization integrates the reviewed pull request tree into `main`; a separate GitHub merge action is neither required nor permitted after candidate approval.

## Recovery

If the atomic push succeeds but publication does not, rerun the finalizer with the same pull request number, candidate run ID, candidate run attempt, and tested ZXP SHA-256. Recovery reuses the existing candidate artifact and release commit. It must not rebuild, resign, substitute, or mutate the tested candidate.
