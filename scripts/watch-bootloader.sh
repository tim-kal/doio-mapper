#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Bootloader watcher.

This does not send any command to the board.
It only polls USB devices so we can fingerprint bootloader mode.

When ready:
1. Start this script.
2. Put the board into bootloader mode physically, if there is a reset/boot combo.
3. Press Ctrl-C after the changed USB identity appears.
EOF

while true; do
  clear
  date
  echo
  system_profiler SPUSBDataType 2>/dev/null \
    | awk '
      /keyboard:|Keyboard:|DFU|STM|Maple|APM|Geehy|GD32|CH55|CH57|Nordic|nRF|BOOT|Boot|qmk|QMK|DOIO|Megalodon/ {show=1}
      show {print}
      show && /^$/ {show=0}
    '
  echo
  echo "Known clues to watch for:"
  echo "- Atmel DFU: 03EB:2FF4"
  echo "- STM32Duino / Maple: 1EAF:0003"
  echo "- UF2 mass storage: RPI-RP2, NICE!NANO, UF2BOOT, etc."
  echo "- Nordic DFU: often nRF/DFU-specific USB strings"
  sleep 2
done

