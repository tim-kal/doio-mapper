# Control Without VIA

We do not need the VIA GUI to configure this board.

The board exposes the same raw HID configuration protocol that VIA/Vial use.
`vitaly` can talk to it directly from the terminal, using our local community
definition JSON as metadata.

## Why `vitaly` Is Acceptable

`vitaly` is not VIA. It is a local CLI client for the same raw-HID protocol, and
the crate is MIT-licensed with source at `https://github.com/bskaplou/vitaly`.

That makes it a reasonable first backend:

- no GUI
- no browser/WebHID permission layer
- no opaque cloud or vendor app
- scriptable and testable from this repo
- patchable if the board exposes quirks
- replaceable if the protocol turns out to be too broken

This is not as close to the silicon as firmware, because it still relies on the
stock firmware's dynamic-keymap protocol. It is still much closer and more
controllable than VIA-the-application. If the protocol lies, drops writes, or
cannot express knob behavior accurately, we escalate to the firmware plan in
`docs/silicon-first.md`.

## What Works Now

The attached board is detected by `vitaly devices`:

```text
Product name: "keyboard" id: 24672
Manufacturer name: "qmkbuilder" id: 65261
Path: "<platform-specific HID path>"
```

Read-only keymap calls work. Example:

```sh
vitaly keys -m definitions/kb16b-02-wireless-via.json -l 0 -p 0,1
```

returns:

```text
Key on layer=0, row=0, col=1 => KC_2
```

That proves the CLI can read the dynamic keymap over raw HID.

## Commands

Use the physical-control wrapper for normal work:

```sh
npm run doio:controls
npm run doio:matrix
npm run doio:live
npm run doio:read -- k1
npm run doio:set -- k1 KC_A
npm run doio:apply -- --file layouts/example-starter.json --dry-run
npm run doio:verify -- --file layouts/example-starter.json
```

This wrapper maps names like `k1`, `k16`, `w1_cw`, and `w3_press` to raw
matrix coordinates from `definitions/physical-controls.json`.

CLI `--layer` values are firmware layer numbers, so `--layer 0` is the layer
the pad starts on. The visual app intentionally shows device layer numbers
instead: app layer `1` maps to firmware layer `0`.

For Mac shortcuts, Command is QMK's GUI modifier. Examples:

```sh
npm run doio:translate -- cmd+c
npm run doio:set -- k1 'LGUI(KC_C)'
npm run doio:set -- k2 'LGUI(KC_V)'
```

The wrapper also accepts the shortcut form directly:

```sh
npm run doio:set -- k1 cmd+c
npm run doio:set -- k2 cmd+v
```

## Visual Mapper

The same raw-HID path is exposed through a local browser app:

```sh
npm run app
```

Open `http://127.0.0.1:5176`. The app renders the physical controls, reads
current layer bindings from the board, translates shortcut aliases, writes
changes through `doio-rawhid`, and verifies each write by reading the control
back.

The app's layer dropdown is one-based to match the device. Layer `1` in the app
is firmware layer `0`, the layer the pad starts on. The app also polls VIA's
raw-HID switch-matrix state, highlights live physical controls, and shows the
Mac output/action for the pressed control on the selected device layer.

For day-to-day Mac use, build the native bundle:

```sh
npm run dist:mac
```

That produces `dist/mac-arm64/DOIO Mapper.app` and
`dist/DOIO Mapper-0.1.0-arm64.dmg`. The app bundle includes vendored
Apple Silicon `vitaly` and `doio-rawhid` binaries under
`Contents/Resources/vendor/`, so it can be launched from Finder. The local build
is ad-hoc signed.

`vitaly` is still used for reads and keycode labels. Writes use our small
`doio-rawhid` helper because the board reports VIA protocol 9 and ignores
`vitaly`'s older `SET_KEYCODE` write command. `doio-rawhid` writes through the
newer dynamic-keymap `SET_BUFFER` command and the wrapper verifies by reading
the control back.

Lower-level npm wrappers are still available so the metadata path is always
correct:

```sh
cargo install vitaly
npm run doio:devices
npm run doio:show
npm run doio:save
```

Read a single key:

