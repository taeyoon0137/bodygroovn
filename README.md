# bodygroovn

bodygroovn is a Lottie-only After Effects exporter based on Bodymovin, independently maintained for modern After Effects compatibility. The fork preserves the After Effects 26 gradient-reading fix and focuses on a smaller, auditable CEP extension for After Effects 2025 and newer.

This is an independent maintenance line. There is no plan to submit bodygroovn-specific product changes upstream. The original Bodymovin/lottie-web project remains the source of the player and exporter foundation; bodygroovn maintains its own compatibility, packaging, and release policy.

## Supported features

- Standard and segmented Lottie JSON export
- Demo HTML and Standalone JavaScript export
- Static PNG palette processing with `0`, `32`, `64`, `128`, or `256` colors
- Inline and external images, fonts, and audio
- Browser, iOS, and Android compatibility reports
- Annotations and expressions
- Local lottie-web preview, Player UI, and `lottie.js.gz` download
- Essential Properties and `exportData.slots`
- After Effects 26 gradient parsing and current text-slot behavior

The following legacy features are intentionally removed: Rive/Flare, Android Vector Drawable, SMIL, Banner export/ZIP creation, Skottie/CanvasKit preview and reports, the unreachable legacy slots bridge, and the old static/local server surfaces.

## Install for designers

The v6 release contains exactly two public assets:

- `bodygroovn-v6.0.0.zxp`
- `bodygroovn-v6.0.0.zxp.sha256`

1. Quit After Effects and remove any legacy `bodymovin` extension folder from the user or system CEP extensions directory. Do not leave two extensions with the compatible `com.bodymovin.bodymovin` ID installed at once.
2. Download both release assets from GitHub and verify the ZXP SHA-256 before installation. The sidecar contains one lowercase digest, two spaces, the ZXP filename, and a final line feed.

   macOS:

   ```sh
   shasum -a 256 -c bodygroovn-v6.0.0.zxp.sha256
   ```

   Windows PowerShell:

   ```powershell
   $expected = (Get-Content .\bodygroovn-v6.0.0.zxp.sha256).Split(' ')[0]
   $actual = (Get-FileHash .\bodygroovn-v6.0.0.zxp -Algorithm SHA256).Hash.ToLowerInvariant()
   if ($actual -ne $expected) { throw 'SHA-256 mismatch' }
   ```

