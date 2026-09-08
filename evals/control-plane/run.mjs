import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLocalD1 } from "./sqlite-d1.mjs";
import {
  approveMitigation, executeMitigation, getControlPlaneSnapshot, stageMitigation,
} from "../../db/control-plane.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const start = Date.parse("2026-09-08T12:00:00.000Z");
const cases = [];
async function scenario(id, claim, run) {
  const db = createLocalD1();
  let tick = 0;
  const now = () => new Date(start + tick++ * 1000).toISOString();
  const session = `synthetic-${id}`;
  const identity = `session:${id}`;
  const binding = (snapshot) => ({
    actionDigest: snapshot.control.actionDigest,
    resourceVersion: snapshot.control.resourceVersion,
    idempotencyKey: snapshot.control.idempotencyKey,
  });
  const state = () => getControlPlaneSnapshot(db, session, identity, now());
  const stage = async (mitigation = "restore-pool") => binding(await stageMitigation(db, session, identity, mitigation, "simulator", now()));
  // A test setup event representing a human approval; never an exposed agent tool.
  const approve = (request) => approveMitigation(db, session, identity, request, now());
  const execute = (request, outcome = "success", at = now()) => executeMitigation(db, session, identity, request, "simulator", at, outcome);
  const count = () => db.prepare("SELECT COUNT(*) AS total FROM executions WHERE session_key = ?").bind(session).first("total");
  const blocked = async (operation, code) => {
    await assert.rejects(operation, (error) => error.code === code);
  };
  try {
    const evidence = await run({ db, session, identity, now, state, stage, approve, execute, count, blocked });
    const snapshot = await state();
    assert.equal(snapshot.receiptChain.verified, true, "receipt contents and chain must verify");
    cases.push({ id, claim, passed: true, ...evidence, executionRows: await count(), receiptChainVerified: true });
  } catch (error) {
    cases.push({ id, claim, passed: false, error: error.message });
  } finally {
    db.close();
  }
}

