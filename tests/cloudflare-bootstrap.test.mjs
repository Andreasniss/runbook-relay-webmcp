import assert from "node:assert/strict"
import test from "node:test"

import {
  bindDatabase,
  parseWranglerConfig,
  parseWranglerDatabaseList,
  resolveDatabase,
} from "../scripts/resolve-cloudflare-d1.mjs"

const firstId = "11111111-1111-4111-8111-111111111111"
const secondId = "22222222-2222-4222-8222-222222222222"

test("resolveDatabase returns the unique named database", () => {
  const database = resolveDatabase([
    { name: "unrelated", uuid: secondId },
    { name: "runbook-relay-db", uuid: firstId },
  ])

  assert.deepEqual(database, {
    databaseName: "runbook-relay-db",
    databaseId: firstId,
  })
})

test("resolveDatabase rejects missing and duplicate databases", () => {
  assert.throws(() => resolveDatabase([]), /found 0/)
  assert.throws(
    () =>
      resolveDatabase([
        { name: "runbook-relay-db", uuid: firstId },
        { name: "runbook-relay-db", uuid: secondId },
      ]),
    /found 2/,
  )
})

test("bindDatabase adds the runtime fields without mutating the source config", () => {
  const source = {
    name: "runbook-relay",
    d1_databases: [{ binding: "DB", migrations_dir: "drizzle" }],
  }

  const updated = bindDatabase(source, {
    databaseName: "runbook-relay-db",
    databaseId: firstId,
  })

  assert.deepEqual(updated.d1_databases, [
    {
      binding: "DB",
      migrations_dir: "drizzle",
      database_name: "runbook-relay-db",
      database_id: firstId,
    },
  ])
  assert.deepEqual(source.d1_databases, [{ binding: "DB", migrations_dir: "drizzle" }])
})

test("parseWranglerDatabaseList tolerates Wrangler prelude output", () => {
  const parsed = parseWranglerDatabaseList(
    `Wrangler notice\n[{"name":"runbook-relay-db","uuid":"${firstId}"}]\n`,
  )

  assert.equal(parsed[0].uuid, firstId)
})

test("parseWranglerConfig accepts comments and trailing commas in JSONC", () => {
  const config = parseWranglerConfig(
    `{
      // Wrangler configuration files support JSONC.
      "name": "runbook-relay",
      "d1_databases": [{ "binding": "DB", }],
    }`,
    true,
  )

  assert.equal(config.name, "runbook-relay")
  assert.equal(config.d1_databases[0].binding, "DB")
})
