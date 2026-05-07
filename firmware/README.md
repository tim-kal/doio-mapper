# Firmware Workspace

This folder is reserved for firmware research. The current identified device is
the wireless DOIO KB16B-02 / Megalodon Triple Knob Wireless Macro Pad, so do not
flash wired `doio/kb16` firmware here.

See `firmware/research.md` for the current source-level firmware findings.

## Wired KB16 Background Only

These QMK targets are only background for the wired KB16 family:

```sh
qmk compile -kb doio/kb16/rev1 -km default
qmk compile -kb doio/kb16/rev2 -km default
```

Rev1 and rev2 are not interchangeable, and neither is currently proven safe for
the wireless KB16B-02.

The public community Vial firmware for `kb16/rev2` is also wired-only. It is a
useful reference for encoder/OLED/RGB behavior, but not a safe binary or source
target for this wireless board.

## Keymap Strategy If Wireless Source Appears

If we later find wireless-specific source, create a dedicated keymap with:

- `ENCODER_MAP_ENABLE = yes` at keymap level.
- Knobs mapped explicitly through `encoder_map`.
- Encoder press switches treated as normal keys.
- OLED used for current layer/profile, not decorative animation.
- Bluetooth-tested mappings kept simple on the base layer.

Avoid putting destructive macros on layer 0. For Bluetooth, avoid long firmware
macros until proven stable.
