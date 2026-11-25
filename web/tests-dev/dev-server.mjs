// Starts `next dev` and copies its output to the terminal and to test-results/dev-server.log,
// so the dev-mode regression test can scan what the server logged. Used by playwright.dev.config.ts.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const port = process.env.DEV_CHECK_PORT ?? "3101";
mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/dev-server.log");

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next"); // hoisted in the workspace
const child = spawn(process.execPath, [nextBin, "dev", "-p", port, "-H", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
