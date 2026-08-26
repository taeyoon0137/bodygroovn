# Adobe CEP 12 CSInterface

`CSInterface.js` is vendored byte-for-byte from Adobe CEP Resources so the CEP browser can communicate with the After Effects host APIs. It is intentionally loaded as a classic script before the Vite module bundle and must not be formatted, converted to a module, or edited locally.

## Provenance

- Repository: `Adobe-CEP/CEP-Resources`
- Commit: `91824a33f1dd43fa55658e68eb4b07c8879c97c4`
- Source path: `CEP_12.x/CSInterface.js`
- Source URL: <https://github.com/Adobe-CEP/CEP-Resources/blob/91824a33f1dd43fa55658e68eb4b07c8879c97c4/CEP_12.x/CSInterface.js>
- License: Adobe SDK License Agreement in `CEP-Resources/License/GenSDK_IHC-en_US-20120323_1224.pdf`; the source file also carries Adobe's distribution notice.
- Size: `42,759` bytes
- SHA-256: `3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783`

`CSInterface.d.ts` is maintained by this repository. It is a full ambient declaration for the vendored global constructors, static members, and CSInterface prototype methods. The declaration and this provenance document are repository-only files; the production ZXP contains only `CSInterface.js`.

## Verification

Run:

```sh
yarn check:csinterface
```

The check verifies the exact byte length and digest, then compares the JavaScript constructor, static-member, and CSInterface method sets with the ambient declaration.

## Updating

1. Select an Adobe CEP Resources commit and download `CEP_12.x/CSInterface.js` without transforming line endings.
2. Record the immutable commit, source URL, license path, byte length, and SHA-256 here and in `THIRD_PARTY_NOTICES.md`.
3. Replace `CSInterface.js` byte-for-byte. Do not format it.
4. Update `CSInterface.d.ts` only when the upstream public surface changed.
5. Update the constants in `scripts/check-csinterface.mjs` and run the complete test and payload-inventory suites.
6. Confirm that the built HTML loads the classic script before the Vite module and that only the JavaScript file enters the ZXP payload.
