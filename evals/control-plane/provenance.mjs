import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const sourceFiles = [
  "db/control-plane.ts", "lib/control-plane.mjs",
  "evals/control-plane/run.mjs", "evals/control-plane/sqlite-d1.mjs",
  "evals/control-plane/provenance.mjs", "evals/control-plane/verify-snapshot.mjs",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

export function collectProvenance(root) {
  const evaluatedFiles = [...sourceFiles, ...readdirSync(join(root, "drizzle")).filter((name) => name.endsWith(".sql")).sort().map((name) => `drizzle/${name}`)];
  return {
    checkoutAtRun: {
      commit: git(root, "rev-parse", "HEAD"),
      informationalOnly: true,
      note: "May be rewritten by squash merge; resolve source using sourceGitBlobs and sourceSha256.",
    },
    workingTreeDirty: git(root, "status", "--porcelain").length > 0,
    sourceGitBlobs: Object.fromEntries(evaluatedFiles.map((path) => [path, git(root, "hash-object", "--", path)])),
    sourceSha256: Object.fromEntries(evaluatedFiles.map((path) => [path, sha256(readFileSync(join(root, path)))])),
  };
}

export function verifySnapshot(root, snapshot, ref = "HEAD") {
  if (snapshot.schemaVersion !== 2) throw new Error("Expected snapshot schemaVersion 2");
  // Resolve the caller's revision once; subsequent reads use only its object ID.
  const commit = git(root, "rev-parse", "--verify", `${ref}^{commit}`);
  const migrations = git(root, "ls-tree", "-rz", "--name-only", commit, "--", "drizzle").split("\0").filter((path) => /^drizzle\/[^/]+\.sql$/.test(path));
  const expectedFiles = [...sourceFiles, ...migrations];
  for (const field of ["sourceGitBlobs", "sourceSha256"]) {
    if (JSON.stringify(Object.keys(snapshot[field] ?? {}).sort()) !== JSON.stringify([...expectedFiles].sort())) {
      throw new Error(`Snapshot ${field} must identify the complete source set`);
    }
  }
  const files = expectedFiles.map((path) => {
    const blob = git(root, "rev-parse", `${commit}:${path}`);
    const bytes = execFileSync("git", ["cat-file", "blob", blob], { cwd: root });
    return { path, gitBlobMatches: blob === snapshot.sourceGitBlobs[path], sha256Matches: sha256(bytes) === snapshot.sourceSha256[path] };
  });
  return { commit, matched: files.every((file) => file.gitBlobMatches && file.sha256Matches), files };
}
