#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  controlDefinition,
  getDeviceStatus,
  keycodeValueToLabel,
  keycodeToValue,
  readLiveInput,
  readKey,
  repoRoot,
  resolveRawHidCommand,
  resolveVitalyCommand,
} from "../lib/doio-core.mjs";

const checks = [];
const offline = process.argv.includes("--offline");

function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}

check("physical definition parses", () => {
  const keys = Object.keys(controlDefinition.controls).filter((name) => /^k\d+$/.test(name));
  if (keys.length !== 16) throw new Error(`expected 16 keys, found ${keys.length}`);
  return `${keys.length} keys, ${Object.keys(controlDefinition.controls).length - keys.length} knob controls`;
});

check("visible key grid uses columns 0-3", () => {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const name = `k${row * 4 + col + 1}`;
      const actual = controlDefinition.controls[name]?.matrix?.join(",");
      const expected = `${row},${col}`;
      if (actual !== expected) throw new Error(`${name} expected ${expected}, got ${actual}`);
    }
  }
  return "k1-k16 matrix is aligned";
});

check("live key grid uses observed row rotation", () => {
  const expected = {
    k1: "4,0",
    k5: "0,0",
    k9: "1,0",
    k13: "2,0",
  };
  for (const [name, matrix] of Object.entries(expected)) {
    const actual = (controlDefinition.controls[name]?.liveMatrix ?? []).join(",");
    if (actual !== matrix) throw new Error(`${name} live expected ${matrix}, got ${actual}`);
  }
  return "liveMatrix is separate from writable matrix";
});

check("raw-HID helper available", () => resolveRawHidCommand());
check("vitaly fallback available", () => resolveVitalyCommand());

check("keycode roundtrip covers supported shortcuts", () => {
  for (const keycode of ["KC_A", "KC_1", "KC_F13", "LGUI(KC_C)", "LGUI(KC_V)", "KC_AUDIO_VOL_UP"]) {
    const decoded = keycodeValueToLabel(keycodeToValue(keycode));
    if (decoded !== keycode) throw new Error(`${keycode} decoded as ${decoded}`);
  }
  return "basic keyboard, media, and modifier keycodes";
});

check("app layer numbering contract", () => {
  if (controlDefinition.layers !== 9) throw new Error(`expected 9 device layers, found ${controlDefinition.layers}`);
  return "app layer 1 maps to firmware layer 0";
});

check("packaged app definition is current", () => {
  const packaged = "/Applications/DOIO Mapper.app/Contents/Resources/app/definitions/physical-controls.json";
  if (!existsSync(packaged)) return "installed app not found; skipped";
  const installed = JSON.parse(readFileSync(packaged, "utf8"));
  const source = JSON.parse(readFileSync(resolve(repoRoot, "definitions/physical-controls.json"), "utf8"));
  const installedK1 = installed.controls.k1.matrix.join(",");
  const sourceK1 = source.controls.k1.matrix.join(",");
  const installedK1Live = installed.controls.k1.liveMatrix?.join(",");
  const sourceK1Live = source.controls.k1.liveMatrix?.join(",");
  if (installedK1 !== sourceK1) throw new Error(`installed k1 ${installedK1}, source k1 ${sourceK1}`);
  if (installedK1Live !== sourceK1Live) throw new Error(`installed k1 live ${installedK1Live}, source k1 live ${sourceK1Live}`);
  return packaged;
});

const status = offline ? { connected: false, detail: "skipped in --offline mode" } : getDeviceStatus();
checks.push({
  name: offline ? "device connected skipped" : "device connected",
  ok: offline || status.connected,
  detail: status.connected ? status.detail : status.detail,
});

if (status.connected) {
  check("raw-HID live matrix reads", () => {
    const live = readLiveInput(0);
    return `rows=${live.rows.join(",")} active=${live.active.map((item) => item.name).join(",") || "none"} unknown=${live.unknownActive.map((item) => item.matrix.join(",")).join(" ") || "none"}`;
  });
  check("live k13/k14 read", () => `k13=${readKey(0, [3, 0])}, k14=${readKey(0, [3, 1])}`);
}

for (const item of checks) {
  console.log(`${item.ok ? "ok" : "bad"} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) process.exit(1);
