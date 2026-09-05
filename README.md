# Runbook Relay

Runbook Relay is a deterministic incident-response control room for testing governed human-agent collaboration. A browser agent can inspect an incident, compare bounded mitigations, stage an action, and request execution through [WebMCP](https://github.com/webmachinelearning/webmcp). A server-side control plane decides whether execution is allowed.

[![CI](https://github.com/Andreasniss/runbook-relay-webmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Andreasniss/runbook-relay-webmcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-77e6ae.svg)](LICENSE)

**[Open the canonical live demo](https://runbook-relay.andreasnissen.dev)** · [Portfolio case study](https://andreasnissen.dev/projects/runbook-relay/) · [Architecture article](https://andreasnissen.dev/writing/from-browser-tool-to-governed-workflow/) · [Architecture](docs/architecture.md) · [Threat model](docs/threat-model.md) · [50-task evaluation](evals/live-tool-use/README.md) · [Hosting runbook](docs/hosting.md)

**Live deployment evidence, verified 4 September 2026:** the Cloudflare Worker resolves on the canonical domain with valid TLS and HTTP 200. Production build, lint, TypeScript, all 30 automated tests, the 50-case evaluation contract, and the structural agent-interface budget pass. Browser verification covered the blocked-before-approval path, page approval, successful synthetic execution, reset, durable receipts, and the decision log. The test browser did not expose native WebMCP, so native discovery is not claimed. The scenario and external action are synthetic; no production system is connected.

> This independent portfolio project was inspired by OpenAI's [WebMCP Challenge](https://openai.com/webmcp-challenge/). It is not a challenge submission and is not affiliated with or endorsed by OpenAI.

## Start here

- **No setup:** open the live demo and select **Start guided demo**. The proposed change and approval controls appear together at the top of the page. The built-in simulator calls the same server control plane as the page tools and stops at the page-approval boundary.
- **OpenAI native path:** use the latest ChatGPT desktop app with the built-in Browser and Site tools enabled. The page confirms when all five native tools are registered.
- **Claude, Cursor, and other MCP clients:** these require a separate page-to-MCP transport such as an MCP-B extension or local relay. That compatibility path is not bundled or claimed as tested in this repository.

The simulator proves application policy and durable state without an account or extension. It does not prove native browser tool discovery.

## What this version proves

| Control | Inspectable implementation |
|---|---|
| Server authority | Tool handlers and page controls call one same-origin API; React state is not the policy boundary |
| Durable state | Cloudflare D1 stores sessions, approvals, executions, and append-only receipts |
| Bound approval | Approval records include the server-issued session identity, immutable action digest, and resource version |
| Short lifetime | Approval expires after five minutes and is consumed by the first matching execution |
| Replay safety | A deterministic idempotency key returns the prior result for the same action and rejects conflicting reuse |
| Concurrency safety | Compare-and-swap updates bind receipts and mutations to the state version and receipt-chain head |
| Audit integrity | Receipt contents and links are SHA-256 verified for the latest returned chain segment |
| Failure behavior | Deterministic tests cover missing, mismatched, expired, consumed, stale, replayed, and partial-failure states |
| Model evaluation | A versioned 50-task harness captures traces, latency, tokens, estimated cost, request IDs, automatic grades, and human labels |

The live-model runner is intentionally not presented as empirical evidence yet. It requires an explicitly supplied API key and pinned model; no credential or result is bundled in this repository.

## Review it in three minutes

1. Open the demo on desktop and inspect the **Server control active** status.
2. Click **Start guided demo**. For native WebMCP, expand **Test with your own AI agent**; its labeled copy buttons copy prompts to paste into your agent chat.
3. Verify that pre-approval execution creates a durable blocked receipt.
4. Stage a mitigation, approve it in the page, execute once, and inspect the action digest, resource version, idempotency key, and receipt hash.
5. Read the [architecture](docs/architecture.md), [threat model](docs/threat-model.md), and [tests](tests/).

## Tool surface

| Tool | Effect | Server policy |
|---|---|---|
| `get_incident_snapshot` | Reads incident, telemetry, staged action, approval, and version | Read-only; receipt recorded |
| `compare_mitigations` | Returns three deterministic projections | Read-only; bounded catalog |
| `stage_mitigation` | Binds one catalog action to a new version and digest | Never approves or executes |
| `execute_approved_mitigation` | Requests the synthetic external action | Identity, digest, version, expiry, consumption, and idempotency checked |
| `reset_incident_simulation` | Returns to the initial fixture state | Prior receipts remain append-only |

No tool can create an approval. The approval UI sends the current action digest and resource version to the same server control plane. A chat instruction such as “I approve” has no effect on control state.

## Runtime design

The page registers five tools through `document.modelContext.registerTool()`. Native WebMCP calls, the labeled simulator, and human page controls all use `/api/control-plane`; Cloudflare D1 is the shared system of record. The server issues a random 256-bit `HttpOnly`, `SameSite=Strict` session cookie and stores only its SHA-256-derived key.

The execution guard checks:

1. a catalog action is staged;
2. the requested action digest, resource version, and idempotency key match current state;
3. a matching approval belongs to the same session identity;
4. that approval is unused and unexpired; and
5. no conflicting execution already owns the idempotency key.

Successful execution consumes the approval and stores the synthetic result. Repeating the exact request returns that stored result without applying the action twice.

The [architecture note](docs/architecture.md) details data flow and transaction guards. The [threat model](docs/threat-model.md) distinguishes demonstrated controls from the authenticated identity, independently anchored audit, and real infrastructure controls a production system would still need.

## Browser paths

- **Native path:** use a supported ChatGPT desktop Browser or a compatible Chrome WebMCP developer build. Confirm **Native WebMCP active · 5 tools registered** before treating discovery as verified.
- **Fallback path:** the built-in simulator calls the same server API and is clearly labeled. It proves the application control path, not native browser tool discovery.
- **Compatibility bridge:** no MCP-B polyfill, extension relay, or external MCP transport is bundled. A future bridge result must be labeled separately from native WebMCP.

## Local development

Prerequisites: Node.js 22.13 or newer and npm.

```bash
npm ci
npx wrangler d1 migrations apply DB --local
npm run dev
```

The D1 binding is declared without a committed database ID. The Cloudflare workflow resolves the pre-created production database into ephemeral runner configuration, while local development uses Wrangler's local D1 store. Migration `drizzle/0000_dizzy_karen_page.sql` creates the four durable tables and indexes.

## Quality gates

```bash
npm run lint
npm run typecheck
npm run eval:validate
npm test
npm run measure:agent
```

`npm test` performs a production build, renders the Worker, and runs 30 contract, control-plane, deployment-bootstrap, evaluation, and interface-budget tests. `npm run eval:validate` verifies exactly 50 categorized cases, 18 adversarial cases, and strict bounded tool schemas. `npm run measure:agent` is a tokenizer-independent structural regression guard, not a live-model benchmark.

## Deployment

The canonical deployment is live on Cloudflare Workers at [runbook-relay.andreasnissen.dev](https://runbook-relay.andreasnissen.dev). The protected GitHub Actions workflow resolves the existing D1 binding without printing or committing its identifier, applies remote migrations, and then deploys the Worker and custom domain. The previous [ChatGPT Sites deployment](https://runbook-relay-webmcp.andreas-nissen.chatgpt.site) is retained only as a temporary rollback path; see [docs/hosting.md](docs/hosting.md).

## Evidence boundaries

This is a reference application, not a production operations console.

- The “external action” changes only a synthetic incident fixture.
- The server-issued session is an anonymous scoped capability, not an authenticated employee identity or role.
- The approval endpoint binds an action to that session, but the server cannot independently prove a human rather than browser automation initiated the page click.
- Receipt hashes make modification detectable within the returned chain segment; they are not signed or anchored in an independent transparency system.
- D1 is durable application storage, not a substitute for enterprise identity, secrets management, infrastructure authorization, retention policy, or multi-region recovery.
- The live-model suite has not run, so this repository makes no model success-rate, latency, token, or cost claim.

## Ownership and AI assistance

Andreas Nissen owns the project intent, architecture, requirements, evaluation criteria, risk decisions, and release decisions, and reviews every merged change. Codex assisted with implementation and documentation. AI assistance is treated as an engineering tool, not as an independent human reviewer.

This is a personal demo project. Views and opinions are Andreas's own. It is not affiliated with or endorsed by his employer.

See [SECURITY.md](SECURITY.md) for responsible reporting guidance.

## References

- [OpenAI Site tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP explainer and specification work](https://github.com/webmachinelearning/webmcp)
- [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp)
- [OpenAI Responses API](https://developers.openai.com/api/reference/responses/overview/)
- [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## License

[MIT](LICENSE)
