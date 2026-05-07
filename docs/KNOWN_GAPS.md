# Known Gaps

This project is usable for the stock `0xFEED:0x6060` wireless pad over USB, but
it is still early hardware-facing software.

## Device Coverage

- Tested against one DOIO KB16B-02 / Megalodon Triple Knob Wireless Macro Pad.
- Other firmware revisions may expose the same VID/PID with different matrix
  coordinates or VIA protocol quirks.
- Bluetooth behavior is not covered. Configuration should be done over USB.

## Live Input

- The app polls VIA's raw-HID switch-matrix state. This is closer to the
  firmware than macOS key-event capture, but it depends on the stock firmware
  exposing that matrix state.
- Encoder turns can be very short pulses. If the UI misses turns, increase the
  polling strategy or add host-event capture for confirmation.
- Knob clockwise/counter-clockwise labels are provisional until more users
  physically verify direction mappings.

## Firmware

- The repo does not include custom firmware.
- Public QMK/Vial firmware found so far targets wired KB16 variants, not this
  wireless board.
- Do not flash wired firmware to the wireless board without verifying the exact
  MCU, bootloader, pinout, and recovery path.

## macOS App Distribution

- The app is currently ad-hoc signed and not notarized.
- Release artifacts are Apple Silicon macOS builds only.
- A smaller native Swift or Tauri/Rust wrapper may be a better long-term app
  shell than Electron.

## Protocol Coverage

- `doio-rawhid` implements only the commands this app needs:
  `GET_BUFFER`, `SET_BUFFER`, and `SWITCH_MATRIX_STATE`.
- Keycode encoding/decoding covers common keyboard, modifier, and media keys.
  More QMK keycodes can be added incrementally.

## Safety

- Writes are verified by reading the value back.
- Before the first write in a process, a local backup is created under
  `backups/`.
- Backups are intentionally ignored by git because they can contain personal
  mappings.