```sh
npm run doio:key -- -l 0 -p 0,1
```

Set a single key:

```sh
npm run doio:key -- -l 0 -p 0,1 -v KC_A
```

Save and preview a full local layout file:

```sh
npm run doio:save -- layouts/current.local.json
npm run doio:preview -- -f layouts/current.local.json
```

Load a full layout file to the board:

```sh
npm run doio:load -- -f layouts/current.local.json
```

## Model

This firmware represents the board as a 5x7 dynamic keymap matrix. The community
JSON maps the visible keys, encoder directions, and encoder presses onto matrix
positions. Local EEPROM snapshots should be saved as ignored files such as
`layouts/current.local.json`.

Live keymap reads showed the visible 4x4 key grid is actually matrix columns
`0-3`, not `1-4` as implied by the community JSON layout. That one-column shift
is why earlier app writes appeared to verify but fired on the neighboring
physical key. `definitions/physical-controls.json` corrects this for the app
and CLI.

The product photo confirms the user-facing layout: a 4x4 key grid on the left,
two small knobs on the top right, and one large knob on the lower right.
`definitions/physical-controls.json` is the source of truth for naming those
controls. The key grid is named `k1` through `k16`, starting at the top-left
key and moving left-to-right by row. The knobs are `w1` for the left small knob,
`w2` for the right small knob, and `w3` for the large knob.

See `docs/physical-layout.md` for the physical naming diagram.

One factory keycode saved as `LM(0,KC_NO)`, which `vitaly` cannot parse when
loading. `scripts/doio-save.sh` normalizes that nonsensical value to `KC_NO` so
saved layout files are loadable.

The `encoder_layout` field is currently empty, so this board likely exposes knob
rotation as ordinary matrix positions rather than QMK's newer encoder map API.
That is fine: it means setting knob actions is still just setting keycodes.
The clockwise/counter-clockwise names are provisional until we physically rotate
each knob and confirm the direction assignments.

Live physical input uses the firmware's `GET_KEYBOARD_VALUE /
SWITCH_MATRIX_STATE` raw-HID command. It is closer to the board than macOS key
capture because it reports matrix positions before the host interprets the
resulting keycode. If this endpoint returns zeros while a key is held, the
stock firmware was compiled without live switch matrix disclosure and the next
fallback is host-event capture or firmware work.

For host-level diagnostics:

```sh
npm run doio:doctor
npm run doio:capture:macos -- 20
```

`doio:doctor` checks the coordinate map, helper binaries, packaged app
definition, and live raw-HID access. For the capture command, press a DOIO key.
For `cmd+c`/`cmd+v`, macOS should report a Command flag plus keycode `8` (`c`)
or `9` (`v`).

Writes are recoverable: before the first write in a CLI/app process, the mapper
stores a local snapshot at `backups/before-write-*.json`.

```sh
npm run doio:restore -- --file backups/before-write-...json --dry-run
npm run doio:restore -- --file backups/before-write-...json
```

## Recommended Strategy

Build our own small layer around `vitaly`, then keep hardware mappings simple
and stable:

- Knob turns: media keys, arrows, tab navigation, scroll/page keys.
- Knob presses: mute, play/pause, layer switch, or simple hotkeys.
- Keys: unique shortcuts that macOS can catch reliably.

`layouts/example-starter.json` is a first draft that maps the top 12 keys to
`KC_F13` through `KC_F24`, maps the bottom row to common edit shortcuts, and
maps the knobs to page/media/volume actions. It is not applied automatically.

For complex actions, have the board emit a simple shortcut like
`LGUI(LALT(LSFT(KC_1)))`, then let a Mac-side tool run the actual action. This
avoids Bluetooth macro corruption and keeps the board portable.

## Mac-Side Layer

If we need app-aware behavior, use one of these:

- Hammerspoon for app/window automation triggered by hotkeys. It is already
  installed on this Mac.
- Karabiner-Elements for per-device key remapping and shell commands, if we
  later need device-specific interception.
- Shortcuts.app for simple macOS automations.
- A custom Node/Swift agent later if we need full control.

Firmware/dynamic keymap handles stable HID output. The Mac-side layer handles
context and fragile long-running actions.
