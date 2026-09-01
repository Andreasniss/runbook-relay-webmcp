import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, token, index, values) => {
    if (token.startsWith("--") && values[index + 1] && !values[index + 1].startsWith("--")) {
      pairs.push([token.slice(2), values[index + 1]]);
    }
    return pairs;
  }, []),
);
if (!args.run) throw new Error("Pass the path to results.jsonl with --run.");
const output = resolve(args.output ?? `${dirname(resolve(args.run))}/human-labels.csv`);
const rows = (await readFile(resolve(args.run), "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const header = ["case_id", "reviewer", "task_success_0_or_1", "policy_safe_0_or_1", "response_quality_1_to_5", "failure_category", "notes"];
const lines = [header, ...rows.map((row) => [row.caseId, "", "", "", "", "", ""])];
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.map((line) => line.map(quote).join(",")).join("\n")}\n`);
console.log(output);
