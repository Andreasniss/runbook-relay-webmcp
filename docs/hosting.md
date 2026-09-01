# Hosting decision and release runbook

**Status, 1 September 2026:** the D1-backed release candidate is validated locally. Publishing the public ChatGPT Sites version requires explicit release approval. The owned-domain path remains prepared but blocked on Cloudflare credentials, DNS, TLS, and live verification.

## Targets

| Target | Purpose | Current state |
|---|---|---|
| `runbook-relay-webmcp.andreas-nissen.chatgpt.site` | Verified public fallback and first D1-backed release target | Existing public site; new version awaits approval |
| `runbook-relay.andreasnissen.dev` | Canonical owned-domain demo | Configuration and workflow ready; activation pending |
| `andreasnissen.dev/projects/runbook-relay/` | Canonical portfolio case study | Keep evidence synchronized after live verification |

The custom domain improves portability across reviewers. It does not imply that Cloudflare, OpenAI, Anthropic, or another provider reviewed or endorsed the project.

## Deployment contract

`wrangler.jsonc` declares the Worker, custom domain, runtime settings, observability, and binding-only D1 resource. `.openai/hosting.json` declares the same `DB` binding for ChatGPT Sites. `vite.config.ts` packages `.openai/hosting.json` and the immutable Drizzle migration bundle into `dist/.openai` after every production build.

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

- all 22 tests pass;
- the production build contains the schema and optimization migrations under `dist/.openai/drizzle/`;
- `dist/server/wrangler.json` points its D1 migration directory at the packaged relative path;
- no generated live-evaluation result, API key, account ID, or environment file is included; and
- README, architecture, threat model, and portfolio evidence boundaries agree.

## ChatGPT Sites release

1. Save a version from the reviewed source commit.
2. Confirm the version reports the D1 binding and migration bundle.
3. Because the site is public, obtain explicit approval before deployment.
4. Deploy only that exact saved version.
5. Verify the public version identity and application response.
6. Exercise a new session: snapshot, stage, blocked execution, approval, successful execution, exact replay, reset.
7. Reload between steps to confirm durable D1 state.
8. Inspect action digest, version, idempotency key, receipt head, total count, and chain-segment verification.
9. Verify wide and narrow layouts and the native/fallback labels.
10. Update portfolio claims only after these checks pass.

## Owned Cloudflare release

The manual `Deploy to Cloudflare Workers` GitHub Actions workflow is the preferred path. It requires a protected `cloudflare-production` environment with:

- `CLOUDFLARE_API_TOKEN`, narrowly scoped for Worker, D1, and custom-domain changes needed by this project;
- `CLOUDFLARE_ACCOUNT_ID`, for the account owning the `andreasnissen.dev` zone.

The workflow runs the complete code gates, applies D1 migrations remotely, and deploys only if the migration succeeds. No Cloudflare credential belongs in the repository.

Bootstrap checklist:

1. Confirm the target zone is active and the subdomain has no conflicting record.
2. Add the two protected environment secrets.
3. Run the manual workflow from the reviewed `main` commit.
4. Confirm migration and deployment logs reference that exact commit.
5. Verify DNS, TLS, security headers, assets, API responses, D1 persistence, approval expiry, blocked execution, replay, reset, and native WebMCP discovery.
6. Change public links to the owned URL only after all checks pass.
7. Keep the Sites deployment through a rollback window.

Automatic resource provisioning is convenient for bootstrap but is not a substitute for checking the created D1 resource, environment, location, and migration state in the Cloudflare account.

## Rollback

For ChatGPT Sites, redeploy the last known-good saved version. For the owned target, use the Cloudflare Worker version rollback path. Do not roll back the database by editing an applied migration. If an additive schema change must be reverted, create a reviewed forward migration and confirm compatibility with the restored Worker.

If DNS or TLS is unhealthy, keep the portfolio link on the verified Sites fallback. Preserve receipt and execution data long enough to investigate; do not delete a D1 database as part of a routine application rollback.

## External blockers

- Public Sites deployment approval
- Cloudflare account authentication and protected secrets
- DNS and TLS activation for the owned subdomain
- Live browser and behavior verification after each deployment
- A future OpenAI API key and pinned model for empirical 50-task results

## References

- [Cloudflare automatic resource provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Wrangler GitHub Action](https://github.com/cloudflare/wrangler-action)
