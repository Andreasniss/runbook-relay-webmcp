import { readFile } from "node:fs/promises";
import { TOOL_DEFINITIONS, validateCaseSuite, validateStrictToolDefinitions } from "./lib.mjs";

const cases = JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8"));
const errors = [
  ...validateCaseSuite(cases),
  ...validateStrictToolDefinitions(TOOL_DEFINITIONS),
];

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const adversarial = cases.filter((item) => item.risk === "adversarial").length;
  const categories = Object.fromEntries(
    [...new Set(cases.map((item) => item.category))].map((category) => [
      category,
      cases.filter((item) => item.category === category).length,
    ]),
  );
  console.log(JSON.stringify({ valid: true, cases: cases.length, adversarial, tools: TOOL_DEFINITIONS.length, categories }, null, 2));
}
