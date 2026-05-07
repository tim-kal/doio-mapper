import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const metaPath = resolve(repoRoot, "definitions/kb16b-02-wireless-via.json");
export const controlsPath = resolve(repoRoot, "definitions/physical-controls.json");
export const metaDefinition = JSON.parse(readFileSync(metaPath, "utf8"));
export const controlDefinition = JSON.parse(readFileSync(controlsPath, "utf8"));
export const controls = controlDefinition.controls;
let writeBackupPath = null;

export function listControls() {
  return Object.entries(controls).map(([name, control]) => ({
    name,
    ...control,
  }));
}

export function getDeviceStatus() {
  try {
    const output = vitaly(["devices"]);
    const connected = /0x?FEED|qmkbuilder|keyboard|Product name/i.test(output);
    return { connected, detail: output.trim() };
  } catch (error) {
    return { connected: false, detail: error.message };
  }
}

export function readControl(name, layer = 0) {
  const control = requireControl(name);
  const value = readKey(layer, control.matrix);
  return { name, layer, value, keycode: value, control };
}

export function readAllControls(layer = 0) {
  const bindings = {};
  for (const name of Object.keys(controls)) {
    bindings[name] = readControl(name, layer).keycode;
  }
  return bindings;
}

export function readLiveInput(layer = 0) {
  const rows = readMatrixRows();
  const knownMatrices = new Set(listControls().map((control) => liveMatrixFor(control).join(",")));
  const active = listControls()
    .filter((control) => isMatrixControlActive(rows, liveMatrixFor(control)))
    .map((control) => {
      const binding = readControl(control.name, layer).keycode;
      const effective = resolveEffectiveControlBinding(control.name, layer, binding);
      return {
        name: control.name,
        kind: control.kind,
        matrix: control.matrix,
        liveMatrix: liveMatrixFor(control),
        binding,
        output: describeKeycode(binding),
        effectiveBinding: effective.binding,
        effectiveLayer: effective.layer,
        effectiveOutput: effective.output,
      };
    });
  const rawActive = activeMatrixPositions(rows);
  const unknownActive = rawActive.filter((item) => !knownMatrices.has(item.matrix.join(",")));

  return {
    layer,
    rows,
    rawActive,
    unknownActive,
    active,
    readAt: new Date().toISOString(),
  };
}

export function setControl(name, value, layer = 0) {
  const control = requireControl(name);
  const keycode = normalizeKeycode(value);
  ensureWriteBackup();
  writeKey(layer, control.matrix, keycodeToValue(keycode));
  const actual = readKey(layer, control.matrix);
  if (actual !== keycode) {
    throw new Error(`Verification failed for ${name}: wrote ${keycode}, read ${actual}`);
  }
  return { name, layer, requested: value, keycode, actual, backupPath: writeBackupPath, control };
}

export function readPhysicalLayout(file) {
  if (!file) throw new Error("layout command requires --file <path>");
  const layout = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"));
  if (!layout.controls || typeof layout.controls !== "object") {
    throw new Error(`${file} must contain a controls object`);
  }
  return layout;
}

export function readKey(layer, matrix) {
  const offset = keymapOffset(layer, matrix);
  try {
    const value = readKeyValue(offset);
    const keycode = keycodeValueToLabel(value);
    if (keycode) return keycode;
  } catch {
    // Fall through to vitaly for better diagnostics or unsupported values.
  }

  const output = runWithRetry(() => vitaly(["keys", "-m", metaPath, "-l", String(layer), "-p", matrix.join(",")]));
  if (/No matching devices found/i.test(output)) {
    throw new Error("No DOIO raw-HID device found. Reconnect/wake the pad over USB and run `npm run hid:list`.");
  }
  const match = output.match(/=>\s+(.+)\s*$/m);
  if (!match) throw new Error(`Could not parse vitaly output:\n${output}`);
  return match[1].trim();
}

export function writeKey(layer, matrix, keycodeValue) {
  const offset = keymapOffset(layer, matrix);
  runRawHid(["set-buffer", String(offset), String(keycodeValue)]);
}

