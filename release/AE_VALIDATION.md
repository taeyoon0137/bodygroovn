# After Effects 2x2 release validation

The `ae-validation.yml` workflow runs on four separately provisioned self-hosted runners: Windows and macOS, each with After Effects 2025 and 2026. Every runner must expose `BODYGROOVN_AE_HARNESS` as a repository variable pointing to the approved host harness.

The workflow invokes the harness with explicit `--zxp`, `--record`, `--log`, and `--schema` arguments. The harness installs and removes the candidate with Adobe UPIA, exports the canonical fixture set, exercises the Node worker roundtrip, writes a non-empty environment-specific log, and writes one JSON record conforming to `ae-validation.schema.json`. The record's `harness.logArtifact` must name that exact uploaded log. A human reviewer must inspect the menu and panel name, color pointer/keyboard/input/preset behavior, preview and downloads, and UI responsiveness before setting `human.approved` to `true`.

All records include the exact candidate workflow run ID and attempt, ZXP SHA-256, operating system, and After Effects version and build. The finalizer rejects incomplete matrices, differing candidate hashes, failed checks, or absent human approval. Recovery always references the original candidate and validation run IDs and attempts; it never rebuilds or resigns the package.

Dispatch `ae-validation.yml` from the same `main` commit that triggered the selected candidate run. The finalizer resolves both workflow identities through the GitHub Actions API and rejects a validation run whose head SHA differs from the candidate trigger SHA, even when its records and artifact names otherwise match.

Approved canonical differences are limited to `meta.g`, the documented PNG/XMP migration, removal of the Skottie renderer string, and environment-specific report paths. Animation JSON `v` remains `5.12.0`.
