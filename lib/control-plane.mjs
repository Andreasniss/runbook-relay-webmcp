export const INCIDENT_ID = "INC-2841";
export const APPROVAL_TTL_MS = 5 * 60 * 1000;
const SYNTHETIC_POST_ACTION_SATURATION_PERCENT = 51;

export const MITIGATIONS = Object.freeze([
  Object.freeze({ id: "restore-pool", title: "Restore database pool limit", summary: "Revert the pool from 40 to the last known-good value of 120.", risk: "Low", latency: "1.2 s", errorRate: "0.6%", tradeoff: "Returns database concurrency to the pre-change baseline." }),
  Object.freeze({ id: "shift-traffic", title: "Shift 30% traffic to eu-west-1", summary: "Temporarily move requests away from the saturated primary region.", risk: "Medium", latency: "1.8 s", errorRate: "1.1%", tradeoff: "Adds cross-region latency and increases standby cost." }),
  Object.freeze({ id: "scale-workers", title: "Scale API workers to 24", summary: "Add workers while leaving the current database limit unchanged.", risk: "Medium", latency: "3.9 s", errorRate: "6.4%", tradeoff: "Treats the symptom and may increase database contention." }),
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createActionDigest({ incidentId = INCIDENT_ID, mitigationId, resourceVersion }) {
  return sha256Hex(canonicalJson({ incidentId, mitigationId, resourceVersion }));
}

export async function createIdempotencyKey(sessionKey, actionDigest) {
  return `rr_${(await sha256Hex(`execute:${sessionKey}:${actionDigest}`)).slice(0, 32)}`;
}

export async function createReceipt(input) {
  const payload = {
    sessionKey: input.sessionKey,
    kind: input.kind,
    tool: input.tool,
    event: input.event,
    actorChannel: input.actorChannel,
    actorIdentity: input.actorIdentity,
    outcome: input.outcome,
    input: input.input ?? {},
    result: input.result ?? {},
    detail: input.detail,
    actionDigest: input.actionDigest ?? null,
    resourceVersion: input.resourceVersion,
    previousHash: input.previousHash ?? null,
    createdAt: input.createdAt,
  };
  const receiptHash = await sha256Hex(canonicalJson(payload));
  return { ...payload, receiptId: receiptHash.slice(0, 32), receiptHash };
}

export function getMitigation(mitigationId) {
  return MITIGATIONS.find((item) => item.id === mitigationId) ?? null;
}

export function deriveTelemetry(status, stagedMitigationId) {
  const mitigation = getMitigation(stagedMitigationId);
  if (["mitigated", "monitoring"].includes(status) && mitigation) {
    return { p95Latency: mitigation.latency, errorRate: mitigation.errorRate, saturation: "51%" };
  }
  if (status === "recovery-required") {
    return { p95Latency: "2.7 s", errorRate: "2.4%", saturation: "78%" };
  }
  return { p95Latency: "4.8 s", errorRate: "8.7%", saturation: "94%" };
}

export function mitigationMeetsTargets(mitigation) {
  return Number.parseFloat(mitigation.latency) < 1.5
    && Number.parseFloat(mitigation.errorRate) < 1
    && SYNTHETIC_POST_ACTION_SATURATION_PERCENT < 75;
}

export function parseStoredJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { unreadable: true };
  }
}

export function verifyReceiptChain(receipts) {
  for (let index = 0; index < receipts.length; index += 1) {
    const expectedPrevious = index === 0 ? null : receipts[index - 1].receiptHash;
    if ((receipts[index].previousHash ?? null) !== expectedPrevious) return false;
  }
  return true;
}

export function receiptHeadMatches(receipts, expectedHead) {
  return (receipts.at(-1)?.receiptHash ?? null) === (expectedHead ?? null);
}

export function evaluateExecutionGuard({ session, approval, existingExecution, expected, identityLabel, now }) {
  if (existingExecution) {
    return existingExecution.actionDigest === expected.actionDigest
      && existingExecution.resourceVersion === expected.resourceVersion
      ? { decision: "replay" }
      : { decision: "blocked", code: "idempotency_conflict", message: "The idempotency key is already bound to another action digest or resource version." };
  }
  if (!session.stagedMitigationId || !session.actionDigest || !session.idempotencyKey) {
    return { decision: "blocked", code: "nothing_staged", message: "No mitigation is staged." };
  }
  if (
    session.actionDigest !== expected.actionDigest
    || session.resourceVersion !== expected.resourceVersion
    || session.idempotencyKey !== expected.idempotencyKey
  ) {
    return { decision: "blocked", code: "stale_execution", message: "Execution did not match the current action digest, resource version, and idempotency key." };
  }
  if (!approval) {
    return { decision: "blocked", code: "approval_required", message: "A matching human approval is required before execution." };
  }
  if (approval.approverIdentity !== identityLabel) {
    return { decision: "blocked", code: "identity_mismatch", message: "The approval belongs to a different session identity." };
  }
  if (approval.consumedAt) {
    return { decision: "blocked", code: "approval_consumed", message: "The approval has already been consumed." };
  }
  if (approval.expiresAt <= now) {
    return { decision: "blocked", code: "approval_expired", message: "The approval expired before execution." };
  }
  return { decision: "allow" };
}

export function buildSyntheticExecutionResult(mitigation, outcome = "success") {
  if (outcome === "partial_failure") {
    return {
      executed: false,
      partialFailure: true,
      mitigation: mitigation.title,
      observed: { p95Latency: "2.7 s", errorRate: "2.4%", saturation: "78%" },
      recoveryRequired: true,
      serviceRecovered: false,
      replayed: false,
    };
  }
  return {
    executed: true,
    mitigation: mitigation.title,
    observed: { p95Latency: mitigation.latency, errorRate: mitigation.errorRate, saturation: "51%" },
    serviceRecovered: mitigationMeetsTargets(mitigation),
    replayed: false,
  };
}
