import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const controlSessions = sqliteTable("control_sessions", {
  sessionKey: text("session_key").primaryKey(),
  identityLabel: text("identity_label").notNull(),
  incidentId: text("incident_id").notNull(),
  status: text("status").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  stagedMitigationId: text("staged_mitigation_id"),
  actionDigest: text("action_digest"),
  idempotencyKey: text("idempotency_key"),
  lastReceiptHash: text("last_receipt_hash"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const approvals = sqliteTable("approvals", {
  approvalId: text("approval_id").primaryKey(),
  sessionKey: text("session_key").notNull().references(() => controlSessions.sessionKey),
  actionDigest: text("action_digest").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  approverIdentity: text("approver_identity").notNull(),
  approvedAt: text("approved_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
}, (table) => [
  uniqueIndex("idx_approvals_session_action_version").on(table.sessionKey, table.actionDigest, table.resourceVersion),
  index("idx_approvals_session_expiry").on(table.sessionKey, table.expiresAt),
]);

export const executions = sqliteTable("executions", {
  executionId: text("execution_id").primaryKey(),
  sessionKey: text("session_key").notNull().references(() => controlSessions.sessionKey),
  actionDigest: text("action_digest").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  outcome: text("outcome").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_executions_session_idempotency").on(table.sessionKey, table.idempotencyKey),
  uniqueIndex("idx_executions_session_action").on(table.sessionKey, table.actionDigest),
]);

export const receipts = sqliteTable("receipts", {
  receiptId: text("receipt_id").primaryKey(),
  sessionKey: text("session_key").notNull().references(() => controlSessions.sessionKey),
  kind: text("kind").notNull(),
  tool: text("tool").notNull(),
  event: text("event").notNull(),
  actorChannel: text("actor_channel").notNull(),
  actorIdentity: text("actor_identity").notNull(),
  outcome: text("outcome").notNull(),
  inputJson: text("input_json").notNull(),
  resultJson: text("result_json").notNull(),
  detail: text("detail").notNull(),
  actionDigest: text("action_digest"),
  resourceVersion: integer("resource_version").notNull(),
  previousHash: text("previous_hash"),
  receiptHash: text("receipt_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_receipts_hash").on(table.receiptHash),
  index("idx_receipts_session_created").on(table.sessionKey, table.createdAt),
]);
