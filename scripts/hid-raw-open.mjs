import HID from "node-hid";

const raw = HID.devices().find((device) =>
  device.vendorId === 0xfeed &&
  device.productId === 0x6060 &&
  device.usagePage === 0xff60 &&
  device.usage === 0x61
);

if (!raw) {
  console.error("No QMK raw HID endpoint found for 0xFEED:0x6060 usage 0xFF60/0x61.");
  process.exit(1);
}

console.log("Opening raw HID endpoint:");
console.log({
  manufacturer: raw.manufacturer,
  product: raw.product,
  usagePage: "0xFF60",
  usage: "0x61",
  path: raw.path,
});

const device = new HID.HID(raw.path);
console.log("Opened successfully. Waiting 5s for any raw reports...");

const timer = setTimeout(() => {
  device.close();
  console.log("Closed.");
}, 5000);

device.on("data", (data) => {
  console.log(data.toString("hex"));
});

device.on("error", (error) => {
  clearTimeout(timer);
  console.error(error);
  try {
    device.close();
  } catch {
    // Already closed.
  }
  process.exitCode = 1;
});

