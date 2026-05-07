#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:-hardware/snapshots/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$out_dir"

system_profiler SPUSBDataType > "$out_dir/system_profiler-usb.txt"
system_profiler SPBluetoothDataType > "$out_dir/system_profiler-bluetooth.txt"
hidutil list > "$out_dir/hidutil-list.txt"
ioreg -p IOUSB -l -w 0 > "$out_dir/ioreg-usb.txt"
ioreg -r -c AppleUserHIDDevice -l -w 0 > "$out_dir/ioreg-hid-devices.txt"
npm run hid:list > "$out_dir/node-hid-list.txt"

cat > "$out_dir/summary.txt" <<EOF
Silicon snapshot captured at $(date -Iseconds)

Key files:
- system_profiler-usb.txt
- system_profiler-bluetooth.txt
- hidutil-list.txt
- ioreg-usb.txt
- ioreg-hid-devices.txt
- node-hid-list.txt
EOF

echo "Wrote $out_dir"

