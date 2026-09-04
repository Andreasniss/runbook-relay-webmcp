# Hosting decision and release runbook

**Status, 4 September 2026:** the D1-backed Cloudflare Worker is live and verified on the owned domain. The previous ChatGPT Sites deployment remains available only as a temporary rollback path.

## Targets

| Target | Purpose | Current state |
|---|---|---|
| `runbook-relay.andreasnissen.dev` | Canonical owned-domain demo | Live and verified on Cloudflare Workers |
| `runbook-relay-webmcp.andreas-nissen.chatgpt.site` | Temporary rollback | Retained and available; not the canonical demo |
| `andreasnissen.dev/projects/runbook-relay/` | Canonical portfolio case study | Keep its demo link and evidence synchronized with the owned deployment |

The custom domain improves portability across reviewers. It does not imply that Cloudflare, OpenAI, Anthropic, or another provider reviewed or endorsed the project.

## Deployment contract

`wrangler.jsonc` declares the Worker, custom domain, runtime settings, observability, and binding-only D1 resource. `.openai/hosting.json` declares the same `DB` binding for ChatGPT Sites. `vite.config.ts` packages `.openai/hosting.json` and the immutable Drizzle migration bundle into `dist/.openai` after every production build.

The live owned deployment expects one pre-created D1 database named `runbook-relay-db`. After the code gates, the workflow resolves exactly one matching database through the scoped Cloudflare token and injects its identifier only into the ephemeral root and generated Wrangler configuration. The identifier is neither printed nor committed. Remote migrations complete before the Worker and custom domain are deployed.

The D1 schema has four tables: control sessions, approvals, executions, and receipts. Migrations are generated from `db/schema.ts`, committed under `drizzle/`, and never edited after application.

## Pre-release gates

From a clean checkout of the exact candidate commit:

```bash
npm ci
npm run lint
npm run typecheck
npm run eval:validate
npm test
npm run measure:agent
```

Confirm that:

- all repository tests pass;
- the production build contains the schema and optimization migrations under `dist/.openai/drizzle/`;
- `dist/server/wrangler.json` points its D1 migration directory at the packaged relative path;
- no generated live-evaluation result, API key, account ID, or environment file is included; and
- README, architecture, threat model, and portfolio evidence boundaries agree.

## ChatGPT Sites rollback

Keep the existing Sites deployment unchanged during the rollback window. If the owned deployment must be rolled back, use the last known-good saved Sites version, obtain explicit approval before any public redeployment, and repeat the complete behavior and visual checks before changing public links. Do not treat the Sites URL as a second canonical demo.

## Owned Cloudflare release

The manual `Deploy to Cloudflare Workers` GitHub Actions workflow is the production path. It requires a protected `cloudflare-production` environment with:

- `CLOUDFLARE_API_TOKEN`, narrowly scoped for Worker, D1, and custom-domain changes needed by this project;
- `CLOUDFLARE_ACCOUNT_ID`, for the account owning the `andreasnissen.dev` zone.

The workflow runs the complete code gates, applies D1 migrations remotely, and deploys only if the migration succeeds. No Cloudflare credential belongs in the repository.

Bootstrap checklist:

1. Confirm the target zone is active and the subdomain has no conflicting record.
2. Create `runbook-relay-db` on the Workers Free plan and verify its intended location before writing data.
3. Add the two protected environment secrets.
4. Run the manual workflow from the reviewed `main` commit.
5. Confirm the ephemeral binding-resolution, migration, and deployment logs reference that exact commit without printing resource identifiers.
6. Verify DNS, TLS, security headers, assets, API responses, D1 persistence, approval expiry, blocked execution, replay, reset, and native WebMCP discovery.
7. Change public links to the owned URL only after all checks pass.
8. Keep the Sites deployment through a rollback window.

## Live verification

Verification on 4 September 2026 confirmed:

- public A and AAAA resolution through Cloudflare;
- trusted TLS and HTTP 200 on the canonical URL;
- the production Worker, D1 binding, custom domain, and proxied Worker DNS record;
- desktop and narrow rendering, with no console warnings or errors;
- the visible five-tool contract and correct native-unavailable status in a browser without `document.modelContext`;
- a durable blocked execution before approval, followed by page approval and one successful synthetic execution;
- reset to the initial incident state while preserving receipts, plus persistence across reload;
- visible tool receipts, a verified receipt chain, the decision log, and the expected footer destinations; and
- zero external systems changed by the deterministic executor.

Native WebMCP discovery was not available in the test browser and is not claimed as verified. The labeled simulator was verified separately. MCP-B, Claude Desktop, Cursor, extension relay, and other-provider compatibility remain future evaluation paths.

## Rollback

For ChatGPT Sites, redeploy the last known-good saved version. For the owned target, use the Cloudflare Worker version rollback path. Do not roll back the database by editing an applied migration. If an additive schema change must be reverted, create a reviewed forward migration and confirm compatibility with the restored Worker.

If DNS or TLS is unhealthy, keep the portfolio link on the verified Sites fallback. Preserve receipt and execution data long enough to investigate; do not delete a D1 database as part of a routine application rollback.

## Remaining evidence work

- Verify native WebMCP discovery in a browser that exposes `document.modelContext`.
- Supply a future OpenAI API key, pinned model, and current pricing inputs before publishing empirical 50-task results.
- Evaluate any MCP-B or other-provider bridge separately and label its browser, client, transport, and version.

## References

- [Cloudflare automatic resource provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Wrangler GitHub Action](https://github.com/cloudflare/wrangler-action)
