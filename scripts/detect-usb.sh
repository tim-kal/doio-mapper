#!/usr/bin/env bash
set -euo pipefail

echo "== USB devices containing qmk, doio, keyboard, maple, atmel, stm =="
system_profiler SPUSBDataType 2>/dev/null \
  | awk 'BEGIN{RS=""; FS="\n"} /qmk|QMK|DOIO|keyboard|Keyboard|Maple|Atmel|STM|stm/ {print $0 "\n"}'

echo "== HID entries for the attached qmkbuilder-style device =="
hidutil list 2>/dev/null \
  | awk 'NR == 1 || /0xfeed|0xFEED|qmk|QMK|DOIO|keyboard/'

echo "== IOUSB entries for likely KB16 device =="
ioreg -p IOUSB -l -w 0 2>/dev/null \
  | awk '/keyboard@|USB Product Name|USB Vendor Name|idVendor|idProduct|LeafLabs|Maple|Atmel|STM32|qmkbuilder/ {print}'

