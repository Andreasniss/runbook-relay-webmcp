import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createLocalD1 } from "../evals/control-plane/sqlite-d1.mjs";

test("production control-plane SQL passes all deterministic execution scenarios", () => {
  const stdout = execFileSync(process.execPath, ["--experimental-transform-types", "evals/control-plane/run.mjs"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000,
  });
  const report = JSON.parse(stdout);
  assert.equal(report.total, 11);
  assert.equal(report.passed, report.total);
  assert.equal(report.evidenceType, "deterministic-production-control-plane-with-local-sqlite");
});

test("local D1 adapter preserves SQL results, change counts and batch rollback", async () => {
  const db = createLocalD1();
  try {
    await db.prepare("CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY)").run();
    await assert.rejects(() => db.batch([
      db.prepare("INSERT INTO rollback_probe VALUES (1)"),
      db.prepare("INSERT INTO rollback_probe VALUES (1)"),
    ]));
    assert.equal(await db.prepare("SELECT COUNT(*) AS total FROM rollback_probe").first("total"), 0);
    const [inserted, selected, ignored, updated] = await db.batch([
      db.prepare("INSERT INTO rollback_probe VALUES (2)"),
      db.prepare("SELECT id FROM rollback_probe"),
      db.prepare("INSERT OR IGNORE INTO rollback_probe VALUES (2)"),
      db.prepare("UPDATE rollback_probe SET id = 3 WHERE id = 2 RETURNING id"),
    ]);
    assert.deepEqual(inserted.results, []);
    assert.equal(inserted.meta.changes, 1);
    assert.equal(selected.results[0].id, 2);
    assert.equal(selected.meta.changes, 0);
    assert.equal(ignored.meta.changes, 0);
    assert.equal(updated.meta.changes, 1);
    assert.equal(updated.results[0].id, 3);
    assert.equal(await db.prepare("SELECT id FROM rollback_probe").first("id"), 3);
  } finally { db.close(); }
});
