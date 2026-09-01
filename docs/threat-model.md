# Threat model

## Scope and assets

Runbook Relay protects the integrity of a synthetic incident workflow. The assets are:

- staged mitigation parameters and resource version;
- approval identity, scope, lifetime, and consumption state;
- idempotent execution ownership and stored result;
- receipt content, ordering, and attribution; and
- separation between agent-accessible tools and the page approval control.

The browser is untrusted. The same-origin API is the enforcement boundary. Cloudflare D1 is the durable system of record. The external action is deterministic test data and never reaches production infrastructure.

## Demonstrated controls

| Threat | Control | Remaining limitation |
|---|---|---|
| Agent self-approves through the tool surface | No approval tool exists; execution requires a matching approval row | An automated browser with general page-control capability could still click or call the page approval path |
| Conversational approval is treated as authorization | Chat text cannot create server approval state | No authenticated approver role or phishing-resistant presence proof |
| Staged parameters change after approval | Approval binds SHA-256 action digest and resource version | Digest is not digitally signed |
| Stale client executes old state | Compare-and-swap version and digest checks fail closed | Demo has one incident fixture rather than distributed infrastructure state |
| Approval is replayed | Five-minute expiry and single consumption | No enterprise revocation or policy service |
| Request is retried | Session-specific idempotency key returns the stored result | Only the synthetic executor is covered |
| Idempotency key is reused for another action | Server rejects a different action digest | No cross-service idempotency authority |
| Concurrent request writes a misleading receipt | State update and receipt insert share version and receipt-head guards | D1 remains the trusted storage boundary |
| Receipt content is altered | Snapshot recomputes SHA-256 contents and verifies links for the returned chain segment | Hashes are not signed or independently anchored |
| Cross-site request changes state | Exact same-origin `Origin`, JSON media type, `SameSite=Strict` cookie | Same-origin script compromise remains powerful |
| Clickjacking induces approval | Worker sends `X-Frame-Options: DENY` | Does not prevent deceptive interaction in the top-level page |
| Raw session token leaks from storage | Only a SHA-256-derived key is stored; cookie is `HttpOnly` and `Secure` on HTTPS | Browser compromise can still act within the session |
| Partial external action is reported as success | Partial-failure outcome enters `recovery-required` state and is covered by deterministic tests | No real compensating action or production recovery workflow |

## Identity boundary

The server issues an anonymous 256-bit session capability. It binds the staged action, approval, execution, and receipts to one browser session. It does not authenticate a named person, validate employment, resolve an enterprise role, or prove that a human initiated the approval request.

Calling the record a “human approval” describes the intended page interaction and the absence of an agent approval tool. It is not a claim of strong human-presence attestation. A production deployment should use organization identity, explicit authorization policy, step-up or phishing-resistant confirmation for consequential actions, and a server-verifiable approver identity distinct from the requesting agent.

## Audit boundary

Receipts are append-only by application policy, hash-linked, and content-verified when read. The latest 100 are returned with an anchor when the chain is longer. This catches accidental or unauthorized row modification visible within that segment.

A production audit design should additionally use immutable retention, independent export or transparency anchoring, trusted timestamps, access logging, redaction, data classification, retention/deletion policy, and alerting when verification fails.

## Input and prompt-injection boundary

Tool schemas reject extra properties and constrain mitigation IDs to a three-item catalog. Tool output and incident text are still untrusted model context. The model evaluation includes out-of-scope and prompt-injection-shaped tasks, but no live result exists yet.

Server policy never relies on model claims. Even if a model says an action is approved or fabricates a digest, execution must match durable state.

## Availability and recovery

The API returns bounded errors and refreshed state when possible. Exact retries are idempotent. A synthetic partial failure produces explicit recovery-required state rather than success.

The reference does not provide D1 backup/restore exercises, multi-region failover, queue-based reconciliation, circuit breaking, rate limiting, denial-of-service protection, or operator alerting. Those remain production requirements.

## Conditional bridge boundary

No cross-origin iframe, browser extension, local relay, MCP-B runtime, or external MCP transport is bundled. Adding one creates new requirements:

| Added threat | Required control before testing |
|---|---|
| Unrelated origin connects | Exact origin allowlist and exact `targetOrigin`; never production wildcard |
| Extension or sender impersonates a client | Validate extension identity, sender URL, and connection identity |
| Local relay exposes tools broadly | Bind narrowly, authenticate, authorize, and document network exposure |
| State leaks between clients | Isolate sessions per connection and tear them down on disconnect |
| Compatibility result is mistaken for native support | Report client, browser, transport, versions, and label the path as compatibility |

## Explicitly out of scope

- Production credentials or infrastructure mutation
- Authenticated enterprise identity and RBAC/ABAC
- Strong human-presence attestation
- Secret management and delegated cloud authorization
- Independently anchored or signed receipts
- Formal verification or external penetration testing
- Availability, retention, privacy, and compliance guarantees
- Empirical live-model success, latency, token, or cost claims

Report security findings through the process in [SECURITY.md](../SECURITY.md).
