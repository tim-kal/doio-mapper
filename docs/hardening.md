# Hardening Status

Last updated: 2026-05-07

## Implemented

- Repo-owned `SET_BUFFER` writes through `doio-rawhid`.
- Repo-owned `GET_BUFFER` reads through `doio-rawhid` for supported keycodes,
  with `vitaly` used only as a fallback for unsupported labels.
- Retry/backoff around transient macOS HID exclusive-open failures.
- Corrected physical key grid mapping: `k1`-`k16` use matrix columns `0-3`.
- Visual app layers are now user-facing: app layer `1` maps to firmware layer
  `0`, which is the device's starting layer.
- Raw-HID live switch-matrix reads through `doio-rawhid get-matrix`.
- Raw-HID live switch-matrix sampling through `doio-rawhid sample-matrix`,
  which polls several frames per app tick so short encoder pulses are less
  likely to be missed.
- Visual live input panel: physical key/knob highlighting plus Mac
  output/action display for the pressed control. It now also reports unmapped
  raw matrix positions instead of silently ignoring them.
- Separate writable `matrix` and observed `liveMatrix` coordinates. This is
  necessary because this board's switch-matrix live report is not in the same
  physical row order as its dynamic-keymap storage.
- Automatic local recovery snapshot before the first write in each CLI/app
  process:
  `backups/before-write-*.json`.
- `npm run doio:doctor` for coordinate-map, helper, packaged-app, and live
  device checks.
- `npm run doio:capture:macos -- 20` for host-level key event capture.
- `npm run doio:restore -- --file backups/before-write-...json` for replaying
  recovery snapshots.

## Still Knowingly Missing

- Physical hold/turn confirmation for the new live row-rotation map. Current
  observation: pressing the second-row left key reports the raw bit that the old
  app treated as `k1`, so `k5` is now mapped to live matrix `0,0` and the top
  row is provisionally mapped to live row `4`.
- Knob direction verification. The knob coordinates still come from the
  community JSON and may have similar inaccuracies to the key grid.
- Exact silicon identity: MCU marking, Bluetooth chip/module, programming pads,
  bootloader USB IDs, and original firmware dump feasibility.
- Native app stack decision. Electron works, but a Tauri/Rust or Swift wrapper
  would reduce moving parts if this becomes daily infrastructure.

## Next Live Checklist

1. Reconnect/wake the pad over USB.
2. Run:
   ```sh
   npm run hid:list
   npm run doio:doctor
   npm run doio:live
   ```
3. Open the app and hold each key long enough to confirm the matching `k1`-`k16`
   highlight appears.
4. Rotate and press each knob while watching the app live panel and macOS
   events:
   ```sh
   npm run doio:capture:macos -- 20
   ```
5. Update `definitions/physical-controls.json` if any knob direction is
   reversed or mis-positioned.
