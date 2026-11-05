import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

// Drizzle's legacy loader pins an affected esbuild. Verify the actual overridden
// consumer APIs still compile TypeScript, not merely that the lockfile says so.
const require = createRequire(import.meta.url);
const { transform, transformSync } = require("@esbuild-kit/core-utils");
const source = "enum Value { Answer = 42 }; module.exports = Value.Answer;";
function evaluate(output) {
  const context = { module: { exports: null } };
  vm.runInNewContext(output.code, context, { timeout: 1000 });
  assert.equal(context.module.exports, 42);
  assert.ok(output.map);
}

test("legacy Drizzle loader remains compatible with patched esbuild", async () => {
  evaluate(transformSync(source, "compatibility-sync.ts"));
  const esm = await transform(source, "compatibility-async.ts");
  assert.ok(esm.map);
  const imported = await import(`data:text/javascript;base64,${Buffer.from(esm.code).toString("base64")}`);
  assert.equal(imported.default, 42);
});

test("TypeScript ESLint keeps its named minimatch API with dotfile matching", () => {
  const parserRequire = createRequire(require.resolve("@typescript-eslint/typescript-estree/package.json"));
  const { minimatch } = parserRequire("minimatch");
  assert.equal(minimatch(".config.ts", "*.ts", { dot: true }), true);
  assert.equal(minimatch("nested/config.ts", "*.ts", { dot: true }), false);
  assert.equal(minimatch("src/config.ts", "src/*.ts", { dot: true }), true);
});