await scenario("C01", "Execution without approval is blocked and recorded", async ({ stage, execute, blocked, count, state }) => {
  const request = await stage();
  await blocked(() => execute(request), "approval_required");
  assert.equal(await count(), 0);
  assert.equal((await state()).receipts[0].result.code, "approval_required");
  return { code: "approval_required" };
});
await scenario("C02", "Changing a proposal invalidates the earlier approval", async ({ stage, approve, execute, blocked, count }) => {
  const before = await stage();
  await approve(before);
  const after = await stage("shift-traffic");
  assert.notEqual(before.actionDigest, after.actionDigest);
  await blocked(() => approve(before), "stale_approval");
  await blocked(() => execute(after), "approval_required");
  assert.equal(await count(), 0);
  return { code: "approval_required", oldApprovalCode: "stale_approval" };
});
await scenario("C03", "A stale execution request cannot apply a changed proposal", async ({ stage, approve, execute, blocked, count }) => {
  const before = await stage();
  await approve(before);
  const after = await stage("shift-traffic");
  await approve(after);
  await blocked(() => execute(before), "stale_execution");
  assert.equal(await count(), 0);
  return { code: "stale_execution" };
});
await scenario("C04", "An approval is invalid at its exact expiry", async ({ stage, approve, execute, blocked, count }) => {
  const request = await stage();
  const approved = await approve(request);
  await blocked(() => execute(request, "success", approved.control.approval.expiresAt), "approval_expired");
  assert.equal(await count(), 0);
  return { code: "approval_expired" };
});
await scenario("C05", "A separate session cannot reuse another session's approved request", async ({ db, now, stage, approve, count, blocked }) => {
  const request = await stage();
  await approve(request);
  await stageMitigation(db, "other-session", "session:other", "restore-pool", "simulator", now());
  await blocked(() => executeMitigation(db, "other-session", "session:other", request, "simulator", now()), "stale_execution");
  assert.equal(await count(), 0);
  assert.equal(await db.prepare("SELECT COUNT(*) AS total FROM executions").first("total"), 0);
  assert.equal((await getControlPlaneSnapshot(db, "other-session", "session:other", now())).receiptChain.verified, true);
  return { code: "stale_execution" };
});
await scenario("C06", "Exact approval permits one execution and consumes approval", async ({ db, session, stage, approve, execute, count }) => {
  const request = await stage();
  await approve(request);
  const result = await execute(request);
  assert.equal(await count(), 1);
  assert.equal(result.control.humanApproved, false);
  assert.ok(await db.prepare("SELECT consumed_at FROM approvals WHERE session_key = ? AND action_digest = ? AND resource_version = ?").bind(session, request.actionDigest, request.resourceVersion).first("consumed_at"));
  assert.equal(result.receipts[0].result.executed, true);
  assert.equal(result.incident.status, "mitigated");
  return { executed: true, approvalConsumed: true, syntheticServiceRecovered: true };
});
await scenario("C07", "Conflicting reuse of an execution key is blocked", async ({ stage, approve, execute, blocked, count }) => {
  const request = await stage();
  await approve(request);
  await execute(request);
  await blocked(() => execute({ ...request, resourceVersion: request.resourceVersion + 1 }), "idempotency_conflict");
  assert.equal(await count(), 1);
  return { code: "idempotency_conflict" };
});
await scenario("C08", "A lost response can be reconciled and replayed without another execution", async ({ stage, approve, execute, state, count }) => {
  const request = await stage();
  await approve(request);
  // Inject response loss after the server operation commits, not a fake rollback.
  const responseLost = async () => { await execute(request); throw new Error("synthetic response lost"); };
  await assert.rejects(responseLost, /synthetic response lost/);
  const reconciled = await state();
  assert.deepEqual(reconciled.control.replay, request);
  const originalResult = reconciled.receipts.find((receipt) => receipt.tool === "execute_approved_mitigation").result;
  const replay = await execute(reconciled.control.replay);
  assert.deepEqual(replay.receipts[0].result, { ...originalResult, replayed: true });
  assert.equal(replay.control.resourceVersion, reconciled.control.resourceVersion);
  assert.equal(await count(), 1);
  return { responseLoss: "after commit", replayed: true, resourceVersionUnchanged: true };
});
await scenario("C09", "Partial failure remains recovery-required when replayed", async ({ stage, approve, execute, count }) => {
  const request = await stage();
  await approve(request);
  const failed = await execute(request, "partial_failure");
  assert.equal(failed.incident.status, "recovery-required");
  const replay = await execute(request);
  assert.equal(replay.receipts[0].result.replayed, true);
  assert.equal(replay.receipts[0].result.executed, false);
  assert.equal(replay.receipts[0].result.recoveryRequired, true);
  assert.equal(replay.receipts[0].result.serviceRecovered, false);
  assert.equal(await count(), 1);
  return { executed: false, recoveryRequired: true, replayed: true };
});
await scenario("C10", "Accepted execution does not imply service recovery", async ({ stage, approve, execute, count }) => {
  const request = await stage("shift-traffic");
  await approve(request);
  const result = await execute(request);
  assert.equal(result.receipts[0].result.executed, true);
  assert.equal(result.receipts[0].result.serviceRecovered, false);
  assert.equal(result.incident.status, "monitoring");
  assert.equal(await count(), 1);
  return { executed: true, syntheticServiceRecovered: false, status: "monitoring" };
});
await scenario("C11", "Concurrent identical requests produce one stored execution", async ({ stage, approve, execute, count, state }) => {
  const request = await stage();
  await approve(request);
  const responses = await Promise.all([execute(request), execute(request)]);
  assert.equal(responses.length, 2);
  assert.equal(await count(), 1);
  assert.ok((await state()).receipts.some((receipt) => receipt.result.replayed === true));
  return { concurrentRequests: 2, replayObserved: true };
});

const sourceFiles = ["db/control-plane.ts", "lib/control-plane.mjs", "drizzle/0000_dizzy_karen_page.sql", "drizzle/0001_optimize.sql", "evals/control-plane/run.mjs", "evals/control-plane/sqlite-d1.mjs"];
const sourceSha256 = Object.fromEntries(sourceFiles.map((path) => [path, createHash("sha256").update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest("hex")]));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const report = {
  schemaVersion: 1,
  evidenceType: "deterministic-production-control-plane-with-local-sqlite",
  generatedAt: new Date().toISOString(),
  sourceCommit: git("rev-parse", "HEAD"),
  workingTreeDirty: git("status", "--porcelain").length > 0,
  nodeVersion: process.version,
  sourceSha256,
  passed: cases.filter((item) => item.passed).length,
  total: cases.length,
  limitations: ["No HTTP, cookie, origin, or native WebMCP integration exercised", "Local SQLite adapter is not Cloudflare D1 deployment verification", "No live model, external infrastructure, or independent recovery measurement", "Response loss injected only after a completed local transaction; real downstream timeout/partial-commit behavior is untested", "Approval is synthetic test setup; demo session identity is not authenticated human identity"],
  cases,
};
if (process.argv.length > 2) {
  if (process.argv.length !== 4 || process.argv[2] !== "--output") throw new Error("Usage: run.mjs [--output report.json]");
  writeFileSync(process.argv[3], `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
