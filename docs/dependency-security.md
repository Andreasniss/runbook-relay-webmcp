# Dependency remediation — 8 September 2026

The execution-evidence work exposed existing dependency audit findings. The application framework and database tooling remain on their existing versions.

- Browserslist is updated within its existing range to a patched 4.28 release. The maintainer's [4.28.7 release](https://github.com/browserslist/browserslist/releases/tag/4.28.7) resolves the relevant cache and custom-statistics issues.
- fflate is updated within its existing 0.7 range to 0.7.5, the backported fix for [malformed ZIP64 archive handling](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
- `@esbuild-kit/core-utils` still requires esbuild 0.18.20 through Drizzle's legacy loader. A narrowly scoped override uses 0.25.12, the same patched version already present under `drizzle-kit`; other esbuild consumers retain their own resolutions. The [maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) identifies 0.25.0 as the first fixed release. No Drizzle downgrade or audit suppression is applied.

The legacy loader calls esbuild's synchronous and asynchronous transform APIs. A [compatibility test](../tests/dependency-compatibility.test.mjs) exercises both through that actual consumer and evaluates the resulting JavaScript. The production build and migration generation provide additional integration checks. Remove the override when a supported Drizzle release stops pulling the affected loader or updates its requirement, after rerunning those checks and the full audit.

Audit results are a dated dependency check, not proof that the whole application is vulnerability-free. Re-run `npm audit` with registry access when reviewing a new dependency revision.

## Cloudflare runtime refresh — 25 October 2026

The Cloudflare Vite plugin, Wrangler and Worker types are aligned at 1.65.0, 4.152.0 and 5.20261019.1. The deployment workflow uses the same Wrangler version as the package manifest. This replaces the September update's incompatible Worker-types peer and moves Miniflare's Sharp dependency to 0.35.5, which fixes [the librsvg advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

Miniflare 5.20261019.2-beta pins Undici 7.29.1. A scoped `miniflare` override selects 7.30.1 for the [EventSource memory-exhaustion](https://github.com/advisories/GHSA-4qv8-2p9j-2685), [integrity-check](https://github.com/advisories/GHSA-f72v-6w45-q472) and [content-encoding](https://github.com/advisories/GHSA-xjj6-f33q-929c) fixes; unrelated Undici consumers are not overridden. Remove this override when a supported Cloudflare release resolves a patched Undici itself, after repeating the application checks and local Worker/D1 runtime smoke. The override is a compatibility-tested dependency repair, not an upstream support guarantee.

## Minimatch and renderer review: 5 November 2026

TypeScript ESLint's `typescript-estree` dependency now uses a scoped Minimatch
11.0.2 override for [globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The parser's named CommonJS `minimatch` API and its `dot: true` file matching are
covered by the existing dependency compatibility suite. Remove the override
when the parser's supported dependency range includes a patched release.

The Satori SVG-escaping advisory remains through Vinext's `@vercel/og` dependency.
No application route imports `ImageResponse` or generates OpenGraph images.
Updating only the separately installed Satori module is insufficient because
`@vercel/og` also bundles that renderer. The earliest patched OG package, 1.0.3,
was tested with a temporary compiled `next/og` route in the local Wrangler
Worker. It returned HTTP 500 from its bundled HarfBuzz initialization, so that
upgrade was not retained. The temporary route was removed. An upstream-compatible
renderer or framework update and an actual Worker image-generation check remain
necessary; the application build alone does not establish compatibility for an
unused renderer path. This is an open dependency advisory, not a clean-audit claim.
