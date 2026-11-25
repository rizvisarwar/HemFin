#!/usr/bin/env node
// Regenerates api/openapi.json (via uv, no DB needed) and the TypeScript types in
// packages/api-client. With --check, fails if that leaves any diff (used by CI).
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = ["api/openapi.json", "packages/api-client/src/schema.d.ts"];

function exportOpenApi() {
  const script = ["run", "python", "scripts/export_openapi.py"];
  const candidates = [
    ["uv", script],
    ["py", ["-m", "uv", ...script]],
    ["python3", ["-m", "uv", ...script]],
    ["python", ["-m", "uv", ...script]],
  ];
  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { cwd: resolve(root, "api"), stdio: "inherit" });
    if (res.error) continue; // command not found, try the next one
    if (res.status === 0) return;
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${res.status}`);
  }
  throw new Error("Could not run uv (tried: uv, py -m uv, python3 -m uv, python -m uv).");
}

function git(args) {
  const res = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (res.error || res.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return res.stdout;
}

exportOpenApi();
// npm is a .cmd shim on Windows, so run it through a shell (as one command string).
const gen = spawnSync("npm run generate --workspace @hemfin/api-client", {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (gen.status !== 0) throw new Error("openapi-typescript generation failed");

if (process.argv.includes("--check")) {
  const dirty = git(["status", "--porcelain", "--", ...GENERATED]).trim();
  if (dirty) {
    console.error(`API drift: generated files are out of date. Run "npm run gen:api" and commit:\n${dirty}`);
    process.exit(1);
  }
  console.log("API client is up to date.");
}
