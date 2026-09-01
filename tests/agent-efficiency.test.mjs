import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { measureAgentEfficiency } from "../scripts/measure-agent-efficiency.mjs";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const fixture = JSON.parse(await readFile(new URL("./fixtures/agent-efficiency.json", import.meta.url), "utf8"));

test("keeps the measured tool catalog synchronized with the application", () => {
  for (const tool of fixture.toolDefinitions) {
    assert.match(source, new RegExp(`name: [\\"']${tool.name}[\\"']`));
    assert.ok(source.includes(tool.description), `${tool.name} description drifted from the measured fixture`);
  }
  assert.equal(fixture.toolDefinitions.some((tool) => /^approve(?:_|$)/i.test(tool.name)), false);
});

test("keeps the blocked-before-approval fixture inside its interface budget", async () => {
  const measurement = await measureAgentEfficiency();

  assert.equal(measurement.outcomeVerified, true);
  assert.ok(measurement.toolDefinitionBytes <= measurement.budgets.toolDefinitionBytesMax);
  assert.ok(measurement.workflowResultBytes <= measurement.budgets.workflowResultBytesMax);
  assert.ok(measurement.toolCalls <= measurement.budgets.toolCallsMax);
});

test("reports byte counts as a tokenizer-independent structural measure", async () => {
  const measurement = await measureAgentEfficiency();

  assert.equal(measurement.toolCount, 5);
  assert.equal(measurement.toolCalls, 4);
  assert.ok(measurement.totalMeasuredBytes > measurement.toolDefinitionBytes);
  assert.equal("tokens" in measurement, false);
});
