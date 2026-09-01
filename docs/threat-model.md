# Threat model

## Assets and trust boundaries

- Human approval state and the integrity of the staged mitigation
- Tool input schemas and tool-to-handler mapping
- Decision log and tool receipts
- Separation between the browser agent and the human approval action

The browser page is the demonstration boundary. There are no credentials, network mutations, production systems, or persistent records.

The current build has no cross-origin iframe, browser-extension, or local-relay transport. Adding one would create a new trust boundary rather than merely another client connection.

## Demonstrated controls

| Risk | Control in this reference |
|---|---|
| Agent self-approves a consequential action | No approval tool exists; approval is only available as a page interaction |
| Agent executes before approval | Execution fails closed and emits a blocked receipt |
| Tool supplies unexpected parameters | JSON Schemas reject additional properties and constrain mitigation IDs |
| Read operations are mistaken for writes | Read-only tools carry explicit annotations |
| Unsafe behavior is hidden | Inputs, results, caller, outcome, and audit events are visible |
| Demo state becomes ambiguous | Deterministic reset returns the scenario to a known baseline |

## Intentionally out of scope

The reference does not claim production-grade authentication, authorization, durable audit storage, tamper resistance, distributed locking, idempotency, infrastructure connectivity, or recovery from partial external failure.

## Conditional bridge boundary

If a future evaluation exposes these page tools through an MCP-B transport, it must add controls for the transport itself:

| Added risk | Required control before testing |
|---|---|
| An unrelated origin connects to the page | Use exact origin allowlists and an exact `targetOrigin`; never use `*` in production |
| A browser extension or external sender impersonates the intended client | Validate extension identity, sender URL, and connection identity |
| A local relay exposes tools beyond the intended machine or user | Bind narrowly, authenticate the client, and document relay exposure |
| Calls or approval state leak across clients | Create an isolated server/session per connection and tear it down on disconnect |
| Compatibility results are mistaken for native support | Label the path as MCP-B compatibility and report the client, browser, transport, and versions tested |

These controls are derived from the [MCP-B transport security guidance](https://docs.mcp-b.ai/packages/transports/reference). They are requirements for a future bridge evaluation, not controls claimed by the current build.

## Production requirements

A real implementation should enforce authorization and approval server-side, use short-lived scoped identities, bind approval to an immutable action digest, validate current state before execution, apply idempotency keys, redact telemetry, persist append-only audit records, and test replay, timeout, and partial-failure behavior.
