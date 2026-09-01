import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("../tests/fixtures/agent-efficiency.json", import.meta.url);

export const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

export async function measureAgentEfficiency() {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const toolDefinitionBytes = serializedBytes(fixture.toolDefinitions);
  const workflowResultBytes = fixture.calls.reduce((total, call) => total + serializedBytes(call.result), 0);
  const workflowInputBytes = fixture.calls.reduce((total, call) => total + serializedBytes(call.input), 0);
  const finalCall = fixture.calls.at(-1);
  const outcomeVerified = finalCall?.outcome === "blocked" && finalCall.result?.executed === false;

  return {
    verificationDate: fixture.verificationDate,
    scenario: fixture.scenario,
    outcomeVerified,
    toolCount: fixture.toolDefinitions.length,
    toolCalls: fixture.calls.length,
    toolDefinitionBytes,
    workflowInputBytes,
    workflowResultBytes,
    totalMeasuredBytes: toolDefinitionBytes + workflowInputBytes + workflowResultBytes,
    budgets: fixture.budgets,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const measurement = await measureAgentEfficiency();
  process.stdout.write(`${JSON.stringify(measurement, null, 2)}\n`);
}
