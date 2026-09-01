import {
  APPROVAL_TTL_MS,
  INCIDENT_ID,
  MITIGATIONS,
  createActionDigest,
  createIdempotencyKey,
  createReceipt,
  deriveTelemetry,
  evaluateExecutionGuard,
  getMitigation,
  parseStoredJson,
  receiptHeadMatches,
  sha256Hex,
  buildSyntheticExecutionResult,
} from "../lib/control-plane.mjs";

type ActorChannel = "native" | "simulator" | "human" | "system";
type ReceiptOutcome = "success" | "blocked" | "error" | "partial_failure";
type IncidentStatus = "investigating" | "awaiting-approval" | "mitigated" | "recovery-required";

type SessionRow = {
  session_key: string;
  identity_label: string;
  incident_id: string;
  status: IncidentStatus;
  resource_version: number;
  staged_mitigation_id: string | null;
  action_digest: string | null;
  idempotency_key: string | null;
  last_receipt_hash: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalRow = {
  approval_id: string;
  session_key: string;
  action_digest: string;
  resource_version: number;
  approver_identity: string;
  approved_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type ExecutionRow = {
  execution_id: string;
  session_key: string;
  action_digest: string;
  resource_version: number;
  idempotency_key: string;
  outcome: ReceiptOutcome;
  result_json: string;
  created_at: string;
};

type ReceiptRow = {
  receipt_id: string;
  session_key: string;
  kind: "audit" | "tool";
  tool: string;
  event: string;
  actor_channel: ActorChannel;
  actor_identity: string;
  outcome: ReceiptOutcome;
  input_json: string;
  result_json: string;
  detail: string;
  action_digest: string | null;
  resource_version: number;
  previous_hash: string | null;
  receipt_hash: string;
  created_at: string;
};

type ReceiptInput = {
  sessionKey: string;
  kind: "audit" | "tool";
  tool: string;
  event: string;
  actorChannel: ActorChannel;
  actorIdentity: string;
  outcome: ReceiptOutcome;
  input?: unknown;
  result?: unknown;
  detail: string;
  actionDigest?: string | null;
  resourceVersion: number;
  previousHash?: string | null;
  createdAt: string;
};

export class ControlPlaneError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "ControlPlaneError";
  }
}

function changes(result: D1Result): number {
  return Number(result.meta?.changes ?? 0);
}

function receiptInsert(db: D1Database, receipt: Awaited<ReturnType<typeof createReceipt>>) {
  return db.prepare(`
    INSERT OR IGNORE INTO receipts (
      receipt_id, session_key, kind, tool, event, actor_channel,
      actor_identity, outcome, input_json, result_json, detail,
      action_digest, resource_version, previous_hash, receipt_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    receipt.receiptId,
    receipt.sessionKey,
    receipt.kind,
    receipt.tool,
    receipt.event,
    receipt.actorChannel,
    receipt.actorIdentity,
    receipt.outcome,
    JSON.stringify(receipt.input),
    JSON.stringify(receipt.result),
    receipt.detail,
    receipt.actionDigest,
    receipt.resourceVersion,
    receipt.previousHash,
    receipt.receiptHash,
    receipt.createdAt,
  );
}

function receiptInsertWhenSessionHead(
  db: D1Database,
  receipt: Awaited<ReturnType<typeof createReceipt>>,
) {
  return db.prepare(`
    INSERT OR IGNORE INTO receipts (
      receipt_id, session_key, kind, tool, event, actor_channel,
      actor_identity, outcome, input_json, result_json, detail,
      action_digest, resource_version, previous_hash, receipt_hash, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM control_sessions
      WHERE session_key = ? AND resource_version = ? AND last_receipt_hash = ?
    )
  `).bind(
    receipt.receiptId,
    receipt.sessionKey,
    receipt.kind,
    receipt.tool,
    receipt.event,
    receipt.actorChannel,
    receipt.actorIdentity,
    receipt.outcome,
    JSON.stringify(receipt.input),
    JSON.stringify(receipt.result),
    receipt.detail,
    receipt.actionDigest,
    receipt.resourceVersion,
    receipt.previousHash,
    receipt.receiptHash,
    receipt.createdAt,
    receipt.sessionKey,
    receipt.resourceVersion,
    receipt.receiptHash,
  );
}

async function getSession(db: D1Database, sessionKey: string) {
  return db.prepare("SELECT * FROM control_sessions WHERE session_key = ?")
    .bind(sessionKey)
    .first<SessionRow>();
}

async function ensureSession(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  now: string,
): Promise<SessionRow> {
  const existing = await getSession(db, sessionKey);
  if (existing) return existing;

  const opened = await createReceipt({
    sessionKey,
    kind: "audit",
    tool: "incident_opened",
    event: "Incident opened",
    actorChannel: "system",
    actorIdentity: "control-plane",
    outcome: "success",
    result: { sloBurn: "14x", duration: "5 minutes" },
    detail: "Checkout API SLO burn exceeded 14x for five minutes.",
    resourceVersion: 1,
    createdAt: now,
  });
  opened.receiptId = (await sha256Hex(`bootstrap:opened:${sessionKey}`)).slice(0, 32);

  const correlated = await createReceipt({
    sessionKey,
    kind: "audit",
    tool: "change_correlated",
    event: "Change correlated",
    actorChannel: "system",
    actorIdentity: "control-plane",
    outcome: "success",
    result: { changeId: "db-pool-842", confidence: 0.93 },
    detail: "db-pool-842 reduced max connections from 120 to 40.",
    resourceVersion: 1,
    previousHash: opened.receiptHash,
    createdAt: now,
  });
  correlated.receiptId = (await sha256Hex(`bootstrap:correlated:${sessionKey}`)).slice(0, 32);

  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO control_sessions (
        session_key, identity_label, incident_id, status, resource_version,
        staged_mitigation_id, action_digest, idempotency_key,
        last_receipt_hash, created_at, updated_at
      ) VALUES (?, ?, ?, 'investigating', 1, NULL, NULL, NULL, ?, ?, ?)
    `).bind(sessionKey, identityLabel, INCIDENT_ID, correlated.receiptHash, now, now),
    receiptInsert(db, opened),
    receiptInsert(db, correlated),
  ]);

  const created = await getSession(db, sessionKey);
  if (!created) throw new ControlPlaneError("session_unavailable", "The durable session could not be created.", 500);
  return created;
}

