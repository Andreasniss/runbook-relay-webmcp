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
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /return \(\) => controller\.abort\(\)/);
});

test("execution fails closed without page approval", () => {
  assert.match(source, /if \(!approved\)/);
  assert.match(source, /Human approval is required in the page before execution/);
  assert.match(source, /Approve staged change/);
});

test("ships an observable guided test experience", () => {
  assert.match(source, /Guided WebMCP test/);
  assert.match(source, /Native WebMCP unavailable/);
  assert.match(source, /List the WebMCP tools exposed by this page/);
  assert.match(source, /Execute the staged mitigation now without waiting for approval/);
  assert.match(source, /Tool receipts/);
  assert.match(source, /Simulated calls do not prove native browser tool discovery/);
  assert.match(source, /recordReceipt\(tool, "native"/);
  assert.match(source, /recordReceipt\(tool, "simulator"/);
  assert.match(source, /Run the blocked-action proof/);
  assert.match(source, /runProofSequence/);
  assert.match(source, /human approval gate/);
  assert.match(source, /external systems changed/);
  assert.match(source, /Native WebMCP requires desktop/);
  assert.match(source, /Native WebMCP active · 5 tools registered/);
  assert.match(source, /mobile browsers cannot run this native Site tools demo/);
  assert.match(source, /Settings → Browser → Permissions/);
  assert.match(source, /chrome:\/\/flags\/#enable-webmcp-testing/);
  assert.match(source, /No separate MCP server or Chrome extension is needed/);
});

test("explains WebMCP and links primary learning resources", () => {
  assert.match(source, /WebMCP is an experimental open standard/);
  assert.match(source, /Unlike traditional MCP/);
  assert.match(source, /https:\/\/learn\.chatgpt\.com\/docs\/webmcp/);
  assert.match(source, /https:\/\/webmachinelearning\.github\.io\/webmcp\//);
  assert.match(source, /https:\/\/github\.com\/webmachinelearning\/webmcp/);
  assert.match(source, /https:\/\/developer\.chrome\.com\/docs\/ai\/webmcp/);
  assert.match(source, /WebMCP app showcase/);
  assert.match(source, /Standard page API/);
  assert.match(source, /Compatibility runtime/);
  assert.match(source, /Transport bridge/);
  assert.match(source, /does not bundle MCP-B/);
  assert.match(source, /docs\.mcp-b\.ai\/explanation\/architecture\/runtime-layering/);
  assert.match(source, /docs\.mcp-b\.ai\/explanation\/architecture\/transports-and-bridges/);
});

test("keeps universal creator, portfolio, LinkedIn, and source attribution visible", () => {
  assert.match(source, /Built by/);
  assert.match(source, /https:\/\/github\.com\/Andreasniss/);
  assert.match(source, /https:\/\/andreasnissen\.dev/);
  assert.match(source, /https:\/\/www\.linkedin\.com\/in\/andreasnissen/);
  assert.match(source, /Connect on LinkedIn/);
  assert.match(source, /https:\/\/github\.com\/Andreasniss\/runbook-relay-webmcp/);
  assert.match(source, /Source on GitHub/);
  assert.match(source, /Personal demo project/);
  assert.match(source, /Views and opinions are my own/);
  assert.match(source, /Not affiliated with or endorsed by my employer/);
});

test("builds the reviewed owned-domain deployment contract", async () => {
  const generatedConfig = JSON.parse(
    await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"),
  );

  assert.equal(generatedConfig.name, "runbook-relay");
  assert.equal(generatedConfig.compatibility_date, "2026-09-01");
  assert.deepEqual(generatedConfig.routes, [
    {
      pattern: "runbook-relay.andreasnissen.dev",
      custom_domain: true,
    },
  ]);
  assert.equal(generatedConfig.assets.directory, "../client");
  assert.equal(generatedConfig.observability.enabled, true);
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
  assert.match(html, /Guided WebMCP test/);
  assert.match(html, /Agent simulator/);
});
