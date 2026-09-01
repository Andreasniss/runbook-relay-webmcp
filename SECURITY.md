# Security

Runbook Relay is a deterministic reference application. It contains no credentials and does not connect to or change production systems. Its server-side control state is durable, but its session identity is anonymous and is not production authentication.

For non-sensitive security findings, open a GitHub issue with reproduction steps and the affected version. Do not include credentials, private data, or exploit material in a public issue. For a potentially sensitive report, contact the maintainer through the GitHub profile linked in the repository before sharing details.

Reports involving forged approval state, replay or idempotency bypass, cross-session access, receipt-chain integrity, same-origin enforcement, or unsafe migration behavior are especially useful. The demonstrated controls and explicit limitations are documented in [the threat model](docs/threat-model.md).
