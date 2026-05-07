const { spawnSync } = require("node:child_process");
const { existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`Cannot sign missing app bundle: ${appPath}`);
  }

  rmSync(join(appPath, "Contents", "Resources", "vendor", ".build-vitaly"), {
    force: true,
    recursive: true,
  });

  const plistPath = join(appPath, "Contents", "Info.plist");
  const plistBuddy = "/usr/libexec/PlistBuddy";
  const plistCommands = [
    "Delete :NSAudioCaptureUsageDescription",
    "Delete :NSBluetoothAlwaysUsageDescription",
    "Delete :NSBluetoothPeripheralUsageDescription",
    "Delete :NSCameraUsageDescription",
    "Delete :NSMicrophoneUsageDescription",
    "Delete :NSAppTransportSecurity:NSAllowsArbitraryLoads",
    "Set :NSAppTransportSecurity:NSAllowsLocalNetworking true",
  ];

  for (const command of plistCommands) {
    spawnSync(plistBuddy, ["-c", command, plistPath], { encoding: "utf8" });
  }

  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`codesign failed:\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
};
