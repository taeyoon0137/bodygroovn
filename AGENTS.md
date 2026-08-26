# bodygroovn Repository Instructions

This file is the source of truth for agents working in this repository. It adapts the principles from `taeyoon0137/agents-md` commit `f358bf3d1524f403b5bcb44a89cb5b5bf434a54f` to bodygroovn's confirmed structure and release contract.

## Communication and output language

- Communicate with the user in Korean.
- Write code, comments, documentation, tests, workflows, commit messages, tags, and GitHub Release text in English.
- Put conclusions and fresh verification evidence before process detail.
- Do not claim that a command, Adobe host check, signature, deployment, or release succeeded unless its output was inspected.

## Repository role

bodygroovn is an independently maintained, Lottie-only After Effects exporter based on Bodymovin. It targets modern After Effects compatibility and does not plan to upstream bodygroovn-specific changes.

Preserve the AE 26 gradient fix rooted at commit `2a2686484c3347939e781684674ec50a78f37c9b`. The annotated `archive/fix-ae26-gradient` tag is the immutable pre-v6 baseline.

## Start-of-work checks

Before editing:

1. Run `git status --short --branch` and preserve unrelated work.
2. Read the files and tests for the surface being changed.
3. Confirm whether a file is source, generated output, or byte-exact vendored input.
4. For behavior changes, add or update the smallest regression test that locks the intended contract.
5. Work on `develop`; only reviewed changes with a pending Changeset move to `main`.

Do not create a version commit, tag, ZXP, or GitHub Release when `main` has no pending Changeset release.

## Toolchain and commands

The repository pins mise `2026.8.14`, Node `24.19.0`, and Yarn `4.18.0`. `mise.toml` and `mise.lock` are the toolchain sources and keep the selected tools first in `PATH`; do not use Corepack. Yarn uses `nodeLinker: node-modules`; never create or commit `package-lock.json`.

Use these commands:

```sh
mise install --locked
mise exec -- node scripts/ci/check-toolchain.mjs
mise exec -- node scripts/ci/run-yarn.mjs install --immutable
mise exec -- node scripts/ci/run-yarn.mjs start
mise exec -- node scripts/ci/run-yarn.mjs build
mise exec -- node scripts/ci/run-yarn.mjs lint
mise exec -- node scripts/ci/run-yarn.mjs typecheck
mise exec -- node scripts/ci/run-yarn.mjs test
mise exec -- node scripts/ci/run-yarn.mjs verify
mise exec -- node scripts/ci/run-yarn.mjs version:sync
mise exec -- node scripts/ci/run-yarn.mjs version:check
```

- `mise exec -- node scripts/ci/run-yarn.mjs start` serves the development panel on `127.0.0.1:3000`; install or link the development extension as the folder `bodygroovn` and reload the CEP panel manually after host-side changes.
- `mise exec -- node scripts/ci/run-yarn.mjs build` creates the production extension payload and deterministic player artifacts.
- `mise exec -- node scripts/ci/run-yarn.mjs verify` is the local aggregate gate. Run targeted tests first, then the aggregate gate before claiming completion.
- Every install in automation must use `--immutable`.
- Run Yarn through `scripts/ci/run-yarn.mjs`; it verifies the CLI SHA-256 before execution and avoids platform-specific command resolution.

TypeScript 6 is limited to configuration, ambient declarations, and tests for v6.0.0. Do not convert production JavaScript or JSX to TypeScript in this release. See [ROADMAP.md](ROADMAP.md).

## Structure

- `src/`: React 19 CEP panel application.
- `bundle/jsx/`: retained ExtendScript exporter, report, annotation, expression, slot, and import logic.
- `bundle/server/`: Node 17-compatible local HTTP server and PNG worker sources.
- `bundle/CSXS/manifest.xml`: development CEP 12 manifest; the production build changes only `MainPath` to `./index.html`.
- `player/lottie.js` and `player/lottie.min.js`: fixed local lottie-web player inputs.
- `lib/CSInterface/`: byte-exact Adobe bridge, repository-authored ambient declaration, and provenance.
- `scripts/`: deterministic generation, version, provenance, payload, QA, and release checks.
- `test/`: unit, integration, static-contract, server, and payload tests.
- `.github/workflows/`: locked-mise and immutable-Yarn CI, candidate signing, AE validation, and release finalization.

## Version invariants

`package.json.version` is the only product-version source. A pending major Changeset advances the seeded `5.12.0` package version to product version `6.0.0` during the release transaction.

`mise exec -- node scripts/ci/run-yarn.mjs version:sync` may update exactly these three values:

- `productVersion` in `bundle/jsx/helpers/versionHelper.jsx`;
- manifest `ExtensionBundleVersion`;
- the `com.bodymovin.bodymovin` Extension `Version`.

Never synchronize these compatibility surfaces:

- animation JSON `v: "5.12.0"`;
- animation report `version: "5.12.0"`;
- `compatibilityVersion`;
- `ExtensionManifest Version="12.0"`;
- `RequiredRuntime CSXS Version="12.0"`.

`bm:version` and the Footer use `getProductVersion()`. Animation JSON includes `meta.g: "bodygroovn <product version>"`.

## Generated and vendored files

Generation relationships are exact:

