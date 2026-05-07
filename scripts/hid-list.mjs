import HID from "node-hid";

const wantedVendor = 0xfeed;
const wantedProduct = 0x6060;

const devices = HID.devices()
  .filter((device) => device.vendorId === wantedVendor && device.productId === wantedProduct)
  .sort((a, b) => (a.usagePage ?? 0) - (b.usagePage ?? 0) || (a.usage ?? 0) - (b.usage ?? 0));

if (devices.length === 0) {
  console.error("No 0xFEED:0x6060 HID interfaces found.");
  process.exit(1);
}

for (const device of devices) {
  console.log({
    manufacturer: device.manufacturer,
    product: device.product,
    vendorId: hex(device.vendorId, 4),
    productId: hex(device.productId, 4),
    usagePage: hex(device.usagePage, 4),
    usage: hex(device.usage, 2),
    interface: device.interface,
    path: device.path,
  });
}

function hex(value, width) {
  if (typeof value !== "number") return null;
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