3. Install the verified ZXP with Adobe's official [Unified Plugin Installer Agent (UPIA) procedure](https://helpx.adobe.com/creative-cloud/apps/integration-with-other-apps/manage-plugins/install-plugins-using-upia-tool.html). This is the primary installation method.
4. If a GUI is more convenient, [aescripts ZXP/UXP Installer](https://aescripts.com/learn/post/zxp-installer) is a third-party fallback, not the authoritative installer.
5. Start After Effects and open **Window → Extensions → bodygroovn**.

The package is signed by the project's fixed self-signed publisher certificate. An installer may warn that the publisher is not publicly trusted; verify the release digest and repository provenance before continuing. Do not add the certificate to an operating-system trust store and do not enable `PlayerDebugMode` to install a production release.

## Development

### Requirements

- mise `2026.8.14`
- Node `24.19.0` and Yarn `4.18.0`, installed through mise
- After Effects 2025 or 2026 with CEP 12 for host testing

```sh
mise install --locked
mise exec -- node scripts/ci/check-toolchain.mjs
mise exec -- node scripts/ci/run-yarn.mjs install --immutable
```

The repository commits `mise.lock` for Linux x64, macOS x64/arm64, and Windows x64. The project config keeps mise's selected tools first in `PATH`, so existing Node managers cannot override the pinned runtime. `scripts/ci/run-yarn.mjs` verifies the downloaded Yarn CLI against SHA-256 `fb8b1d20be72a0b544a35bcec4c7ed0ff55a9b173c01f191b02ba164b2051db5`, then runs it with the mise-managed Node executable on every platform. Yarn uses the `node-modules` linker and commits `yarn.lock`. Every CI and release install uses the locked mise toolchain and immutable Yarn dependencies. Do not run Corepack or generate `package-lock.json`.

### Run the development panel

Install or link `bundle/` into the Adobe CEP extensions directory under the folder name `bodygroovn`, then run:

```sh
mise exec -- node scripts/ci/run-yarn.mjs start
```

The development manifest opens `http://127.0.0.1:3000/`. After changing ExtendScript, the manifest, or the Node server, close and reopen the panel or reload it from CEP developer tools; the Vite server cannot reload the After Effects host process for you.

### Build and verify

```sh
mise exec -- node scripts/ci/run-yarn.mjs lint
mise exec -- node scripts/ci/run-yarn.mjs typecheck
mise exec -- node scripts/ci/run-yarn.mjs test
mise exec -- node scripts/ci/run-yarn.mjs build
mise exec -- node scripts/ci/run-yarn.mjs verify
```

`yarn build` creates the production extension payload at `build/bodygroovn`. It generates the preview player import, bundles the panel and Node 17 server/worker, writes the production manifest, and creates exactly four player payload files: `lottie.js`, `lottie.js.gz`, `standalone.js`, and `demo.html`.

Useful focused checks:

```sh
mise exec -- node scripts/ci/run-yarn.mjs version:check
mise exec -- node scripts/ci/run-yarn.mjs check:provenance
mise exec -- node scripts/ci/run-yarn.mjs test:server
mise exec -- node scripts/ci/run-yarn.mjs check:payload
```

Local builds are unsigned. Production ZXP packaging and timestamped signing occur only in the protected GitHub release workflow. Do not distribute the raw payload directory as a release archive.

## Repository structure

```text
.
├── .changeset/          Pending product-version intent
├── .github/workflows/   CI, candidate, AE validation, and release finalization
├── bundle/              CEP manifest, ExtendScript, assets, and Node server sources
├── lib/CSInterface/     Byte-exact Adobe bridge, declarations, and provenance
├── mise.toml            Pinned Node and Yarn tool declarations
├── mise.lock            Cross-platform locked tool download metadata
├── player/              Fixed lottie-web source and minified player inputs
├── scripts/             Build, version, provenance, payload, QA, and release tools
├── src/                 React 19 panel application
└── test/                Unit, integration, contract, server, and payload tests
```

Generated-file and compatibility invariants are documented in [AGENTS.md](AGENTS.md). Deferred TypeScript and repository-layout work is documented in [ROADMAP.md](ROADMAP.md).

## Version contract

`package.json.version` is the product-version source of truth. `mise exec -- node scripts/ci/run-yarn.mjs version:sync` records it in the product version helper and the two CEP bundle/extension version attributes; `mise exec -- node scripts/ci/run-yarn.mjs version:check` fails on drift without editing files.

The product UI and `bm:version` show the product version. Lottie animation JSON `v`, animation report `version`, and `compatibilityVersion` intentionally remain `5.12.0`. Each animation JSON adds `meta.g: "bodygroovn <product version>"` without changing its Lottie compatibility version.

## Release flow

1. Develop on `develop` with a pending Changeset and pass locked-mise, immutable-Yarn CI.
2. Merge the reviewed tree to `main`.
3. The candidate workflow applies the Changeset locally, synchronizes version surfaces, creates the single English release commit, builds/tests it, signs the ZXP on Windows, verifies the signature and exact SHA sidecar bytes, preserves a Git bundle, and uploads an immutable internal candidate artifact.
4. Validate the same candidate ZXP on Windows and macOS with After Effects 2025 and 2026. Automated logs and a human UI check must record OS, exact After Effects version/build, candidate run/attempt, and ZXP SHA.
5. After the protected production approval, the finalizer re-verifies the candidate, validation evidence, commit/tree, bundle, and digests; prepares or validates the one matching draft; uploads only the ZXP and SHA sidecar; atomically publishes the release commit and `v6.0.0` tag; then verifies and publishes the GitHub Release.

If any host environment fails, the release stops. Recovery reuses the explicitly selected candidate run and attempt; it does not rebuild or resign.

## What “compression” means here

- There is no public ZIP download.
- Banner ZIP export is removed.
- A `.zxp` is a signed Adobe extension package, not a separately advertised ZIP build.
- PNG palette compression remains available for static supported PNG assets.
- `lottie.js.gz` remains available from the Player UI.
- GitHub's internal candidate artifact packaging is release infrastructure, not a public distribution file.

## License and attribution

bodygroovn is licensed under the repository's [MIT License](LICENSE). The exporter and player originate from Bodymovin/lottie-web. Adobe CEP bridge/signing tools and other pinned third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for immutable sources, hashes, and notices.