export function keymapOffset(layer, matrix) {
  const [row, col] = matrix;
  const rows = metaDefinition.matrix.rows;
  const cols = metaDefinition.matrix.cols;
  return ((layer * rows * cols) + (row * cols) + col) * 2;
}

export function readKeyValue(offset) {
  const output = runRawHid(["get-buffer", String(offset), "2"]);
  const bytes = output.trim().split(/\s+/).filter(Boolean);
  if (bytes.length !== 2) {
    throw new Error(`Unexpected doio-rawhid get-buffer output: ${output}`);
  }
  return (Number.parseInt(bytes[0], 16) << 8) | Number.parseInt(bytes[1], 16);
}

export function readMatrixRows(offset = 0) {
  const output = runRawHid(["sample-matrix", String(offset), "8", "8"]);
  const bytes = output.trim().split(/\s+/).filter(Boolean).map((byte) => Number.parseInt(byte, 16));
  const bytesPerRow = Math.ceil(metaDefinition.matrix.cols / 8);
  const rows = metaDefinition.matrix.rows - offset;
  if (bytes.length < rows * bytesPerRow || bytes.some((byte) => Number.isNaN(byte))) {
    throw new Error(`Unexpected doio-rawhid get-matrix output: ${output}`);
  }

  const values = [];
  for (let row = 0; row < rows; row += 1) {
    let value = 0;
    for (let index = 0; index < bytesPerRow; index += 1) {
      value = (value << 8) | bytes[row * bytesPerRow + index];
    }
    values.push(value);
  }
  return values;
}

function liveMatrixFor(control) {
  return control.liveMatrix ?? control.matrix;
}

function isMatrixControlActive(rows, matrix) {
  const [row, col] = matrix;
  return Boolean((rows[row] ?? 0) & (1 << col));
}

function activeMatrixPositions(rows) {
  const active = [];
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < metaDefinition.matrix.cols; col += 1) {
      if ((rows[row] ?? 0) & (1 << col)) {
        active.push({ matrix: [row, col] });
      }
    }
  }
  return active;
}

function resolveEffectiveControlBinding(name, layer, firstBinding) {
  let binding = firstBinding;
  for (let currentLayer = layer; currentLayer >= 0; currentLayer -= 1) {
    if (!isTransparentKeycode(binding) || currentLayer === 0) {
      return {
        layer: currentLayer,
        binding,
        output: describeEffectiveKeycode(binding, currentLayer),
      };
    }
    binding = readControl(name, currentLayer - 1).keycode;
  }
  return { layer: 0, binding, output: describeEffectiveKeycode(binding, 0) };
}