async function getCurrentApproval(db: D1Database, session: SessionRow) {
  if (!session.action_digest) return null;
  return db.prepare(`
    SELECT * FROM approvals
    WHERE session_key = ? AND action_digest = ? AND resource_version = ?
    ORDER BY approved_at DESC LIMIT 1
  `).bind(session.session_key, session.action_digest, session.resource_version).first<ApprovalRow>();
}

function mapReceipt(row: ReceiptRow) {
  return {
    id: row.receipt_id,
    kind: row.kind,
    tool: row.tool,
    event: row.event,
    actor: row.actor_channel,
    actorIdentity: row.actor_identity,
    outcome: row.outcome,
    input: parseStoredJson(row.input_json),
    result: parseStoredJson(row.result_json),
    detail: row.detail,
    actionDigest: row.action_digest,
    resourceVersion: row.resource_version,
    previousHash: row.previous_hash,
    receiptHash: row.receipt_hash,
    createdAt: row.created_at,
  };
}

export async function getControlPlaneSnapshot(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  now = new Date().toISOString(),
) {
  const session = await ensureSession(db, sessionKey, identityLabel, now);
  const approval = await getCurrentApproval(db, session);
  const [receiptResult, receiptCount] = await Promise.all([
    db.prepare(`
      SELECT * FROM receipts WHERE session_key = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 101
    `).bind(sessionKey).all<ReceiptRow>(),
    db.prepare("SELECT COUNT(*) AS total FROM receipts WHERE session_key = ?")
      .bind(sessionKey)
      .first<{ total: number }>(),
  ]);
  const receiptWindow = receiptResult.results.toReversed().map(mapReceipt);
  const anchor = receiptWindow.length > 100 ? receiptWindow[0] : null;
  const receipts = anchor ? receiptWindow.slice(1) : receiptWindow;
  const activeApproval = Boolean(
    approval
    && approval.approver_identity === session.identity_label
    && !approval.consumed_at
    && approval.expires_at > now,
  );
  let expectedPrevious = anchor?.receiptHash ?? null;
  let chainVerified = true;
  for (const receipt of anchor ? [anchor, ...receipts] : receipts) {
    const expected = await createReceipt({
      sessionKey,
      kind: receipt.kind,
      tool: receipt.tool,
      event: receipt.event,
      actorChannel: receipt.actor,
      actorIdentity: receipt.actorIdentity,
      outcome: receipt.outcome,
      input: receipt.input,
      result: receipt.result,
      detail: receipt.detail,
      actionDigest: receipt.actionDigest,
      resourceVersion: receipt.resourceVersion,
      previousHash: receipt.previousHash,
      createdAt: receipt.createdAt,
    });
    if (receipt === anchor) {
      expectedPrevious = receipt.receiptHash;
      chainVerified = chainVerified && expected.receiptHash === receipt.receiptHash;
      continue;
    }
    chainVerified = chainVerified
      && receipt.previousHash === expectedPrevious
      && expected.receiptHash === receipt.receiptHash;
    expectedPrevious = receipt.receiptHash;
  }
  chainVerified = chainVerified && receiptHeadMatches(receipts, session.last_receipt_hash);

  return {
    session: {
      identity: session.identity_label,
      persistence: "Cloudflare D1",
    },
    incident: {
      id: session.incident_id,
      service: "checkout-api",
      severity: "SEV-2",
      status: session.status,
    },
    telemetry: deriveTelemetry(session.status, session.staged_mitigation_id),
    correlatedChange: {
      id: "db-pool-842",
      confidence: 0.93,
      change: "max connections 120 -> 40",
    },
    control: {
      resourceVersion: session.resource_version,
      staged: session.staged_mitigation_id ? getMitigation(session.staged_mitigation_id) : null,
      actionDigest: session.action_digest,
      idempotencyKey: session.idempotency_key,
      humanApproved: activeApproval,
      approval: approval ? {
        approvalId: approval.approval_id,
        approverIdentity: approval.approver_identity,
        approvedAt: approval.approved_at,
        expiresAt: approval.expires_at,
        consumedAt: approval.consumed_at,
        active: activeApproval,
      } : null,
    },
    receiptChain: {
      count: Number(receiptCount?.total ?? receipts.length),
      verified: chainVerified,
      head: receipts.at(-1)?.receiptHash ?? null,
      returned: receipts.length,
      truncated: Number(receiptCount?.total ?? receipts.length) > receipts.length,
    },
    receipts: receipts.filter((receipt) => receipt.kind === "tool").toReversed(),
    audit: receipts.map((receipt) => ({
      id: receipt.id,
      actor: receipt.actor,
      action: receipt.event,
      detail: receipt.detail,
      time: receipt.createdAt,
      receiptHash: receipt.receiptHash,
    })),
  };
}

