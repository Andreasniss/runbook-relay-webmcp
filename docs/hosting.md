# Hosting decision and migration runbook

**Status:** deployment contract prepared; custom-domain activation pending Cloudflare authentication.

## Decision

Runbook Relay's canonical interactive URL will be
`https://runbook-relay.andreasnissen.dev`. The application will run as a
Cloudflare Worker with static assets, built from this repository with Vinext and
the Cloudflare Vite plugin.

The existing ChatGPT Sites deployment remains a temporary fallback until the
owned URL passes DNS, TLS, application, WebMCP, and reciprocal-link checks. The
portfolio page at `https://andreasnissen.dev/projects/runbook-relay/` remains the
canonical case study.

## Why this host

- The owned subdomain presents one portable identity to reviewers across AI
  providers.
- The current build already targets the Cloudflare Workers runtime, so the move
  does not add a second application architecture.
- The public demo is deterministic and has no database, object storage, secret,
  or external-system dependency.
- The deployment stays within the Cloudflare Workers Free plan while its traffic
  and features remain inside the documented free limits. Enabling a paid plan or
  paid add-on requires a separate decision.

This is a hosting choice, not evidence that Cloudflare, OpenAI, Anthropic, or any
other provider reviewed or endorsed the project.

## Deployment contract

`wrangler.jsonc` owns the Worker name, runtime compatibility, observability, and
the exact custom domain. `npm run build` creates the deployable Worker and client
assets. `npm run deploy:cloudflare` builds and deploys from an authenticated local
environment.

The manual `Deploy to Cloudflare Workers` GitHub Actions workflow is the preferred
production path. It repeats lint, build, and contract tests before deployment. It
requires these secrets in the `cloudflare-production` GitHub environment:

- `CLOUDFLARE_API_TOKEN`, scoped to edit Workers scripts and the Worker route for
  the `andreasnissen.dev` zone;
- `CLOUDFLARE_ACCOUNT_ID`, the Cloudflare account that owns that zone.

Do not commit either value. Keep the workflow manual during bootstrap so merging
the deployment contract cannot publish or alter DNS without an explicit run.

## Bootstrap checklist

1. Confirm that `andreasnissen.dev` is an active zone in the target Cloudflare
   account and that `runbook-relay.andreasnissen.dev` has no conflicting DNS
   record.
2. Add the two environment secrets listed above in GitHub.
3. Run the `Deploy to Cloudflare Workers` workflow from the reviewed `main`
   branch.
4. Verify the workflow's deployed commit and the custom-domain provisioning
   result.
5. Verify DNS resolution, a valid TLS certificate, the application shell and
   assets, the blocked-before-approval path, reset behavior, and native WebMCP
   discovery in a supported browser.
6. Change the repository README and portfolio case study from migration language
   to the owned URL only after those checks pass.
7. Keep the former ChatGPT Sites deployment during a short rollback window, then
   decide separately whether to remove it.

## Rollback

If the owned URL fails after a release, use Cloudflare Workers deployment rollback
to restore the last known-good Worker version. If DNS or TLS remains unhealthy,
keep the portfolio's live-demo link on the verified ChatGPT Sites fallback while
the owned route is repaired. Do not delete either deployment as part of rollback.

## References

- [Cloudflare Vite plugin deployment](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Wrangler GitHub Action](https://github.com/cloudflare/wrangler-action)
