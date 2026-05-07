#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeKeycode,
  repoRoot,
  setControl,
} from "../lib/doio-core.mjs";

const args = process.argv.slice(2);
let file = null;
let onlyLayer = null;
let dryRun = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--file" || arg === "-f") {
    file = args[++index];
  } else if (arg === "--layer" || arg === "-l") {
    onlyLayer = Number(args[++index]);
    if (!Number.isInteger(onlyLayer) || onlyLayer < 0) usage("layer must be a non-negative integer");
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else {
    usage(`unknown argument: ${arg}`);
  }
}

if (!file) usage("restore requires --file <backup.json>");

const backup = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"));
if (!backup.layers || typeof backup.layers !== "object") {
  throw new Error(`${file} does not look like a DOIO backup`);
}

let printedBackup = null;
for (const [layerText, controls] of Object.entries(backup.layers)) {
  const layer = Number(layerText);
  if (onlyLayer !== null && layer !== onlyLayer) continue;
  if (!Number.isInteger(layer) || !controls || typeof controls !== "object") {
    throw new Error(`invalid layer in backup: ${layerText}`);
  }
  for (const [name, value] of Object.entries(controls)) {
    const keycode = normalizeKeycode(value);
    if (dryRun) {
      console.log(`would restore ${name} layer ${layer} <= ${keycode}`);
    } else {
      const result = setControl(name, keycode, layer);
      console.log(`${name} layer ${layer} <= ${result.keycode}`);
      if (result.backupPath && result.backupPath !== printedBackup) {
        printedBackup = result.backupPath;
        console.log(`backup ${result.backupPath}`);
      }
    }
  }
}

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  node scripts/doio-restore-backup.mjs --file backups/before-write-...json [--layer 0] [--dry-run]
`);
  process.exit(2);
}