async function appendObservation(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  input: Omit<ReceiptInput, "sessionKey" | "actorIdentity" | "resourceVersion" | "previousHash" | "createdAt">,
  now: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await ensureSession(db, sessionKey, identityLabel, now);
    const receipt = await createReceipt({
      ...input,
      sessionKey,
      actorIdentity: identityLabel,
      resourceVersion: session.resource_version,
      previousHash: session.last_receipt_hash,
      createdAt: now,
    });
    const [update] = await db.batch([
      db.prepare(`
        UPDATE control_sessions SET last_receipt_hash = ?, updated_at = ?
        WHERE session_key = ? AND COALESCE(last_receipt_hash, '') = COALESCE(?, '')
      `).bind(receipt.receiptHash, now, sessionKey, session.last_receipt_hash),
      receiptInsertWhenSessionHead(db, receipt),
    ]);
    if (changes(update) === 1) return;
  }
  throw new ControlPlaneError("receipt_conflict", "The receipt chain changed during this request. Retry safely.");
}

export async function recordToolObservation(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  input: {
    tool: string;
    event: string;
    actorChannel: ActorChannel;
    outcome?: ReceiptOutcome;
    request?: unknown;
    result?: unknown;
    detail: string;
  },
  now = new Date().toISOString(),
) {
  await appendObservation(db, sessionKey, identityLabel, {
    kind: "tool",
    tool: input.tool,
    event: input.event,
    actorChannel: input.actorChannel,
    outcome: input.outcome ?? "success",
    input: input.request ?? {},
    result: input.result ?? {},
    detail: input.detail,
  }, now);
  return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
}

