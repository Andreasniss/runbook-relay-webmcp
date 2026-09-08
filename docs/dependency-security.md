# Dependency remediation — 8 September 2026

The execution-evidence work exposed existing dependency audit findings. The application framework and database tooling remain on their existing versions.

- Browserslist is updated within its existing range to a patched 4.28 release. The maintainer's [4.28.7 release](https://github.com/browserslist/browserslist/releases/tag/4.28.7) resolves the relevant cache and custom-statistics issues.
- fflate is updated within its existing 0.7 range to 0.7.5, the backported fix for [malformed ZIP64 archive handling](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
- `@esbuild-kit/core-utils` still requires esbuild 0.18.20 through Drizzle's legacy loader. A narrowly scoped override uses 0.25.12, the same patched version already present under `drizzle-kit`; other esbuild consumers retain their own resolutions. The [maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) identifies 0.25.0 as the first fixed release. No Drizzle downgrade or audit suppression is applied.

The legacy loader calls esbuild's synchronous and asynchronous transform APIs. A [compatibility test](../tests/dependency-compatibility.test.mjs) exercises both through that actual consumer and evaluates the resulting JavaScript. The production build and migration generation provide additional integration checks. Remove the override when a supported Drizzle release stops pulling the affected loader or updates its requirement, after rerunning those checks and the full audit.

Audit results are a dated dependency check, not proof that the whole application is vulnerability-free. Re-run `npm audit` with registry access when reviewing a new dependency revision.
