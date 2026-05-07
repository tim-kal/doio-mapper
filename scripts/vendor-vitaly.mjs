#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(repoRoot, "vendor", `vitaly-darwin-${process.arch}`);
const source = resolveVitaly();

mkdirSync(resolve(repoRoot, "vendor"), { recursive: true });
copyFileSync(source, destination);
chmodSync(destination, 0o755);
console.log(`Vendored ${basename(source)} -> ${destination}`);

function resolveVitaly() {
  if (process.env.DOIO_VITALY_PATH) {
    if (!existsSync(process.env.DOIO_VITALY_PATH)) {
      console.error(`DOIO_VITALY_PATH does not exist: ${process.env.DOIO_VITALY_PATH}`);
      process.exit(1);
    }
    return process.env.DOIO_VITALY_PATH;
  }

  const built = buildVitaly();
  if (built) return built;

  const candidates = [
    which("vitaly"),
    resolve(homedir(), ".cargo/bin/vitaly"),
    "/opt/homebrew/bin/vitaly",
    "/usr/local/bin/vitaly",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error("Could not find vitaly. Install it with `cargo install vitaly` or set DOIO_VITALY_PATH.");
    process.exit(1);
  }
  return found;
}

function buildVitaly() {
  const root = resolve(repoRoot, "vendor/.build-vitaly");
  rmSync(root, { recursive: true, force: true });
  const result = spawnSync("cargo", ["install", "vitaly", "--locked", "--force", "--root", root], {
    cwd: repoRoot,
    env: sanitizedRustEnv(),
    stdio: "inherit",
  });
  if (result.status !== 0) return null;
  return resolve(root, "bin/vitaly");
}

function which(binary) {
  const result = spawnSync("which", [binary], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

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
