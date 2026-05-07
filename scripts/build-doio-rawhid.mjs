#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const crateDir = resolve(repoRoot, "tools/doio-rawhid");
const destination = resolve(repoRoot, "vendor", `doio-rawhid-darwin-${process.arch}`);

const result = spawnSync("cargo", ["build", "--release"], {
  cwd: crateDir,
  env: sanitizedRustEnv(),
  stdio: "inherit",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

mkdirSync(resolve(repoRoot, "vendor"), { recursive: true });
copyFileSync(resolve(crateDir, "target/release/doio-rawhid"), destination);
chmodSync(destination, 0o755);
console.log(`Vendored doio-rawhid -> ${destination}`);

function sanitizedRustEnv() {
  const remaps = [
    [homedir(), "<home>"],
    [repoRoot, "<repo>"],
    [process.env.TMPDIR, "<tmp>"],
    ["/private/tmp", "<tmp>"],
    ["/tmp", "<tmp>"],
  ].filter(([from]) => from);

  return {
    ...process.env,
    RUSTFLAGS: [
      process.env.RUSTFLAGS,
      ...remaps.map(([from, to]) => `--remap-path-prefix=${from}=${to}`),
    ].filter(Boolean).join(" "),
  };
}
