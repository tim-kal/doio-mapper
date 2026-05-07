# PCB Notes

Fill this in after opening the board.

## Device

- Product: DOIO KB16B-02 / Megalodon Triple Knob Wireless Macro Pad
- USB VID/PID in stock firmware: `0xFEED:0x6060`

## Chip Markings

- Main MCU:
- Bluetooth chip/module:
- Battery charger / power management:
- OLED controller:
- Other notable ICs:

## Debug / Programming Pads

- SWDIO:
- SWCLK:
- GND:
- 3V3:
- NRST:
- BOOT0:
- UART TX/RX:

## Matrix

- Rows:
- Columns:
- Diode direction:

## Encoders

- Encoder 1 A/B:
- Encoder 1 push:
- Encoder 2 A/B:
- Encoder 2 push:
- Encoder 3 A/B:
- Encoder 3 push:

## OLED / RGB

- OLED bus:
- OLED pins:
- RGB data pin:
- LED type:

## Photos

Add local image paths here after capturing PCB photos.

## Current Firmware-Relevant Evidence

- Non-invasive USB/HID snapshots can be captured under `hardware/snapshots/`.
- Normal-mode USB identity remains `qmkbuilder keyboard`, VID/PID
  `0xFEED:0x6060`.
- Raw HID interface remains usage page `0xFF60`, usage `0x61`.
- Public wired KB16 firmware targets do not establish this wireless PCB's MCU,
  bootloader, pinout, or Bluetooth topology.