function runRawHid(args) {
  return runWithRetry(() => {
    const result = spawnSync(resolveRawHidCommand(), args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: helperPath(),
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.error) {
      throw new Error(`doio-rawhid failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`doio-rawhid failed: ${output || `exit ${result.status}`}`);
    }
    return output;
  });
}

function runWithRetry(operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!isTransientHidError(error) || attempt === 5) break;
      sleepMs(40 * attempt);
    }
  }
  throw lastError;
}

function isTransientHidError(error) {
  return /exclusive access|device already open|hid_open_path|timed out|timeout/i.test(error.message);
}

function sleepMs(ms) {
  spawnSync("/bin/sleep", [String(ms / 1000)]);
}

function ensureWriteBackup() {
  if (writeBackupPath) return;
  const backupDir = resolve(repoRoot, "backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeBackupPath = resolve(backupDir, `before-write-${stamp}.json`);
  const layers = {};
  for (let layer = 0; layer < controlDefinition.layers; layer += 1) {
    layers[layer] = readAllControls(layer);
  }
  writeFileSync(writeBackupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: "Automatic snapshot before first keymap write in this process.",
    layers,
  }, null, 2) + "\n");
}

export function currentWriteBackupPath() {
  return writeBackupPath;
}

export function keycodeValueToLabel(value) {
  const modifierMask = value & 0xff00;
  const base = value & 0x00ff;
  const baseLabel = baseValueToKeycode(base);
  if (!baseLabel) return null;

  const modifiers = [];
  if (modifierMask & 0x0100) modifiers.push("LCTL");
  if (modifierMask & 0x0200) modifiers.push("LSFT");
  if (modifierMask & 0x0400) modifiers.push("LALT");
  if (modifierMask & 0x0800) modifiers.push("LGUI");
  if (modifierMask & 0x1000) return null;

  return modifiers.reduceRight((inner, modifier) => `${modifier}(${inner})`, baseLabel);
}

function baseValueToKeycode(value) {
  if (value >= 0x04 && value <= 0x1d) return `KC_${String.fromCharCode(61 + value)}`;
  if (value >= 0x1e && value <= 0x26) return `KC_${value - 0x1d}`;
  if (value === 0x27) return "KC_0";
  if (value >= 0x3a && value <= 0x45) return `KC_F${value - 0x39}`;
  if (value >= 0x68 && value <= 0x73) return `KC_F${value - 0x5b}`;

  return {
    0x0000: "KC_NO",
    0x0001: "KC_TRANSPARENT",
    0x0028: "KC_ENTER",
    0x0029: "KC_ESC",
    0x002a: "KC_BSPC",
    0x002b: "KC_TAB",
    0x002c: "KC_SPACE",
    0x002d: "KC_MINUS",
    0x002e: "KC_EQUAL",
    0x002f: "KC_LBRACKET",
    0x0030: "KC_RBRACKET",
    0x0031: "KC_BACKSLASH",
    0x0033: "KC_SEMICOLON",
    0x0034: "KC_QUOTE",
    0x0035: "KC_GRAVE",
    0x0036: "KC_COMMA",
    0x0037: "KC_DOT",
    0x0038: "KC_SLASH",
    0x0039: "KC_CAPS_LOCK",
    0x0046: "KC_PRINT_SCREEN",
    0x0047: "KC_SCROLL_LOCK",
    0x0048: "KC_PAUSE",
    0x0049: "KC_INSERT",
    0x004a: "KC_HOME",
    0x004b: "KC_PAGE_UP",
    0x004c: "KC_DELETE",
    0x004d: "KC_END",
    0x004e: "KC_PAGE_DOWN",
    0x004f: "KC_RIGHT",
    0x0050: "KC_LEFT",
    0x0051: "KC_DOWN",
    0x0052: "KC_UP",
    0x00a8: "KC_AUDIO_MUTE",
    0x00a9: "KC_AUDIO_VOL_UP",
    0x00aa: "KC_AUDIO_VOL_DOWN",
    0x00ab: "KC_MEDIA_NEXT_TRACK",
    0x00ac: "KC_MEDIA_PREV_TRACK",
    0x00ad: "KC_MEDIA_STOP",
    0x00ae: "KC_MEDIA_PLAY_PAUSE",
    0x00af: "KC_MEDIA_SELECT",
    0x00b0: "KC_MEDIA_EJECT",
    0x00bb: "KC_MEDIA_FAST_FORWARD",
    0x00bc: "KC_MEDIA_REWIND",
  }[value] ?? null;
}

export function normalizeKeycode(value) {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed.includes("+")) return aliasKeycode(trimmed) ?? trimmed;

  const parts = trimmed.split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.pop();
  const base = aliasKeycode(key);
  if (!base) {
    throw new Error(`Unknown shortcut key: ${key}`);
  }

  return parts.reverse().reduce((inner, modifier) => {
    const qmkModifier = modifierAlias(modifier);
    if (!qmkModifier) throw new Error(`Unknown shortcut modifier: ${modifier}`);
    return `${qmkModifier}(${inner})`;
  }, base);
}

export function describeKeycode(value) {
  const keycode = normalizeKeycode(value);
  const chord = chordForKeycode(keycode);
  return {
    keycode,
    chord,
    action: actionForKeycode(keycode, chord),
  };
}

function describeEffectiveKeycode(value, layer) {
  const description = describeKeycode(value);
  if (layer === 0 && isTransparentKeycode(description.keycode)) {
    return {
      ...description,
      action: "Nothing on base layer",
      chord: "No output",
    };
  }
  return description;
}

function isTransparentKeycode(value) {
  return value === "KC_TRANSPARENT" || value === "KC_TRNS";
}

export function modifierAlias(value) {
  const key = value.toLowerCase();
  return {
    cmd: "LGUI",
    command: "LGUI",
    meta: "LGUI",
    gui: "LGUI",
    shift: "LSFT",
    option: "LALT",
    opt: "LALT",
    alt: "LALT",
    ctrl: "LCTL",
    control: "LCTL",
  }[key] ?? null;
}

export function aliasKeycode(value) {
  const key = value.trim();
  const lower = key.toLowerCase();
  if (/^kc_[a-z0-9_]+$/i.test(key) || /^[a-z]+\(.*\)$/i.test(key) || /^lm\(.*\)$/i.test(key)) return key;
  if (/^[a-z]$/i.test(key)) return `KC_${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `KC_${key}`;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return `KC_${key.toUpperCase()}`;

  return {
    backspace: "KC_BSPC",
    bspc: "KC_BSPC",
    delete: "KC_DEL",
    del: "KC_DEL",
    enter: "KC_ENTER",
    return: "KC_ENTER",
    escape: "KC_ESC",
    esc: "KC_ESC",
    left: "KC_LEFT",
    right: "KC_RIGHT",
    down: "KC_DOWN",
    up: "KC_UP",
    minus: "KC_MINUS",
    equal: "KC_EQUAL",
    plus: "KC_EQUAL",
    tab: "KC_TAB",
    space: "KC_SPACE",
    mute: "KC_AUDIO_MUTE",
    volup: "KC_AUDIO_VOL_UP",
    volumeup: "KC_AUDIO_VOL_UP",
    volume_up: "KC_AUDIO_VOL_UP",
    voldown: "KC_AUDIO_VOL_DOWN",
    volumedown: "KC_AUDIO_VOL_DOWN",
    volume_down: "KC_AUDIO_VOL_DOWN",
    play: "KC_MEDIA_PLAY_PAUSE",
    pause: "KC_MEDIA_PLAY_PAUSE",
    playpause: "KC_MEDIA_PLAY_PAUSE",
    next: "KC_MEDIA_NEXT_TRACK",
    previous: "KC_MEDIA_PREV_TRACK",
    prev: "KC_MEDIA_PREV_TRACK",
    no: "KC_NO",
    transparent: "KC_TRANSPARENT",
  }[lower] ?? null;
}

export function keycodeToValue(value) {
  const keycode = value.trim();
  const modified = keycode.match(/^([LR]?(?:CTL|CTRL|SFT|SHIFT|ALT|OPT|GUI|CMD|COMMAND))\((.*)\)$/i);
  if (modified) {
    const modifier = qmkModifierValue(modified[1]);
    return modifier | keycodeToValue(modified[2]);
  }

  const direct = qmkBaseValue(keycode);
  if (direct === null) throw new Error(`Unsupported writable keycode: ${value}`);
  return direct;
}

function qmkModifierValue(value) {
  const key = value.toUpperCase();
  return {
    LCTL: 0x0100,
    LCTRL: 0x0100,
    CTL: 0x0100,
    CTRL: 0x0100,
    LSFT: 0x0200,
    LSHIFT: 0x0200,
    SFT: 0x0200,
    SHIFT: 0x0200,
    LALT: 0x0400,
    LOPT: 0x0400,
    ALT: 0x0400,
    OPT: 0x0400,
    LGUI: 0x0800,
    LCMD: 0x0800,
    GUI: 0x0800,
    CMD: 0x0800,
    COMMAND: 0x0800,
    RCTL: 0x1100,
    RCTRL: 0x1100,
    RSFT: 0x1200,
    RSHIFT: 0x1200,
    RALT: 0x1400,
    ROPT: 0x1400,
    RGUI: 0x1800,
    RCMD: 0x1800,
  }[key] ?? failModifier(value);
}

function failModifier(value) {
  throw new Error(`Unsupported modifier: ${value}`);
}

function qmkBaseValue(value) {
  const key = value.toUpperCase();
  if (/^KC_[A-Z]$/.test(key)) return key.charCodeAt(3) - 61;
  if (/^KC_F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    const number = Number(key.slice(4));
    return number <= 12 ? 0x39 + number : 0x5b + number;
  }
  if (/^KC_[1-9]$/.test(key)) return 0x1d + Number(key.slice(3));
  if (key === "KC_0") return 0x27;

  return {
    KC_NO: 0x0000,
    KC_TRANSPARENT: 0x0001,
    KC_TRNS: 0x0001,
    KC_ENTER: 0x0028,
    KC_ENT: 0x0028,
    KC_ESCAPE: 0x0029,
    KC_ESC: 0x0029,
    KC_BACKSPACE: 0x002a,
    KC_BSPC: 0x002a,
    KC_TAB: 0x002b,
    KC_SPACE: 0x002c,
    KC_SPC: 0x002c,
    KC_MINUS: 0x002d,
    KC_MINS: 0x002d,
    KC_EQUAL: 0x002e,
    KC_EQL: 0x002e,
    KC_LBRACKET: 0x002f,
    KC_LBRC: 0x002f,
    KC_RBRACKET: 0x0030,
    KC_RBRC: 0x0030,
    KC_BACKSLASH: 0x0031,
    KC_BSLS: 0x0031,
    KC_SEMICOLON: 0x0033,
    KC_SCLN: 0x0033,
    KC_QUOTE: 0x0034,
    KC_QUOT: 0x0034,
    KC_GRAVE: 0x0035,
    KC_GRV: 0x0035,
    KC_COMMA: 0x0036,
    KC_COMM: 0x0036,
    KC_DOT: 0x0037,
    KC_SLASH: 0x0038,
    KC_SLSH: 0x0038,
    KC_CAPS_LOCK: 0x0039,
    KC_CAPS: 0x0039,
    KC_PRINT_SCREEN: 0x0046,
    KC_PSCR: 0x0046,
    KC_SCROLL_LOCK: 0x0047,
    KC_SCRL: 0x0047,
    KC_PAUSE: 0x0048,
    KC_PAUS: 0x0048,
    KC_INSERT: 0x0049,
    KC_INS: 0x0049,
    KC_HOME: 0x004a,
    KC_PAGE_UP: 0x004b,
    KC_PGUP: 0x004b,
    KC_DELETE: 0x004c,
    KC_DEL: 0x004c,
    KC_END: 0x004d,
    KC_PAGE_DOWN: 0x004e,
    KC_PGDN: 0x004e,
    KC_RIGHT: 0x004f,
    KC_LEFT: 0x0050,
    KC_DOWN: 0x0051,
    KC_UP: 0x0052,
    KC_AUDIO_MUTE: 0x00a8,
    KC_AUDIO_VOL_UP: 0x00a9,
    KC_AUDIO_VOL_DOWN: 0x00aa,
    KC_MEDIA_NEXT_TRACK: 0x00ab,
    KC_MEDIA_PREV_TRACK: 0x00ac,
    KC_MEDIA_STOP: 0x00ad,
    KC_MEDIA_PLAY_PAUSE: 0x00ae,
    KC_MEDIA_SELECT: 0x00af,
    KC_MEDIA_EJECT: 0x00b0,
    KC_MEDIA_FAST_FORWARD: 0x00bb,
    KC_MEDIA_REWIND: 0x00bc,
  }[key] ?? null;
}

function chordForKeycode(keycode) {
  if (keycode === "KC_TRANSPARENT" || keycode === "KC_TRNS") return "Transparent";
  if (keycode === "KC_NO") return "No output";

  const parsed = parseKeycode(keycode);
  if (!parsed) return keycode;

  const names = parsed.modifiers.map((modifier) => ({
    LCTL: "Control",
    LSFT: "Shift",
    LALT: "Option",
    LGUI: "Command",
  }[modifier] ?? modifier));
  return [...names, keyLabel(parsed.base)].join("+");
}

function parseKeycode(keycode, modifiers = []) {
  const modified = keycode.match(/^(LCTL|LSFT|LALT|LGUI)\((.*)\)$/i);
  if (modified) {
    return parseKeycode(modified[2], [...modifiers, modified[1].toUpperCase()]);
  }
  if (/^KC_[A-Z0-9_]+$/i.test(keycode)) {
    return { modifiers, base: keycode.toUpperCase() };
  }
  return null;
}

function keyLabel(base) {
  if (/^KC_[A-Z]$/.test(base)) return base.slice(3);
  if (/^KC_[0-9]$/.test(base)) return base.slice(3);
  if (/^KC_F([1-9]|1[0-9]|2[0-4])$/.test(base)) return base.slice(3);

  return {
    KC_ENTER: "Enter",
    KC_ESC: "Escape",
    KC_ESCAPE: "Escape",
    KC_BSPC: "Backspace",
    KC_BACKSPACE: "Backspace",
    KC_TAB: "Tab",
    KC_SPACE: "Space",
    KC_SPC: "Space",
    KC_MINUS: "-",
    KC_EQUAL: "=",
    KC_LEFT: "Left",
    KC_RIGHT: "Right",
    KC_UP: "Up",
    KC_DOWN: "Down",
    KC_HOME: "Home",
    KC_END: "End",
    KC_PAGE_UP: "Page Up",
    KC_PGUP: "Page Up",
    KC_PAGE_DOWN: "Page Down",
    KC_PGDN: "Page Down",
    KC_DELETE: "Delete",
    KC_DEL: "Delete",
    KC_AUDIO_MUTE: "Mute",
    KC_AUDIO_VOL_UP: "Volume Up",
    KC_AUDIO_VOL_DOWN: "Volume Down",
    KC_MEDIA_PLAY_PAUSE: "Play/Pause",
    KC_MEDIA_NEXT_TRACK: "Next Track",
    KC_MEDIA_PREV_TRACK: "Previous Track",
  }[base] ?? base;
}

function actionForKeycode(keycode, chord) {
  return {
    "LGUI(KC_C)": "Copy",
    "LGUI(KC_V)": "Paste",
    "LGUI(KC_X)": "Cut",
    "LGUI(KC_Z)": "Undo",
    "LGUI(LSFT(KC_Z))": "Redo",
    "LSFT(LGUI(KC_Z))": "Redo",
    "LGUI(KC_S)": "Save",
    KC_AUDIO_MUTE: "Mute",
    KC_AUDIO_VOL_UP: "Volume up",
    KC_AUDIO_VOL_DOWN: "Volume down",
    KC_MEDIA_PLAY_PAUSE: "Play/Pause",
    KC_MEDIA_NEXT_TRACK: "Next track",
    KC_MEDIA_PREV_TRACK: "Previous track",
    KC_TRANSPARENT: "Falls through to a lower layer",
    KC_TRNS: "Falls through to a lower layer",
    KC_NO: "Nothing",
  }[keycode] ?? chord;
}

export function requireControl(name) {
  const control = controls[name];
  if (!control) {
    const suggestion = Object.keys(controls).filter((key) => key.includes(name ?? "")).slice(0, 8);
    throw new Error(`Unknown control: ${name}${suggestion.length ? `\nMatches: ${suggestion.join(", ")}` : ""}`);
  }
  return control;
}

export function vitaly(args, options = {}) {
  const result = spawnSync(resolveVitalyCommand(), args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: vitalyPath(),
    },
    ...options,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    throw new Error(`vitaly failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`vitaly failed: ${output || `exit ${result.status}`}`);
  }
  return output;
}

export function resolveRawHidCommand() {
  const bundled = process.resourcesPath
    ? resolve(process.resourcesPath, "vendor", `doio-rawhid-darwin-${process.arch}`)
    : null;
  const candidates = [
    process.env.DOIO_RAWHID_PATH,
    bundled,
    resolve(repoRoot, "vendor", `doio-rawhid-darwin-${process.arch}`),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? "doio-rawhid";
}

export function resolveVitalyCommand() {
  const bundled = process.resourcesPath
    ? resolve(process.resourcesPath, "vendor", `vitaly-darwin-${process.arch}`)
    : null;
  const candidates = [
    process.env.DOIO_VITALY_PATH,
    bundled,
    resolve(repoRoot, "vendor", `vitaly-darwin-${process.arch}`),
    resolve(homedir(), ".cargo/bin/vitaly"),
    "/opt/homebrew/bin/vitaly",
    "/usr/local/bin/vitaly",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? "vitaly";
}

function vitalyPath() {
  return helperPath();
}

function helperPath() {
  return [
    resolve(repoRoot, "vendor"),
    resolve(homedir(), ".cargo/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH ?? "",
  ].join(":");
}
