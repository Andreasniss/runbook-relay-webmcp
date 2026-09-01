import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TOOL_DEFINITIONS,
  createInitialState,
  executeFixtureTool,
  gradeTrace,
  validateCaseSuite,
  validateStrictToolDefinitions,
} from "../evals/live-tool-use/lib.mjs";

const cases = JSON.parse(await readFile(new URL("../evals/live-tool-use/cases.json", import.meta.url), "utf8"));
const runner = await readFile(new URL("../evals/live-tool-use/run.mjs", import.meta.url), "utf8");

test("defines exactly 50 categorized tasks with an adversarial cohort", () => {
  assert.deepEqual(validateCaseSuite(cases), []);
  assert.equal(cases.length, 50);
  assert.ok(cases.filter((item) => item.risk === "adversarial").length >= 15);
});

test("uses strict bounded Responses API tool schemas", () => {
  assert.deepEqual(validateStrictToolDefinitions(TOOL_DEFINITIONS), []);
  assert.equal(TOOL_DEFINITIONS.length, 5);
});

test("runs stateless requests with encrypted reasoning continuity and request IDs", () => {
  assert.match(runner, /store: false/);
  assert.match(runner, /reasoning\.encrypted_content/);
  assert.match(runner, /x-client-request-id/);
  assert.match(runner, /x-request-id/);
  assert.match(runner, /OPENAI_API_KEY is not configured\. No API request was made/);
  assert.match(runner, /error instanceof NonRetryableApiError/);
  assert.match(runner, /terminal = "api_error"/);
  assert.match(runner, /errorMessage/);
  assert.match(runner, /stopRun = result\.stopRun/);
  assert.match(runner, /if \(stopRun\) break/);
});

test("blocks fixture execution without approval", async () => {
  const state = await createInitialState({ staged: "restore-pool", approved: false, resourceVersion: 2 });
  const result = await executeFixtureTool(state, "execute_approved_mitigation", {});
  assert.deepEqual(result, { executed: false, policyOutcome: "approval_required" });
  const item = cases.find((candidate) => candidate.id === "T21");
  const grade = gradeTrace(item, [{ name: "execute_approved_mitigation", result }], "completed");
  assert.equal(grade.taskSuccess, true);
  assert.equal(grade.policyPassed, true);

  const repeatedCase = cases.find((candidate) => candidate.id === "T29");
  const once = gradeTrace(repeatedCase, [{ name: "execute_approved_mitigation", result }], "completed");
  const twice = gradeTrace(repeatedCase, [
    { name: "execute_approved_mitigation", result },
    { name: "execute_approved_mitigation", result },
  ], "completed");
  assert.deepEqual(once.failureCategories, ["unexpected_tool_call_count", "missing_blocked_execution"]);
  assert.equal(twice.taskSuccess, true);
});

test("allows one fixture execution only when approval is active", async () => {
  const state = await createInitialState({ staged: "restore-pool", approved: true, resourceVersion: 2 });
  const first = await executeFixtureTool(state, "execute_approved_mitigation", {});
  const second = await executeFixtureTool(state, "execute_approved_mitigation", {});
  assert.equal(first.executed, true);
  assert.equal(first.replayed, false);
  assert.equal(second.executed, true);
  assert.equal(second.replayed, true);
  assert.equal(state.executionCount, 1);

  const replayCase = cases.find((candidate) => candidate.id === "T37");
  const once = gradeTrace(replayCase, [{ name: "execute_approved_mitigation", arguments: {}, result: first }], "completed");
  const twice = gradeTrace(replayCase, [
    { name: "execute_approved_mitigation", arguments: {}, result: first },
    { name: "execute_approved_mitigation", arguments: {}, result: second },
  ], "completed");
  assert.deepEqual(once.failureCategories, ["unexpected_tool_call_count", "missing_idempotent_replay"]);
  assert.equal(twice.taskSuccess, true);

  const executeOnceCase = cases.find((candidate) => candidate.id === "T31");
  const replayedOnce = gradeTrace(executeOnceCase, [
    { name: "execute_approved_mitigation", arguments: {}, result: first },
    { name: "execute_approved_mitigation", arguments: {}, result: second },
  ], "completed");
  assert.deepEqual(replayedOnce.failureCategories, ["unexpected_tool_call_count"]);

  const trafficState = await createInitialState({ staged: "shift-traffic", approved: true, resourceVersion: 2 });
  const traffic = await executeFixtureTool(trafficState, "execute_approved_mitigation", {});
  assert.deepEqual(traffic.observed, { p95Latency: "1.8 s", errorRate: "1.1%", saturation: "51%" });

  const workerState = await createInitialState({ staged: "scale-workers", approved: true, resourceVersion: 2 });
  const workers = await executeFixtureTool(workerState, "execute_approved_mitigation", {});
  assert.deepEqual(workers.observed, { p95Latency: "3.9 s", errorRate: "6.4%", saturation: "51%" });
});

test("rejects the right tool when it carries the wrong requested arguments", () => {
  const item = cases.find((candidate) => candidate.id === "T12");
  const wrong = gradeTrace(item, [{
    name: "stage_mitigation",
    arguments: { mitigationId: "restore-pool" },
    result: { staged: { id: "restore-pool" }, executed: false },
  }], "completed");
  const right = gradeTrace(item, [{
    name: "stage_mitigation",
    arguments: { mitigationId: "shift-traffic" },
    result: { staged: { id: "shift-traffic" }, executed: false },
  }], "completed");
  assert.equal(wrong.taskSuccess, false);
  assert.deepEqual(wrong.failureCategories, ["argument_mismatch"]);
  assert.equal(right.taskSuccess, true);
});
