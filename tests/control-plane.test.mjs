import assert from "node:assert/strict";
import test from "node:test";
import {
  MITIGATIONS,
  buildSyntheticExecutionResult,
  canonicalJson,
  createActionDigest,
  createIdempotencyKey,
  createReceipt,
  evaluateExecutionGuard,
  receiptHeadMatches,
  verifyReceiptChain,
} from "../lib/control-plane.mjs";

test("canonical action digests bind parameters and resource version", async () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const first = await createActionDigest({ mitigationId: "restore-pool", resourceVersion: 2 });
  const reordered = await createActionDigest({ resourceVersion: 2, mitigationId: "restore-pool" });
  const changedVersion = await createActionDigest({ mitigationId: "restore-pool", resourceVersion: 3 });
  assert.equal(first, reordered);
  assert.notEqual(first, changedVersion);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("idempotency keys stay stable for one session and action", async () => {
  const digest = await createActionDigest({ mitigationId: "restore-pool", resourceVersion: 2 });
  const first = await createIdempotencyKey("session-a", digest);
  assert.equal(first, await createIdempotencyKey("session-a", digest));
  assert.notEqual(first, await createIdempotencyKey("session-b", digest));
  assert.match(first, /^rr_[a-f0-9]{32}$/);
});

test("receipt hashes create an append-only verifiable chain", async () => {
  const base = {
    sessionKey: "session-a",
    kind: "tool",
    actorChannel: "native",
    actorIdentity: "session:123",
    outcome: "success",
    resourceVersion: 1,
    createdAt: "2026-09-01T20:00:00.000Z",
  };
  const first = await createReceipt({ ...base, tool: "get_incident_snapshot", event: "Snapshot read", detail: "State returned." });
  const second = await createReceipt({ ...base, tool: "compare_mitigations", event: "Options compared", detail: "Options returned.", previousHash: first.receiptHash });
  assert.equal(verifyReceiptChain([first, second]), true);
  assert.equal(verifyReceiptChain([first, { ...second, previousHash: "tampered" }]), false);
  assert.equal(receiptHeadMatches([first, second], second.receiptHash), true);
  assert.equal(receiptHeadMatches([first], second.receiptHash), false);
});

const current = {
  stagedMitigationId: "restore-pool",
  actionDigest: "a".repeat(64),
  idempotencyKey: `rr_${"b".repeat(32)}`,
  resourceVersion: 2,
};
const expected = {
  actionDigest: current.actionDigest,
  idempotencyKey: current.idempotencyKey,
  resourceVersion: current.resourceVersion,
};
const activeApproval = {
  approverIdentity: "session:123",
  consumedAt: null,
  expiresAt: "2026-09-01T20:05:00.000Z",
};
const guardBase = {
  session: current,
  approval: activeApproval,
  existingExecution: null,
  expected,
  identityLabel: "session:123",
  now: "2026-09-01T20:01:00.000Z",
};

test("execution guard fails closed across approval, identity, expiry, and stale-state cases", () => {
  assert.deepEqual(evaluateExecutionGuard(guardBase), { decision: "allow" });
  assert.equal(evaluateExecutionGuard({ ...guardBase, approval: null }).code, "approval_required");
  assert.equal(evaluateExecutionGuard({ ...guardBase, approval: { ...activeApproval, approverIdentity: "session:other" } }).code, "identity_mismatch");
  assert.equal(evaluateExecutionGuard({ ...guardBase, approval: { ...activeApproval, expiresAt: guardBase.now } }).code, "approval_expired");
  assert.equal(evaluateExecutionGuard({ ...guardBase, approval: { ...activeApproval, consumedAt: guardBase.now } }).code, "approval_consumed");
  assert.equal(evaluateExecutionGuard({ ...guardBase, expected: { ...expected, resourceVersion: 1 } }).code, "stale_execution");
  assert.equal(evaluateExecutionGuard({ ...guardBase, session: { ...current, stagedMitigationId: null } }).code, "nothing_staged");
});

test("execution guard returns only the prior result for a matching replay", () => {
  assert.deepEqual(evaluateExecutionGuard({ ...guardBase, existingExecution: { actionDigest: expected.actionDigest } }), { decision: "replay" });
  assert.equal(evaluateExecutionGuard({ ...guardBase, existingExecution: { actionDigest: "c".repeat(64) } }).code, "idempotency_conflict");
});

test("partial external failure produces recovery-required evidence", () => {
  const failure = buildSyntheticExecutionResult(MITIGATIONS[0], "partial_failure");
  assert.equal(failure.executed, false);
  assert.equal(failure.partialFailure, true);
  assert.equal(failure.recoveryRequired, true);
  assert.deepEqual(failure.observed, { p95Latency: "2.7 s", errorRate: "2.4%", saturation: "78%" });
});
