# Firmware Research

Last updated: 2026-05-06

## Connected Board

- Product family: DOIO / Megalodon Triple Knob Wireless Macro Pad.
- User-facing model: DOIO KB16B-02 Wireless.
- Normal USB identity captured locally: `qmkbuilder keyboard`, VID/PID
  `0xFEED:0x6060`.
- Raw HID interface: usage page `0xFF60`, usage `0x61`.
- Local non-invasive snapshots can be captured under `hardware/snapshots/`.

Snapshots are ignored by git because Bluetooth and HID dumps can include local
host/device names.

## Public Firmware Found

### Official QMK `doio/kb16`

The upstream QMK target is for `KB16-01`, not the wireless `KB16B-02`.

Known wired revisions:

- `doio/kb16/rev1`: ATmega32U4, `atmel-dfu`.
- `doio/kb16/rev2`: APM32F103CBT6 / STM32F103-class, `stm32duino`.

The QMK readme warns that the revision must be selected carefully to avoid
bricking the board. The rev2 target includes matrix, encoder, OLED, and RGB
pins for the wired STM32/APM32 board, but those pins are not proven correct for
the wireless PCB.

References:

- https://github.com/qmk/qmk_firmware/tree/master/keyboards/doio/kb16
- https://raw.githubusercontent.com/qmk/qmk_firmware/master/keyboards/doio/kb16/readme.md
- https://raw.githubusercontent.com/qmk/qmk_firmware/master/keyboards/doio/kb16/rev2/keyboard.json

### Community Vial/QMK Forks

Found source/binaries for wired rev2 boards:

- `thompson-vii/kb16_rev2_vial_fw`
- `dikkadev/doio_kb16_rev2_firmware`
- `wlellington/frogimancer-macropad`

These are useful examples for encoder maps, OLED/RGB behavior, and Vial
configuration. They are not a safe flash target for the wireless board. The
`thompson-vii` repo explicitly says the Vial firmware is not compatible with
the wireless version.

References:

- https://github.com/thompson-vii/kb16_rev2_vial_fw
- https://github.com/dikkadev/doio_kb16_rev2_firmware
- https://github.com/wlellington/frogimancer-macropad

## Current Firmware Conclusion

Firmware control is the right silicon-first direction, but there is no verified
drop-in firmware target for this exact wireless board yet.

Do not flash:

- Official QMK `doio/kb16/rev1`.
- Official QMK `doio/kb16/rev2`.
- Third-party KB16 rev2 Vial binaries.

Those are wired KB16-01 targets. The connected device is a wireless KB16B-02 and
may have a different MCU, Bluetooth topology, bootloader, power management, or
pinout.

## Gated Firmware Plan

1. Identify the physical silicon:
   - main MCU marking
   - Bluetooth chip/module marking
   - battery/charger IC marking
   - debug pads: SWDIO, SWCLK, GND, 3V3, NRST, BOOT0, UART
2. Fingerprint bootloader only when physically ready:
   - watch USB IDs while the user manually enters bootloader
   - expected wired rev1 ID would be `03EB:2FF4`
   - expected wired rev2 ID would be `1EAF:0003`
   - anything else means a separate target is required
3. Attempt original firmware dump if the MCU allows it.
4. Build a minimal wired USB firmware first:
   - matrix scan
   - encoder read
   - USB keyboard/consumer HID reports
5. Add OLED/RGB only after inputs are stable.
6. Add Bluetooth only after the MCU/BLE topology is understood.

If the wireless stack is opaque or locked, the reliable ownership path becomes
controller replacement: RP2040 for wired-first USB, or nRF52840 for
Bluetooth-first ZMK-style firmware.
