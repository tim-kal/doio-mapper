# DOIO KB16B-02 Wireless Investigation

Date: 2026-05-05

## Local USB Evidence

Observed through `ioreg`, `hidutil list`, and `node-hid` on macOS while the
wireless macropad is connected over USB:

```text
USB Vendor Name: qmkbuilder
USB Product Name: keyboard
idVendor: 65261 decimal = 0xFEED
idProduct: 24672 decimal = 0x6060
```

HID interfaces include:

```text
0xFEED 0x6060 UsagePage 1     Usage 6   Product keyboard  # keyboard
0xFEED 0x6060 UsagePage 1     Usage 2   Product keyboard  # mouse
0xFEED 0x6060 UsagePage 12    Usage 1   Product keyboard  # consumer/media
0xFEED 0x6060 UsagePage 65376 Usage 97  Product keyboard  # vendor-defined/raw HID
```

`node-hid` can open the vendor-defined endpoint successfully:

```text
usagePage: 0xFF60
usage: 0x61
interface: 1
```

Interpretation: the attached device is already running QMK/VIA-like firmware on
its USB interface. It is presenting normal HID events, so macOS can receive
keycodes without custom software.

## Product Evidence

The device is the Megalodon Triple Knob Wireless Macro Pad with Bluetooth.
KeebMonkey lists the wireless model as Bluetooth 5.0 and wired, 16 keys, 3
clickable knobs, 9 displayable layers, VIA compatible, RGB backlight, and a
2100 mAh battery. Nouvolo lists the same class as a DOIO Megalodon Wireless
Triple Knob Macropad with USB-C/Bluetooth and VIA 1.3.1 compatibility.

A community repository identifies this exact wireless board as `DOIO KB16B-02`,
also known as the Megalodon Triple Knob Wireless Macro Pad, and provides a VIA
JSON for sideloading in Vial or VIA 2.2.0.

## Wired QMK Background

QMK upstream has a DOIO folder with `kb16` support for the wired KB16 family.
That target is useful background because it has the same broad control shape:

- 16 regular keys plus 3 encoder push switches
- 3 rotary encoders
- OLED
- RGB

The upstream wired keymap uses QMK encoder maps:

```c
[_BASE] = {
  ENCODER_CCW_CW(KC_MPRV, KC_MNXT),
  ENCODER_CCW_CW(KC_PGDN, KC_PGUP),
  ENCODER_CCW_CW(KC_VOLD, KC_VOLU)
}
```

That means the knobs are not conceptually mysterious: in QMK/VIA terms each
knob has clockwise and counter-clockwise keycodes, plus a normal matrix key for
the press.

However, this upstream target is for the wired KB16 family. It should not be
treated as the flash target for the wireless KB16B-02 without board-specific
firmware evidence.

## Flashing Risk

Avoid flashing for now. The wireless board adds Bluetooth firmware behavior and
a different community support path. Public reports mention Bluetooth macro
issues, especially long macros producing garbage or repeating.

## Practical Architecture

The current direction is silicon-first:

- identify MCU/BLE topology
- fingerprint bootloader/recovery
- build deterministic firmware where mappings live in source
- avoid VIA/Vial/dynamic-keymap protocols for production behavior

`vitaly` raw-HID remains useful for reading and backing up stock EEPROM state,
but it is not the long-term architecture.

## References

- KeebMonkey product page: https://www.keebmonkey.com/products/megalodon-triple-knob-wireless-macro-pad
- WhatGeek KB16B-02 product/download page: https://www.whatgeek.com/collections/keyboards-for-pc-mac/products/doio-kb16b-02-macro-keyboard-updated-macro-pad
- Nouvolo product page: https://www.nouvolo.com/products/doio-megalodon-wireless-triple-knob-macropad
- Community JSON repo: https://github.com/yushi-hattori/DOIO-KB16-02-Wireless-VIA
- Reddit setup thread: https://www.reddit.com/r/macro_pads/comments/1boubzy/via_solved_for_megalodon_triple_knob_macro_pad/
