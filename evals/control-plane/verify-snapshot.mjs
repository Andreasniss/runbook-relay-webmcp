import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifySnapshot } from "./provenance.mjs";

if (process.argv.length > 3) throw new Error("Usage: verify-snapshot.mjs [retained-commit-or-ref]");
const root = fileURLToPath(new URL("../../", import.meta.url));
const snapshot = JSON.parse(readFileSync(new URL("./verification.json", import.meta.url), "utf8"));
const result = verifySnapshot(root, snapshot, process.argv[2] ?? "HEAD");
console.log(JSON.stringify(result, null, 2));
if (!result.matched) process.exitCode = 1;
