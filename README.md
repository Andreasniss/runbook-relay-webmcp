# Runbook Relay

A demo incident-response app where an agent can propose a mitigation, but the server checks approval before executing it.

**[Try the live demo](https://runbook-relay.andreasnissen.dev)**

The incident and action are synthetic. No production system is connected.

## Try it without setup

1. Open the demo and select **Start guided demo**.
2. Inspect the blocked attempt before approval.
3. Review the staged mitigation, select **Approve staged change**, then **Execute approved change**.
4. Inspect the decision log and saved receipt.

Expected result: execution is blocked without matching approval. Repeating the same request returns its stored result without applying the action twice.

The built-in simulator exercises the server policy. It does **not** prove native browser-agent discovery. For that path, expand **Test with your own AI agent** and confirm that all five native tools register. See [browser paths and compatibility](GUIDE.md#browser-paths).

## What to inspect

- **Server policy:** page controls and agent tools use the same API.
- **Bound approval:** the server checks the session, action, version, expiry and prior use.
- **Saved receipts:** Cloudflare D1 retains decisions and execution results.

No tool can create approval. Saying “I approve” in chat does not change application state. The server cannot independently prove that a human, rather than automation, clicked the page control.

Read the [architecture](docs/architecture.md), [threat model](docs/threat-model.md) or [case study](https://andreasnissen.dev/projects/runbook-relay/).

## Local development

Use Git, Node.js 22.13 or newer, and npm:

```sh
git clone https://github.com/Andreasniss/runbook-relay-webmcp.git
cd runbook-relay-webmcp
npm ci
npx wrangler d1 migrations apply DB --local
npm run dev
```

The migration creates the local D1 tables. Open the development URL printed by the server. Production hosting uses a separate existing database; see the [hosting runbook](docs/hosting.md).

## Evidence and limits

- [Control-plane tests](evals/control-plane/README.md) exercise production policy functions against local SQLite.
- [The 50-task evaluation contract](evals/live-tool-use/README.md) defines live-model evaluation. It is not a completed model benchmark; no success-rate, latency or cost result is claimed.
- Receipt hashes detect modification within a returned segment. They are not independently signed or anchored.
- Sessions are anonymous capabilities, not authenticated employee identities.

The [technical guide](GUIDE.md) preserves runtime details, tool definitions, verification commands and evidence boundaries. This is a reference app, not a production operations console.

## Contribute and reuse

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for setup and checks, [SECURITY.md](SECURITY.md) for reporting, and [PRIVACY.md](PRIVACY.md) before public uploads.

Built by [Andreas Nissen](https://andreasnissen.dev), with Codex assistance. Andreas owns requirements, architecture, evaluation, risk and release decisions. Inspired by OpenAI's [WebMCP Challenge](https://openai.com/webmcp-challenge/); not a submission or a provider or employer endorsement.

Copyright 2026 Andreas Nissen. Original code and technical documentation: [Apache-2.0](LICENSE), except where indicated. See [NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md), including the earlier MIT grant.