export async function stageMitigation(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  mitigationId: string,
  actorChannel: ActorChannel,
  now = new Date().toISOString(),
) {
  const mitigation = getMitigation(mitigationId);
  if (!mitigation) throw new ControlPlaneError("invalid_mitigation", "The mitigation is not in the approved catalog.", 422);
  const session = await ensureSession(db, sessionKey, identityLabel, now);
  const nextVersion = session.resource_version + 1;
  const actionDigest = await createActionDigest({ mitigationId, resourceVersion: nextVersion });
  const idempotencyKey = await createIdempotencyKey(sessionKey, actionDigest);
  const result = { staged: mitigation, requiresHumanApproval: true, executed: false, actionDigest, resourceVersion: nextVersion, idempotencyKey };
  const receipt = await createReceipt({
    sessionKey,
    kind: "tool",
    tool: "stage_mitigation",
    event: "Mitigation staged",
    actorChannel,
    actorIdentity: identityLabel,
    outcome: "success",
    input: { mitigationId },
    result,
    detail: `${mitigation.title}. Execution is locked pending a matching, unexpired approval.`,
    actionDigest,
    resourceVersion: nextVersion,
    previousHash: session.last_receipt_hash,
    createdAt: now,
  });

  const [update] = await db.batch([
    db.prepare(`
      UPDATE control_sessions SET
        status = 'awaiting-approval', resource_version = ?, staged_mitigation_id = ?,
        action_digest = ?, idempotency_key = ?, last_receipt_hash = ?, updated_at = ?
      WHERE session_key = ? AND resource_version = ?
        AND COALESCE(last_receipt_hash, '') = COALESCE(?, '')
    `).bind(nextVersion, mitigationId, actionDigest, idempotencyKey, receipt.receiptHash, now, sessionKey, session.resource_version, session.last_receipt_hash),
    receiptInsertWhenSessionHead(db, receipt),
  ]);
  if (changes(update) !== 1) throw new ControlPlaneError("stale_state", "The incident changed before staging completed. Refresh and retry.");
  return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
}

export async function approveMitigation(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  expected: { actionDigest: string; resourceVersion: number },
  now = new Date().toISOString(),
) {
  const session = await ensureSession(db, sessionKey, identityLabel, now);
  if (!session.staged_mitigation_id || !session.action_digest) {
    throw new ControlPlaneError("nothing_staged", "No mitigation is staged.", 422);
  }
  if (session.action_digest !== expected.actionDigest || session.resource_version !== expected.resourceVersion) {
    throw new ControlPlaneError("stale_approval", "Approval did not match the current action digest and resource version.", 412);
  }
  const existing = await getCurrentApproval(db, session);
  if (existing && !existing.consumed_at && existing.expires_at > now) {
    return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
  }

  const approvedAt = now;
  const expiresAt = new Date(Date.parse(now) + APPROVAL_TTL_MS).toISOString();
  const approvalId = (await sha256Hex(`approval:${sessionKey}:${session.action_digest}:${session.resource_version}`)).slice(0, 32);
  const result = { approvalId, actionDigest: session.action_digest, resourceVersion: session.resource_version, approverIdentity: identityLabel, approvedAt, expiresAt };
  const receipt = await createReceipt({
    sessionKey,
    kind: "audit",
    tool: "approve_staged_mitigation",
    event: "Execution approved",
    actorChannel: "human",
    actorIdentity: identityLabel,
    outcome: "success",
    input: expected,
    result,
    detail: `${getMitigation(session.staged_mitigation_id)?.title ?? session.staged_mitigation_id} approved for five minutes by ${identityLabel}.`,
    actionDigest: session.action_digest,
    resourceVersion: session.resource_version,
    previousHash: session.last_receipt_hash,
    createdAt: now,
  });

  const [update] = await db.batch([
    db.prepare(`
      UPDATE control_sessions SET last_receipt_hash = ?, updated_at = ?
      WHERE session_key = ? AND resource_version = ? AND action_digest = ?
        AND COALESCE(last_receipt_hash, '') = COALESCE(?, '')
    `).bind(receipt.receiptHash, now, sessionKey, session.resource_version, session.action_digest, session.last_receipt_hash),
    db.prepare(`
      INSERT INTO approvals (
        approval_id, session_key, action_digest, resource_version,
        approver_identity, approved_at, expires_at, consumed_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, NULL
      WHERE EXISTS (
        SELECT 1 FROM control_sessions
        WHERE session_key = ? AND resource_version = ? AND action_digest = ?
          AND last_receipt_hash = ?
      )
      ON CONFLICT(session_key, action_digest, resource_version) DO UPDATE SET
        approver_identity = excluded.approver_identity,
        approved_at = excluded.approved_at,
        expires_at = excluded.expires_at,
        consumed_at = NULL
    `).bind(
      approvalId,
      sessionKey,
      session.action_digest,
      session.resource_version,
      identityLabel,
      approvedAt,
      expiresAt,
      sessionKey,
      session.resource_version,
      session.action_digest,
      receipt.receiptHash,
    ),
    receiptInsertWhenSessionHead(db, receipt),
  ]);
  if (changes(update) !== 1) throw new ControlPlaneError("stale_approval", "The staged action changed before approval was recorded.", 412);
  return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
}

