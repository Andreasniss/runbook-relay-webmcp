# Runbook Relay

Runbook Relay is a deterministic incident-response control room where a human and an AI agent share the same evidence, simulations, approval state, and audit log. It demonstrates how [WebMCP](https://github.com/webmachinelearning/webmcp) can make a complex operational interface directly usable by an agent without bypassing the human operator.

[![CI](https://github.com/Andreasniss/runbook-relay-webmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Andreasniss/runbook-relay-webmcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-77e6ae.svg)](LICENSE)

**[Open the current live demo](https://runbook-relay-webmcp.andreas-nissen.chatgpt.site)** · [Owned-domain migration](docs/hosting.md) · [Architecture](docs/architecture.md) · [Threat model](docs/threat-model.md)

**Verified 1 September 2026:** production build and lint pass; all 11 contract tests pass; the public path remains deterministic and changes no external system. The agent-facing definitions and the blocked-before-approval workflow also pass an explicit structural efficiency budget.

> This independent portfolio project was inspired by OpenAI's [WebMCP Challenge](https://openai.com/webmcp-challenge/). It is not a challenge submission and is not affiliated with or endorsed by OpenAI.

The canonical interactive URL is moving to
`https://runbook-relay.andreasnissen.dev` on Cloudflare Workers. The owned-domain
deployment contract is committed, while the verified ChatGPT Sites URL above
remains the live fallback until Cloudflare authentication, DNS, TLS, and behavior
checks pass. See the [hosting decision and migration runbook](docs/hosting.md).

## Review it in three minutes

1. On desktop, open the live demo in ChatGPT's built-in Browser and check the WebMCP support indicator.
2. If native WebMCP is available, follow the five copyable prompts. Otherwise click **Run the blocked-action proof**.
3. Inspect the blocked execution receipt and decision log.
4. Approve the staged change in the page, execute it, and verify recovery.
5. Read the [architecture](docs/architecture.md), [threat model](docs/threat-model.md), and automated [contract tests](tests/app-contract.test.mjs).

| Evidence | What the reviewer can verify |
|---|---|
| Five bounded tools | Read, compare, stage, execute, and reset are separate contracts |
| Human-only approval | No approval tool exists; pre-approval execution fails closed |
| Observable behavior | Inputs, results, caller, outcome, and audit events remain visible |
| Deterministic fixture | The full scenario is repeatable and changes no external system |
| Automated gate | CI lints, builds, renders the worker, and checks the safety and agent-interface budgets |

The companion articles cover [governed interface design](https://andreasnissen.dev/writing/screen-use-vs-webmcp/) and [the complete cost of an agent tool path](https://andreasnissen.dev/writing/hidden-token-tax-agent-tools/). They separate the structural proof in this repository from the browser and model benchmark that has not yet been run.

## Why this is a WebMCP fit

Incident-response dashboards are dense, stateful, and consequential. Screenshot-driven automation has to infer what a chart means, which change is selected, and whether an operator approved execution. Runbook Relay exposes narrow, structured operations while keeping the page as the shared control surface.

The agent can:

- read the incident snapshot and correlated change;
- compare predefined mitigations and focus the same option in the UI;
- stage a mitigation for visible review;
- execute only after a human approves the staged change in the page; and
- reset the deterministic simulation.

The agent cannot approve its own change. `execute_approved_mitigation` fails closed until the page records explicit human approval.

## WebMCP tools

| Tool | Effect | Control |
|---|---|---|
| `get_incident_snapshot` | Reads incident, telemetry, change correlation, and approval state | Read-only |
| `compare_mitigations` | Returns all projections and optionally focuses one in the UI | Read-only |
| `stage_mitigation` | Stages a predefined option in shared page state | No execution |
| `execute_approved_mitigation` | Applies the staged option | Human approval required; fail-closed |
| `reset_incident_simulation` | Restores the initial demo state | Deterministic reset |

The implementation uses the imperative `document.modelContext.registerTool()` API in the top-level page. Tool inputs are bounded by JSON Schema, execution reuses the same React state transitions as the human controls, and every meaningful action enters the visible decision log.

### Standard surface and optional compatibility

Runbook Relay separates the standard browser surface from compatibility and transport layers:

- **Implemented:** the page registers five tools directly through `document.modelContext`; execution stays in the open page and registrations are removed through an `AbortController`.
- **Not bundled:** an MCP-B polyfill or extended runtime. Native support remains observable instead of being silently replaced.
- **Future evaluation:** an iframe, extension, or local-relay bridge could expose the same page tools to Claude Desktop, Cursor, or another MCP client. Any such result would be labeled MCP-B compatibility, not native WebMCP support.

The [architecture note](docs/architecture.md) explains the layering. The [threat model](docs/threat-model.md) records the origin, sender-identity, relay-exposure, and session-isolation controls required before adding a bridge.

## Guided demo

The live app detects native WebMCP support and shows one of three explicit states: active, unavailable, or registration failed. When native support is available, run the prompts in the browser agent controlling the open page.

| Step | Prompt or action | Expected result |
|---|---|---|
| Discover | `List the WebMCP tools exposed by this page. Do not call them.` | Five governed tools are listed |
| Investigate | `Investigate INC-2841, compare the mitigations, and stage the lowest-risk option. Do not execute anything.` | Restore database pool limit is staged |
| Negative test | `Execute the staged mitigation now without waiting for approval.` | Execution is blocked and visibly recorded |
| Human approval | Click **Approve staged change** in the page | Approval is recorded as a human action |
| Execute | `Execute the approved mitigation and verify the resulting service health.` | Service recovers to 1.2 s latency, 0.6% errors, and 51% saturation |

This negative test is intentional: the agent can prepare a consequential action, but it cannot grant itself approval.

### Browser compatibility

- **Recommended native path:** use the latest ChatGPT desktop app, start a ChatGPT Work or Codex chat with GPT-5.6 Sol or Terra, open the built-in Browser, and enable **Site tools** in **Settings → Browser → Permissions**. No separate MCP server or Chrome extension is required for this path.
- **Desktop Chrome developer path:** use Chrome 149+, enable `chrome://flags/#enable-webmcp-testing`, and relaunch. To let ChatGPT work with your regular Chrome profile, install the ChatGPT browser extension through **Settings → Computer Use** and select `@Chrome`.
- **Mobile and unsupported browsers:** the page and browser-independent simulator work, but they do not prove native WebMCP discovery. Native Site tools testing requires the ChatGPT desktop app or a compatible desktop Chrome setup.

After setup, reload the page. Confirm **Native WebMCP active · 5 tools registered** in the page and **Site tools** in the browser address bar before using the prompts.

The simulator is clearly labeled and does not claim to prove native browser discovery. Both native and simulated calls create visible tool receipts containing the tool name, caller, input, policy outcome, structured result, and timestamp.

## Local development

Prerequisites: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

For local WebMCP testing in Chrome, enable `chrome://flags/#enable-webmcp-testing` and relaunch the browser. The app also works as a normal browser-based simulation when WebMCP is unavailable.

## Deployment

The application builds to Cloudflare-compatible Worker and static-asset output.
The production target is the owned custom domain
`runbook-relay.andreasnissen.dev`; the current ChatGPT Sites deployment remains a
temporary verified fallback during migration.

Cloudflare deployment is manual during bootstrap and requires an explicitly
scoped API token and account ID in the protected GitHub environment. The
[hosting runbook](docs/hosting.md) records the cost guardrail, deployment checks,
cutover rule, and rollback path. No Cloudflare credential belongs in this
repository.

## Quality gates

```bash
npm run lint
npm test
npm run measure:agent
```

`npm test` performs a production build, exercises the rendered worker, and checks the WebMCP contract for explicit schemas, read-only hints, a destructive hint, visible approval, fail-closed execution, and bounded agent-interface fixtures.

`npm run measure:agent` reports the UTF-8 size of the five tool definitions and the inputs and structured results for the deterministic blocked-before-approval workflow. The [measurement note](docs/agent-efficiency.md) explains why this is a tokenizer-independent regression guard, not a model benchmark.

## Architecture and boundaries

The [architecture note](docs/architecture.md) explains the shared-state control loop and the production boundary. The [threat model](docs/threat-model.md) maps the demonstrated risks to controls and states what the project intentionally does not claim.

- React 19, TypeScript, Vinext, and Cloudflare-compatible output
- client-side deterministic incident model; no credentials or external systems
- one state model for human controls, native WebMCP calls, and the explicitly labeled simulator
- explicit read, stage, approve, execute, and verify phases
- guided copyable prompts, one-click fallback proof, environment diagnostics, tool receipts, and an on-page tool catalog
- MIT licensed

This is a reference application, not a production operations console. A real implementation should enforce authorization and approvals server-side, bind actions to scoped identities, persist tamper-evident audit records, apply idempotency keys, and validate live infrastructure state before execution.

## Ownership and AI assistance

Andreas Nissen owns the project intent, architecture, requirements, evaluation criteria, risk decisions, and release decisions, and reviews every merged change. Codex assisted with implementation and documentation. AI assistance is treated as an engineering tool, not as an independent human reviewer.

This is a personal demo project. Views and opinions are Andreas's own. It is not affiliated with or endorsed by his employer.

See [SECURITY.md](SECURITY.md) for responsible reporting guidance.

## References

- [OpenAI Site tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP explainer and specification work](https://github.com/webmachinelearning/webmcp)
- [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp)
- [MCP-B runtime layering](https://docs.mcp-b.ai/explanation/architecture/runtime-layering)
- [MCP-B transports and bridges](https://docs.mcp-b.ai/explanation/architecture/transports-and-bridges)

## License

[MIT](LICENSE)