- Generate `src/lottie.js` from `player/lottie.js` with the preview-import `define` guard.
- Do not recreate `src/bodymovin.js`; it is intentionally removed.
- Generate payload `assets/player/lottie.js` from `player/lottie.min.js`.
- Generate `assets/player/standalone.js` from the same fixed minified player input.
- Generate `assets/player/lottie.js.gz` with fixed gzip metadata.
- Generate `assets/player/demo.html` by inserting `player/lottie.min.js` at the existing marker.

The production payload's player directory contains exactly `lottie.js`, `lottie.js.gz`, `standalone.js`, and `demo.html`. Never include source maps, `.debug`, Node binaries, secrets, `.DS_Store`, `__MACOSX`, symlinks, runtime `node_modules`, or duplicate `lottie.min.js`.

`lib/CSInterface/CSInterface.js` is Adobe CEP 12 source at commit `91824a33f1dd43fa55658e68eb4b07c8879c97c4`, exactly `42,759` bytes with SHA-256 `3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783`. Never format, edit, or module-convert it. Load it as a classic script before the Vite bundle. The ZXP includes the JavaScript only; declarations and provenance stay in the repository.

The Echoscript Yarn plugin is pinned to commit `1af7b5dd51c80fc07c80a1f7666f5a3f7ca8f28a` with SHA-256 `ca9f43406c51d1e086bd8464f27d33f79c45a1bd59338ff0c24bc1073a506be3`.

## Compatibility boundaries

Keep these public compatibility identifiers unless a separately approved migration changes them:

- Extension bundle and extension ID `com.bodymovin.bodymovin`;
- `$.__bodymovin` ExtendScript namespace;
- compatible existing localStorage keys;
- Essential Properties and `exportData.slots`;
- gradient and text slot fixes;
- `imageProcessed(changedFlag, encoded_data)` two-argument contract.

The manifest supports only `AEFT [25.0,99.9]`, CEP/CSXS 12, and `--enable-nodejs`. The menu, bundle name, repository, package branding, and install folder are lowercase `bodygroovn`.

## Retained and removed functionality

Retain Standard and segmented JSON, Demo HTML, Standalone JS, static PNG palette processing, inline and external images/fonts/audio, browser/iOS/Android reports, annotations, expressions, local lottie-web preview, Player UI, `lottie.js.gz`, Essential Properties, slots, and the gradient/text fixes.

Do not reintroduce Rive/Flare, AVD, SMIL, Banner export or `/createBanner`, Skottie/CanvasKit, the unreachable `bm:create:slots` bridge, `index_server`, `localserver`, Howler remnants, catFact/NASA helpers, static server routes, `/fileFromPath`, `/convertToFlare`, CanvasKit routes/assets/fetches, or their dependencies/tests/build inputs.

Shared report modules remain. Retained renderer membership is `[BROWSER, IOS, ANDROID]`; Skottie is the only renderer removed. Never introduce `undefined`, `null`, or empty renderer lists.

Exporter idle accounting has exactly `DEMO`, `STANDALONE`, and `STANDARD`. Every retained success, failure, and segmented flow invokes its completion callback exactly once. Malformed expression responses without an ID abort the current render and emit `bm:alert`; report-save failures use report-specific failure handling.

## Local server and PNG safety

All panel access to Node passes through the single frozen bridge in the HTML entry. The bundled CJS server binds only to `127.0.0.1:0`, generates a fresh 32-byte token per start, compares `X-Bodygroovn-Token` timing-safely, and rotates it on restart.

Only the real AE/OS temporary directory and the current export destination may be registered. Preserve realpath and symlink-escape checks, request/path/file/pixel/decoded-size limits, the single worker plus four-item queue, and the specified timeouts. Do not add a synchronous or child-process fallback for `worker_threads` or UPNG.

PNG palette values are exactly `0`, `32`, `64`, `128`, and `256`. `0` is a no-op. Process only static 8-bit non-interlaced PNG files. Preserve APNG, 16-bit, and interlaced PNGs with warnings. Validate signature, chunks, CRC, and IEND; write a sibling temporary file and replace atomically only when the validated result is smaller. Never convert PNG to JPEG or rewrite its extension.

## Change and verification discipline

- Prefer deletion and existing utilities over new abstractions.
- Add no dependency unless the user explicitly requested it or the approved v6 plan already fixed it.
- Keep diffs localized and preserve upstream compatibility behavior.
- Do not write credentials, certificate material, passwords, or tokens to tracked files or logs.
- Run focused tests, then lint, declaration/type checks, the full test suite, build, Node 17 smoke, and payload inventory checks as applicable.
- Verify repository-wide absence checks after feature removal.
- Treat Windows/macOS × AE 2025/2026 results as manual-host evidence; never infer them from unit tests.

## Release gate

The v6.0.0 public release is complete only when all four AE environments validate the identical candidate SHA and GitHub Release `v6.0.0` is public with exactly:

- `bodygroovn-v6.0.0.zxp`
- `bodygroovn-v6.0.0.zxp.sha256`

Before approval, do not push the locally created release commit, tag, or pending release ref. Do not reuse or modify the older draft Release ID `344027289`. Do not rebuild or resign during recovery; use only the explicitly selected candidate run and attempt. If any environment fails, block release and do not invent a fallback or replacement asset.

Do not add branch rulesets or protection policies for v6.0.0. Do not make new product, compatibility, signing, security, or release-policy decisions without explicit user direction.

After the first public release is verified, the remote `fix-ae26-gradient` branch may be deleted. Fast-forward `develop`; if that is impossible, use an `automation/reconcile-v6.0.0` pull request. Preserve the archive tag.
