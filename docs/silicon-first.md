# Silicon-First Plan

Goal: own the behavior as close to the hardware as practical. Use the
raw-HID/client layer only while it remains accurate and reliable; keep firmware
replacement ready as the escalation path.

## Current Position

The board works over USB as `qmkbuilder keyboard` (`0xFEED:0x6060`) and exposes
the usual HID interfaces plus QMK/VIA-style raw HID. That proves the stock
firmware is QMK-like at the USB layer, but it does not prove that the firmware
source is available, correct, or worth trusting.

For a reliable implementation we should not trust stock firmware blindly. The
current compromise is to own the host-side raw-HID client first (`vitaly`, forked
or patched if needed), then replace/bypass firmware if that layer proves
insufficient.

As of 2026-05-06, host-side writes are now repo-owned rather than VIA-GUI-owned:
reads still use `vitaly`, but writes use the local `doio-rawhid` helper and VIA
`SET_BUFFER` command. This is a reliable working control path, but still not
true firmware ownership.

## Vendor Claims And Warnings

The product page describes the KB16B-02 as:

- 16 keys + 3 knobs
- USB-C plus Bluetooth
- QMK/VIA programmable
- 9 editable layers
- OLED and RGB

The same page warns users not to self-flash firmware. That warning is not a
technical argument, but it is a signal that the wireless firmware path is likely
not cleanly supported by public QMK targets.

Public reports also point to a split reality:

- Wired variants are often flashable with QMK-style firmware.
- Wireless variants have different chips/support.
- Bluetooth macros are limited or corrupt on some units.
- Some users report Geehy/APM32 chips.

Source-level check on 2026-05-06 confirmed that upstream QMK has wired
`doio/kb16` targets only:

- rev1: ATmega32U4 with Atmel DFU
- rev2: APM32F103CBT6 / STM32F103-class with STM32Duino

Community Vial/QMK forks exist for wired rev2, but the visible Vial fork
explicitly says it is not compatible with the wireless version. Treat those
repos as references, not flash targets.

## Hardware Facts Needed

Before writing firmware, collect these facts from the physical PCB:

- Main MCU marking.
- Bluetooth chip/module marking.
- Whether Bluetooth is integrated into the main MCU or handled by a separate
  module.
- Exposed programming pads: SWDIO, SWCLK, GND, 3V3, NRST, BOOT0.
- OLED controller and bus pins, likely I2C.
- RGB data pin and LED type.
- Matrix row/column pins.
- Encoder A/B pins and encoder push pins.
- Battery/charging/power-management IC marking.

Without these, there is no silicon-first path, only educated firmware guessing.

## Preferred Implementation Paths

### Path 0: Own The Host-Side Control Client

Use while the stock firmware's raw-HID protocol gives accurate, durable writes.

1. Use `vitaly` as a backend, not as a UX.
2. Keep all definitions and layouts in this repo.
3. Wrap the small set of operations we need.
4. Patch/fork/vendor `vitaly` if the board needs quirks.
5. Escalate to Path A/B/C if the protocol cannot represent or reliably persist
   the desired behavior.

This is less close to silicon than firmware, but it is practical and reversible.

### Path A: Replace Firmware On Existing MCU

Use if the main MCU and bootloader/debug interface are known and supported.

1. Identify MCU and bootloader.
2. Check whether SWD readout protection is enabled.
3. Dump original flash if allowed.
4. Create a minimal firmware target:
   - scan matrix
   - read encoders
   - emit USB HID keyboard/consumer reports
5. Add OLED/RGB only after HID input is stable.
6. Add Bluetooth only if the hardware path is understood.

This is the closest software path to the silicon while keeping the PCB.

### Path B: Own USB, Ignore Bluetooth Initially

Use if the main MCU is supportable but wireless is opaque.

1. Build reliable wired USB firmware first.
2. Use Bluetooth only after the wired path is correct.
3. Accept that wireless may require reverse engineering a module interface or
   replacing the controller.

This is likely the fastest reliable firmware path.

### Path C: Controller Replacement

Use if the stock MCU/BLE stack is closed, locked, or too costly to reverse.

Options:

- RP2040 for robust wired USB firmware.
- nRF52840 for ZMK-style Bluetooth-first firmware.

This is more hardware work but gives the cleanest long-term software ownership.

## What We Should Not Do

- Do not flash wired `doio/kb16` firmware to the wireless KB16B-02.
- Do not assume VIA JSON position data is a firmware source of truth.
- Do not depend on Bluetooth macros from stock firmware.
- Do not enter bootloader by writing firmware commands until we know the
  recovery path.

## Immediate Bring-Up Checklist

1. Non-invasive USB snapshot:
   `./scripts/silicon-snapshot.sh`
   - Snapshot outputs are ignored by git because Bluetooth dumps can contain
     local device names and addresses.
2. Bootloader fingerprint, only when physically ready:
   `./scripts/watch-bootloader.sh`
3. Open the case and photograph both PCB sides.
4. Record all chip markings in `hardware/pcb-notes.md`.
5. Decide Path A, B, or C based on MCU/BLE topology.

## Firmware Shape

The target firmware should be boring and deterministic:

- Static keymap in source, not EEPROM-configured by host GUI.
- Compile-time encoder behavior.
- No runtime keymap mutation protocol in the first version.
- USB HID keyboard + consumer reports first.
- OLED status later.
- RGB later.
- Bluetooth only after the wired path is reliable.
