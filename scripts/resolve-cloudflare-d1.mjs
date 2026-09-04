import { spawnSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const databaseName = "runbook-relay-db"
const bindingName = "DB"
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

export function resolveDatabase(databases, expectedName = databaseName) {
  const matches = databases.filter((database) => database?.name === expectedName)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one D1 database named ${expectedName}; found ${matches.length}.`)
  }

  const databaseId = matches[0].uuid ?? matches[0].id
  if (
    typeof databaseId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(databaseId)
  ) {
    throw new Error(`D1 database ${expectedName} did not return a valid identifier.`)
  }

  return { databaseName: expectedName, databaseId }
}

export function bindDatabase(config, database, expectedBinding = bindingName) {
  const bindings = config?.d1_databases
  if (!Array.isArray(bindings)) {
    throw new Error("Wrangler configuration does not contain D1 bindings.")
  }

  const matches = bindings.filter((binding) => binding?.binding === expectedBinding)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${expectedBinding} D1 binding; found ${matches.length}.`)
  }

  return {
    ...config,
    d1_databases: bindings.map((binding) =>
      binding.binding === expectedBinding
        ? {
            ...binding,
            database_name: database.databaseName,
            database_id: database.databaseId,
          }
        : binding,
    ),
  }
}

export function parseWranglerDatabaseList(stdout) {
  const start = stdout.indexOf("[")
  const end = stdout.lastIndexOf("]")
  if (start === -1 || end < start) {
    throw new Error("Wrangler did not return a JSON D1 database list.")
  }

  const parsed = JSON.parse(stdout.slice(start, end + 1))
  if (!Array.isArray(parsed)) {
    throw new Error("Wrangler returned an unexpected D1 database list.")
  }
  return parsed
}

async function updateConfig(path, database) {
  const config = JSON.parse(await readFile(path, "utf8"))
  await writeFile(path, `${JSON.stringify(bindDatabase(config, database), null, 2)}\n`)
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Cloudflare deployment credentials are unavailable.")
  }

  const wranglerPath = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js")
  const result = spawnSync(process.execPath, [wranglerPath, "d1", "list", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.status !== 0) {
    throw new Error("Wrangler could not resolve the production D1 database.")
  }

  const database = resolveDatabase(parseWranglerDatabaseList(result.stdout))
  await updateConfig(join(projectRoot, "wrangler.jsonc"), database)
  await updateConfig(join(projectRoot, "dist", "server", "wrangler.json"), database)
  console.log("Resolved the production D1 binding in ephemeral runner configuration.")
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