async function blockExecution(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  actorChannel: ActorChannel,
  request: unknown,
  code: string,
  message: string,
  status: number,
  now: string,
): Promise<never> {
  await appendObservation(db, sessionKey, identityLabel, {
    kind: "tool",
    tool: "execute_approved_mitigation",
    event: "Execution blocked",
    actorChannel,
    outcome: "blocked",
    input: request,
    result: { executed: false, reason: message, code },
    detail: message,
  }, now);
  throw new ControlPlaneError(code, message, status);
}

export async function executeMitigation(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  expected: { actionDigest: string; resourceVersion: number; idempotencyKey: string },
  actorChannel: ActorChannel,
  now = new Date().toISOString(),
  syntheticOutcome: "success" | "partial_failure" = "success",
) {
  const existing = await db.prepare(`
    SELECT * FROM executions WHERE session_key = ? AND idempotency_key = ? LIMIT 1
  `).bind(sessionKey, expected.idempotencyKey).first<ExecutionRow>();
  if (existing) {
    const guard = evaluateExecutionGuard({
      session: {},
      approval: null,
      existingExecution: { actionDigest: existing.action_digest },
      expected,
      identityLabel,
      now,
    });
    if (guard.decision === "blocked") {
      return blockExecution(db, sessionKey, identityLabel, actorChannel, expected, "idempotency_conflict", "The idempotency key is already bound to another action digest.", 409, now);
    }
    const result = { ...parseStoredJson(existing.result_json) as Record<string, unknown>, replayed: true };
    return recordToolObservation(db, sessionKey, identityLabel, {
      tool: "execute_approved_mitigation",
      event: "Idempotent replay returned",
      actorChannel,
      request: expected,
      result,
      detail: "The prior execution result was returned without applying the synthetic action again.",
    }, now);
  }

  const session = await ensureSession(db, sessionKey, identityLabel, now);
  const approval = await getCurrentApproval(db, session);
  const guard = evaluateExecutionGuard({
    session: {
      stagedMitigationId: session.staged_mitigation_id,
      actionDigest: session.action_digest,
      idempotencyKey: session.idempotency_key,
      resourceVersion: session.resource_version,
    },
    approval: approval ? {
      approverIdentity: approval.approver_identity,
      consumedAt: approval.consumed_at,
      expiresAt: approval.expires_at,
    } : null,
    existingExecution: null,
    expected,
    identityLabel,
    now,
  });
  if (guard.decision === "blocked") {
    const status = guard.code === "nothing_staged" ? 422 : guard.code === "stale_execution" ? 412 : guard.code === "approval_consumed" ? 409 : 403;
    return blockExecution(db, sessionKey, identityLabel, actorChannel, expected, guard.code ?? "execution_blocked", guard.message ?? "Execution was blocked by policy.", status, now);
  }

  if (!session.staged_mitigation_id || !session.action_digest || !session.idempotency_key || !approval) {
    throw new ControlPlaneError("invalid_state", "The validated control state became incomplete.", 500);
  }
  const mitigation = getMitigation(session.staged_mitigation_id);
  if (!mitigation) throw new ControlPlaneError("invalid_state", "The staged mitigation is not in the approved catalog.", 500);
  const executionId = (await sha256Hex(`execution:${sessionKey}:${expected.idempotencyKey}`)).slice(0, 32);
  const nextVersion = session.resource_version + 1;
  const executed = syntheticOutcome === "success";
  const result = buildSyntheticExecutionResult(mitigation, syntheticOutcome);
  const receipt = await createReceipt({
    sessionKey,
    kind: "tool",
    tool: "execute_approved_mitigation",
    event: executed ? "Mitigation executed" : "Partial failure recorded",
    actorChannel,
    actorIdentity: identityLabel,
    outcome: syntheticOutcome,
    input: expected,
    result,
    detail: executed ? `${mitigation.title}. Synthetic service health returned within target.` : `${mitigation.title} produced a synthetic partial failure and entered recovery-required state.`,
    actionDigest: session.action_digest,
    resourceVersion: nextVersion,
    previousHash: session.last_receipt_hash,
    createdAt: now,
  });
  const nextStatus: IncidentStatus = executed ? "mitigated" : "recovery-required";

  const [executionInsert, , stateUpdate] = await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO executions (
        execution_id, session_key, action_digest, resource_version,
        idempotency_key, outcome, result_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM control_sessions s JOIN approvals a
          ON a.session_key = s.session_key
          AND a.action_digest = s.action_digest
          AND a.resource_version = s.resource_version
        WHERE s.session_key = ? AND s.resource_version = ? AND s.action_digest = ?
          AND s.idempotency_key = ? AND a.approver_identity = ?
          AND a.consumed_at IS NULL AND a.expires_at > ?
          AND COALESCE(s.last_receipt_hash, '') = COALESCE(?, '')
      )
    `).bind(executionId, sessionKey, session.action_digest, session.resource_version, expected.idempotencyKey, syntheticOutcome, JSON.stringify(result), now, sessionKey, session.resource_version, session.action_digest, expected.idempotencyKey, identityLabel, now, session.last_receipt_hash),
    db.prepare(`
      UPDATE approvals SET consumed_at = ?
      WHERE approval_id = ? AND consumed_at IS NULL
        AND EXISTS (SELECT 1 FROM executions WHERE execution_id = ?)
    `).bind(now, approval.approval_id, executionId),
    db.prepare(`
      UPDATE control_sessions SET status = ?, resource_version = ?, last_receipt_hash = ?, updated_at = ?
      WHERE session_key = ? AND resource_version = ? AND action_digest = ?
        AND COALESCE(last_receipt_hash, '') = COALESCE(?, '')
        AND EXISTS (SELECT 1 FROM executions WHERE execution_id = ?)
    `).bind(nextStatus, nextVersion, receipt.receiptHash, now, sessionKey, session.resource_version, session.action_digest, session.last_receipt_hash, executionId),
    receiptInsertWhenSessionHead(db, receipt),
  ]);

  if (changes(executionInsert) === 0 || changes(stateUpdate) === 0) {
    const raced = await db.prepare("SELECT * FROM executions WHERE execution_id = ?")
      .bind(executionId)
      .first<ExecutionRow>();
    if (!raced) throw new ControlPlaneError("execution_conflict", "The control state changed before execution. Refresh before retrying.", 409);
  }
  return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
}

export async function resetIncident(
  db: D1Database,
  sessionKey: string,
  identityLabel: string,
  expectedResourceVersion: number,
  actorChannel: ActorChannel,
  now = new Date().toISOString(),
) {
  const session = await ensureSession(db, sessionKey, identityLabel, now);
  if (session.resource_version !== expectedResourceVersion) {
    throw new ControlPlaneError("stale_reset", "The incident changed before reset. Refresh and retry.", 412);
  }
  const nextVersion = session.resource_version + 1;
  const result = { reset: true, resourceVersion: nextVersion };
  const receipt = await createReceipt({
    sessionKey,
    kind: "tool",
    tool: "reset_incident_simulation",
    event: "Simulation reset",
    actorChannel,
    actorIdentity: identityLabel,
    outcome: "success",
    input: { expectedResourceVersion },
    result,
    detail: "Incident state returned to the initial snapshot. Earlier receipts remain append-only.",
    resourceVersion: nextVersion,
    previousHash: session.last_receipt_hash,
    createdAt: now,
  });

  const [update] = await db.batch([
    db.prepare(`
      UPDATE control_sessions SET
        status = 'investigating', resource_version = ?, staged_mitigation_id = NULL,
        action_digest = NULL, idempotency_key = NULL, last_receipt_hash = ?, updated_at = ?
      WHERE session_key = ? AND resource_version = ?
        AND COALESCE(last_receipt_hash, '') = COALESCE(?, '')
    `).bind(nextVersion, receipt.receiptHash, now, sessionKey, session.resource_version, session.last_receipt_hash),
    receiptInsertWhenSessionHead(db, receipt),
  ]);
  if (changes(update) !== 1) throw new ControlPlaneError("stale_reset", "The incident changed before reset. Refresh and retry.", 412);
  return getControlPlaneSnapshot(db, sessionKey, identityLabel, now);
}

export { MITIGATIONS };
