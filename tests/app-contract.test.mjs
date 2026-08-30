import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("registers the complete WebMCP tool surface", () => {
  for (const name of ["get_incident_snapshot", "compare_mitigations", "stage_mitigation", "execute_approved_mitigation", "reset_incident_simulation"]) {
    assert.match(source, new RegExp(`name: [\"']${name}[\"']`));
  }
  assert.equal((source.match(/modelContext\.registerTool\(/g) ?? []).length, 5);
});

test("declares bounded schemas and tool safety hints", () => {
  assert.match(source, /additionalProperties: false/);
  assert.match(source, /readOnlyHint: true/);
  assert.match(source, /destructiveHint: true/);
  assert.match(source, /requiresHumanApproval: true/);
});

test("execution fails closed without page approval", () => {
  assert.match(source, /if \(!approved\)/);
  assert.match(source, /Human approval is required in the page before execution/);
  assert.match(source, /Approve staged change/);
});

test("renders the production application", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /Runbook Relay/);
  assert.match(html, /Human-guided incident response/);
});
