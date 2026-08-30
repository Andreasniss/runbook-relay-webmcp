# Threat model

## Assets and trust boundaries

- Human approval state and the integrity of the staged mitigation
- Tool input schemas and tool-to-handler mapping
- Decision log and tool receipts
- Separation between the browser agent and the human approval action

The browser page is the demonstration boundary. There are no credentials, network mutations, production systems, or persistent records.

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

## Production requirements

A real implementation should enforce authorization and approval server-side, use short-lived scoped identities, bind approval to an immutable action digest, validate current state before execution, apply idempotency keys, redact telemetry, persist append-only audit records, and test replay, timeout, and partial-failure behavior.
