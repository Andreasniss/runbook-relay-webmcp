import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { collectProvenance, sourceFiles, verifySnapshot } from "../evals/control-plane/provenance.mjs";

test("snapshot resolves from a squash tree without its original commit and rejects changed source", () => {
  const root = mkdtempSync(join(tmpdir(), "runbook-provenance-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Synthetic test");
    git("config", "user.email", "test@example.invalid");
    for (const path of [...sourceFiles, "drizzle/0000_test.sql"]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), `synthetic source: ${path}\n`);
    }
    git("add", ".");
    git("commit", "--quiet", "-m", "original candidate");
    const snapshot = { schemaVersion: 2, ...collectProvenance(root) };
    const original = git("rev-parse", "HEAD");
    const squash = git("commit-tree", git("rev-parse", "HEAD^{tree}"), "-m", "squash without original history");
    assert.equal(spawnSync("git", ["merge-base", "--is-ancestor", original, squash], { cwd: root }).status, 1);
    snapshot.checkoutAtRun.commit = "0".repeat(40); // unavailable original history
    assert.equal(verifySnapshot(root, snapshot, squash).matched, true);
    writeFileSync(join(root, sourceFiles[0]), "changed source\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "source changed");
    assert.equal(verifySnapshot(root, snapshot).matched, false);
    writeFileSync(join(root, "drizzle/0001_added.sql"), "SELECT 1;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "additional migration");
    assert.throws(() => verifySnapshot(root, snapshot), /complete source set/);
    const incomplete = structuredClone(snapshot);
    delete incomplete.sourceGitBlobs[sourceFiles[0]];
    assert.throws(() => verifySnapshot(root, incomplete, squash), /complete source set/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
