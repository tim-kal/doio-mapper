import CoreGraphics
import Foundation

let seconds = TimeInterval(Int(CommandLine.arguments.dropFirst().first ?? "20") ?? 20)

func eventName(_ type: CGEventType) -> String {
    switch type {
    case .keyDown: return "keyDown"
    case .keyUp: return "keyUp"
    case .flagsChanged: return "flagsChanged"
    default: return "\(type.rawValue)"
    }
}

func flagNames(_ flags: CGEventFlags) -> String {
    var names: [String] = []
    if flags.contains(.maskCommand) { names.append("cmd") }
    if flags.contains(.maskShift) { names.append("shift") }
    if flags.contains(.maskControl) { names.append("ctrl") }
    if flags.contains(.maskAlternate) { names.append("option") }
    if flags.contains(.maskSecondaryFn) { names.append("fn") }
    return names.isEmpty ? "-" : names.joined(separator: "+")
}

let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .keyDown || type == .keyUp || type == .flagsChanged {
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let autorepeat = event.getIntegerValueField(.keyboardEventAutorepeat)
        let line = "\(Date()) \(eventName(type)) keycode=\(keycode) flags=\(flagNames(event.flags)) autorepeat=\(autorepeat)"
        print(line)
        fflush(stdout)
    }
    return Unmanaged.passUnretained(event)
}

let mask = (1 << CGEventType.keyDown.rawValue)
    | (1 << CGEventType.keyUp.rawValue)
    | (1 << CGEventType.flagsChanged.rawValue)

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: CGEventMask(mask),
    callback: callback,
    userInfo: nil
) else {
    fputs("Could not create event tap. Grant Accessibility/Input Monitoring permission to this terminal app, then retry.\n", stderr)
    exit(1)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)

print("Listening for \(Int(seconds))s. Press one DOIO key now.")
RunLoop.current.run(until: Date().addingTimeInterval(seconds))
print("Done.")
