#!/usr/bin/env bash
set -euo pipefail

seconds="${1:-20}"

cat <<EOF
This macOS build does not expose 'hidutil eventmonitor', so this script cannot
capture ordinary keyboard events directly.

Use one of these instead:

- Karabiner-Elements EventViewer for key/knob HID keycodes.
- 'npm run hid:list' to inspect HID interfaces.
- 'npm run hid:raw' to open the QMK raw HID endpoint.

Requested capture length was ${seconds}s; no capture was started.
EOF
