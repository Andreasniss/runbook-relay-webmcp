import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

// Only the D1 API subset used by db/control-plane.ts. SQL is executed unchanged;
// batch is a transaction. This adapter does not emulate Cloudflare's network.
export function createLocalD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../../drizzle/", import.meta.url);
  for (const name of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  function prepare(sql, values = []) {
    return {
      bind(...bound) { return prepare(sql, bound); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...values);
        return row ? (column ? row[column] : row) : null;
      },
      execute() {
        // all() also executes non-returning statements on Node 22.13. Avoid
        // StatementSync.columns(), which was added after our supported baseline.
        const before = sqlite.prepare("SELECT total_changes() AS total").get().total;
        const results = sqlite.prepare(sql).all(...values);
        const after = sqlite.prepare("SELECT total_changes() AS total").get().total;
        return { success: true, results, meta: { changes: Number(after - before) } };
      },
      async run() { return this.execute(); },
    };
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN TRANSACTION");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
}
