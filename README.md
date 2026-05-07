# DOIO Mapper

Local macOS mapper for the DOIO KB16B-02 / Megalodon Triple Knob Wireless
Macro Pad.

The goal is a transparent, hackable alternative to the VIA GUI for this board:
read the current keymap over raw HID, edit the 16 keys and 3 clickable encoders,
write changes back to the device, and verify what was written.

## Supported Device

This project targets the wireless triple-knob pad commonly sold as:

- DOIO KB16B-02 Wireless
- Megalodon Triple Knob Wireless Macro Pad
- 16 keys, 3 clickable rotary encoders, OLED, RGB, USB-C/Bluetooth

Observed stock firmware identity:

- VID/PID: `0xFEED:0x6060`
- USB product: `qmkbuilder keyboard`
- QMK/VIA raw HID endpoint: usage page `0xFF60`, usage `0x61`

Do not flash wired `doio/kb16` firmware to the wireless board unless you have
verified the exact PCB, MCU, bootloader, and recovery path.

## What It Does

- Visual macOS app for keys `k1`-`k16` and knobs `w1`, `w2`, `w3`.
- Device-facing layers `1`-`9`; internally converted to firmware layers `0`-`8`.
- Mac shortcut aliases such as `cmd+c`, `cmd+v`, `volume_up`, and `playpause`.
- Repo-owned raw-HID `GET_BUFFER`, `SET_BUFFER`, and live switch-matrix reads.
- Per-write verification and local recovery backups under `backups/`.
- Live input panel that highlights physical controls when the firmware exposes
  switch-matrix state.

## Install From Source

Requirements:

- macOS on Apple Silicon
- Node.js 20+
- Rust toolchain for the small raw-HID helper

```sh
npm install
npm run vendor:binaries
npm run app
```

Open `http://127.0.0.1:5176`.

## Build The macOS App

```sh
npm install
npm run dist:mac
```

Outputs:

- `dist/mac-arm64/DOIO Mapper.app`
- `dist/DOIO Mapper-0.1.0-arm64.dmg`
- `dist/DOIO Mapper-0.1.0-arm64-mac.zip`

The local build is ad-hoc signed. macOS may still show Gatekeeper warnings
because the app is not notarized.

## CLI

```sh
npm run hid:list
npm run doio:doctor
npm run doio:controls
npm run doio:matrix
npm run doio:live
npm run doio:read -- k1
npm run doio:set -- k1 cmd+c
npm run doio:apply -- --file layouts/example-starter.json --dry-run
```

CLI layer arguments are firmware-layer numbers. The app uses device layer
numbers, so app layer `1` equals CLI layer `0`.

## Physical Naming

Keys are named `k1` through `k16`, starting at the top-left key and moving
left-to-right by row:

```text
k1   k2   k3   k4
k5   k6   k7   k8
k9   k10  k11  k12
k13  k14  k15  k16
```

Knobs:

- `w1`: left small knob
- `w2`: right small knob
- `w3`: large knob

Each knob has `_ccw`, `_cw`, and `_press` controls, for example `w3_cw`.

## Known Gaps

See [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md).

## Privacy

This repository intentionally does not include local board backups, personal
layouts, private automation mappings, or app secrets. Generated local files such
as `backups/`, `vendor/`, `dist/`, and `layouts/current*.json` are ignored.

## License

MIT. See [LICENSE](LICENSE).
