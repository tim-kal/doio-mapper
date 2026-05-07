#!/usr/bin/env node
import process from "node:process";
import {
  controls,
  listControls,
  normalizeKeycode,
  readAllControls,
  readControl,
  readLiveInput,
  readPhysicalLayout,
  requireControl,
  setControl as writeControl,
} from "../lib/doio-core.mjs";

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "controls":
      printControls();
      break;
    case "read":
      readOne(args);
      break;
    case "set":
      setOne(args);
      break;
    case "apply":
      applyLayout(args);
      break;
    case "verify":
      verifyLayout(args);
      break;
    case "matrix":
      printMatrix(args);
      break;
    case "live":
      printLive(args);
      break;
    case "translate":
      translateKeycode(args);
      break;
    default:
      usage(command ? `Unknown command: ${command}` : null);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function printControls() {
  for (const control of listControls()) {
    const [row, col] = control.matrix;
    const [liveRow, liveCol] = control.liveMatrix ?? control.matrix;
    const status = control.live_matrix_status ?? control.direction_status;
    const suffix = status ? ` (${status})` : "";
    console.log(`${control.name.padEnd(24)} map ${`${row},${col}`.padEnd(5)} live ${`${liveRow},${liveCol}`.padEnd(5)} ${control.kind.padEnd(10)} ${control.label}${suffix}`);
  }
}

function readOne(args) {
  const { layer, rest } = parseLayer(args);
  const name = rest[0];
  if (!name) usage("read requires <control>");
  const result = readControl(name, layer);
  console.log(`${name} layer ${layer} => ${result.keycode}`);
}

function setOne(args) {
  const { layer, rest } = parseLayer(args);
  const [name, value] = rest;
  if (!name || !value) usage("set requires <control> <keycode>");
  const result = writeControl(name, value, layer);
  console.log(`${name} layer ${layer} <= ${result.keycode}`);
  if (result.backupPath) console.log(`backup ${result.backupPath}`);
}

function applyLayout(args) {
  const { layer, file, dryRun } = parseLayoutArgs(args);
  const layout = readPhysicalLayout(file);
  let printedBackup = null;
  for (const [name, value] of Object.entries(layout.controls)) {
    const control = requireControl(name);
    const keycode = normalizeKeycode(value);
    if (dryRun) {
      console.log(`would set ${name} (${control.matrix.join(",")}) layer ${layer} <= ${keycode}`);
    } else {
      const result = writeControl(name, keycode, layer);
      console.log(`${name} layer ${layer} <= ${result.keycode}`);
      if (result.backupPath && result.backupPath !== printedBackup) {
        printedBackup = result.backupPath;
        console.log(`backup ${result.backupPath}`);
      }
    }
  }
}

function verifyLayout(args) {
  const { layer, file } = parseLayoutArgs(args);
  const layout = readPhysicalLayout(file);
  let failed = false;
  for (const [name, expected] of Object.entries(layout.controls)) {
    const keycode = normalizeKeycode(expected);
    const actual = readControl(name, layer).keycode;
    const ok = actual === keycode;
    failed ||= !ok;
    console.log(`${ok ? "ok" : "bad"} ${name}: expected ${keycode}, got ${actual}`);
  }
  if (failed) process.exitCode = 1;
}

function printMatrix(args) {
  const { layer, rest } = parseLayer(args);
  if (rest.length) usage("matrix takes only optional --layer");
  const bindings = readAllControls(layer);
  for (const name of Object.keys(controls)) {
    console.log(`${name.padEnd(24)} ${bindings[name]}`);
  }
}

function printLive(args) {
  const { layer, rest } = parseLayer(args);
  if (rest.length) usage("live takes only optional --layer");
  const live = readLiveInput(layer);
  console.log(`layer ${layer} rows ${live.rows.join(",")}`);
  if (!live.active.length) {
    console.log("active none");
    if (live.unknownActive?.length) {
      console.log(`unknown ${live.unknownActive.map((item) => item.matrix.join(",")).join(" ")}`);
    }
    return;
  }
  for (const item of live.active) {
    console.log(`${item.name.padEnd(24)} live ${item.liveMatrix.join(",").padEnd(5)} ${item.binding.padEnd(24)} ${item.output.action} (${item.output.chord})`);
  }
  if (live.unknownActive?.length) {
    console.log(`unknown ${live.unknownActive.map((item) => item.matrix.join(",")).join(" ")}`);
  }
}

function translateKeycode(args) {
  const [value] = args;
  if (!value) usage("translate requires <shortcut-or-keycode>");
  console.log(normalizeKeycode(value));
}

function parseLayer(args) {
  let layer = 0;
  const rest = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--layer" || arg === "-l") {
      layer = Number(args[++index]);
      if (!Number.isInteger(layer) || layer < 0) usage("layer must be a non-negative integer");
    } else {
      rest.push(arg);
    }
  }
  return { layer, rest };
}

function parseLayoutArgs(args) {
  let layer = 0;
  let file = null;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--layer" || arg === "-l") {
      layer = Number(args[++index]);
      if (!Number.isInteger(layer) || layer < 0) usage("layer must be a non-negative integer");
    } else if (arg === "--file" || arg === "-f") {
      file = args[++index];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      usage(`Unknown layout option: ${arg}`);
    }
  }
  return { layer, file, dryRun };
}

function usage(error) {
  if (error) console.error(error);
  console.error(`Usage:
  node scripts/doioctl.mjs controls
  node scripts/doioctl.mjs matrix [--layer 0]
  node scripts/doioctl.mjs live [--layer 0]
  node scripts/doioctl.mjs read <control> [--layer 0]
  node scripts/doioctl.mjs set <control> <keycode> [--layer 0]
  node scripts/doioctl.mjs apply --file layouts/example-starter.json [--layer 0] [--dry-run]
  node scripts/doioctl.mjs verify --file layouts/example-starter.json [--layer 0]
  node scripts/doioctl.mjs translate <shortcut-or-keycode>`);
  process.exit(2);
}
