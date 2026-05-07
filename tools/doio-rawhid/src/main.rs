use hidapi::{HidApi, HidDevice};
use std::env;
use std::process;
use std::thread::sleep;
use std::time::Duration;

const VID: u16 = 0xfeed;
const PID: u16 = 0x6060;
const USAGE_PAGE: u16 = 0xff60;
const USAGE: u16 = 0x61;
const REPORT_LEN: usize = 32;
const MATRIX_ROWS: usize = 5;
const MATRIX_COLS: usize = 7;
const CMD_GET_KEYBOARD_VALUE: u8 = 0x02;
const VALUE_SWITCH_MATRIX_STATE: u8 = 0x03;
const CMD_KEYMAP_GET_BUFFER: u8 = 0x12;
const CMD_KEYMAP_SET_BUFFER: u8 = 0x13;
const MAX_ATTEMPTS: u8 = 8;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("get-buffer") => get_buffer(&args[2..]),
        Some("get-matrix") => get_matrix(&args[2..]),
        Some("sample-matrix") => sample_matrix(&args[2..]),
        Some("set-buffer") => set_buffer(&args[2..]),
        _ => Err("Usage: doio-rawhid get-buffer <offset> <size> | get-matrix [row-offset] | sample-matrix [row-offset] [samples] [interval-ms] | set-buffer <offset> <keycode-u16>".to_string()),
    }
}

fn get_buffer(args: &[String]) -> Result<(), String> {
    if args.len() != 2 {
        return Err("Usage: doio-rawhid get-buffer <offset> <size>".to_string());
    }

    let offset = parse_u16(&args[0])?;
    let size = parse_size(&args[1])?;
    let device = open_raw_hid_with_retry()?;
    let payload = [
        CMD_KEYMAP_GET_BUFFER,
        ((offset >> 8) & 0xff) as u8,
        (offset & 0xff) as u8,
        size,
    ];
    let response = send_recv_with_retry(&device, &payload)?;
    if response[0] == 0xff {
        return Err("keyboard returned VIA_UNHANDLED for keymap get-buffer".to_string());
    }
    if response[0] != CMD_KEYMAP_GET_BUFFER {
        return Err(format!("unexpected response command 0x{:02x}", response[0]));
    }

    let payload_start = 4;
    let end = payload_start + size as usize;
    let bytes = response[payload_start..end]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ");
    println!("{bytes}");
    Ok(())
}

fn get_matrix(args: &[String]) -> Result<(), String> {
    if args.len() > 1 {
        return Err("Usage: doio-rawhid get-matrix [row-offset]".to_string());
    }

    let offset = match args.first() {
        Some(value) => parse_matrix_offset(value)?,
        None => 0,
    };
    let device = open_raw_hid_with_retry()?;
    print_bytes(&read_matrix_bytes(&device, offset)?);
    Ok(())
}

fn sample_matrix(args: &[String]) -> Result<(), String> {
    if args.len() > 3 {
        return Err("Usage: doio-rawhid sample-matrix [row-offset] [samples] [interval-ms]".to_string());
    }

    let offset = match args.first() {
        Some(value) => parse_matrix_offset(value)?,
        None => 0,
    };
    let samples = match args.get(1) {
        Some(value) => parse_sample_count(value)?,
        None => 8,
    };
    let interval_ms = match args.get(2) {
        Some(value) => parse_interval_ms(value)?,
        None => 8,
    };
    let device = open_raw_hid_with_retry()?;
    let mut merged = vec![0_u8; matrix_byte_len(offset)];
    for sample in 0..samples {
        let bytes = read_matrix_bytes(&device, offset)?;
        for (index, byte) in bytes.iter().enumerate() {
            merged[index] |= byte;
        }
        if sample + 1 < samples {
            sleep(Duration::from_millis(interval_ms as u64));
        }
    }
    print_bytes(&merged);
    Ok(())
}

fn set_buffer(args: &[String]) -> Result<(), String> {
    if args.len() != 2 {
        return Err("Usage: doio-rawhid set-buffer <offset> <keycode-u16>".to_string());
    }

    let offset = parse_u16(&args[0])?;
    let keycode = parse_u16(&args[1])?;
    let device = open_raw_hid_with_retry()?;
    let payload = [
        CMD_KEYMAP_SET_BUFFER,
        ((offset >> 8) & 0xff) as u8,
        (offset & 0xff) as u8,
        2,
        ((keycode >> 8) & 0xff) as u8,
        (keycode & 0xff) as u8,
    ];
    let response = send_recv_with_retry(&device, &payload)?;
    if response[0] == 0xff {
        return Err("keyboard returned VIA_UNHANDLED for keymap set-buffer".to_string());
    }
    if response[0] != CMD_KEYMAP_SET_BUFFER {
        return Err(format!("unexpected response command 0x{:02x}", response[0]));
    }
    Ok(())
}

fn parse_u16(value: &str) -> Result<u16, String> {
    if let Some(hex) = value.strip_prefix("0x") {
        u16::from_str_radix(hex, 16).map_err(|error| error.to_string())
    } else {
        value.parse::<u16>().map_err(|error| error.to_string())
    }
}

fn parse_size(value: &str) -> Result<u8, String> {
    let size = parse_u16(value)?;
    if size == 0 || size > (REPORT_LEN - 1) as u16 {
        return Err(format!("size must be between 1 and {}", REPORT_LEN - 1));
    }
    Ok(size as u8)
}

fn parse_matrix_offset(value: &str) -> Result<u8, String> {
    let offset = parse_u16(value)?;
    if offset as usize >= MATRIX_ROWS {
        return Err(format!("row-offset must be between 0 and {}", MATRIX_ROWS - 1));
    }
    Ok(offset as u8)
}

fn parse_sample_count(value: &str) -> Result<u8, String> {
    let samples = parse_u16(value)?;
    if samples == 0 || samples > 64 {
        return Err("samples must be between 1 and 64".to_string());
    }
    Ok(samples as u8)
}

fn parse_interval_ms(value: &str) -> Result<u16, String> {
    let interval = parse_u16(value)?;
    if interval > 1000 {
        return Err("interval-ms must be <= 1000".to_string());
    }
    Ok(interval)
}

fn open_raw_hid_with_retry() -> Result<HidDevice, String> {
    let mut last_error = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        match open_raw_hid() {
            Ok(device) => return Ok(device),
            Err(error) => {
                last_error = error;
                if attempt < MAX_ATTEMPTS {
                    sleep(Duration::from_millis(35 * attempt as u64));
                }
            }
        }
    }
    Err(last_error)
}

fn open_raw_hid() -> Result<HidDevice, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let device = api
        .device_list()
        .find(|device| {
            device.vendor_id() == VID
                && device.product_id() == PID
                && device.usage_page() == USAGE_PAGE
                && device.usage() == USAGE
        })
        .ok_or("No DOIO raw-HID endpoint found")?;
    device.open_device(&api).map_err(|error| error.to_string())
}

fn send_recv_with_retry(device: &HidDevice, data: &[u8]) -> Result<[u8; REPORT_LEN], String> {
    let mut last_error = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        match send_recv(device, data) {
            Ok(response) => return Ok(response),
            Err(error) => {
                last_error = error;
                if attempt < MAX_ATTEMPTS {
                    sleep(Duration::from_millis(25 * attempt as u64));
                }
            }
        }
    }
    Err(last_error)
}

fn send_recv(device: &HidDevice, data: &[u8]) -> Result<[u8; REPORT_LEN], String> {
    let mut report = [0_u8; REPORT_LEN + 1];
    report[1..(data.len() + 1)].copy_from_slice(data);
    device.write(&report).map_err(|error| error.to_string())?;

    let mut response = [0_u8; REPORT_LEN];
    let read = device
        .read_timeout(&mut response, 500)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("timed out waiting for raw-HID response".to_string());
    }
    Ok(response)
}

fn read_matrix_bytes(device: &HidDevice, offset: u8) -> Result<Vec<u8>, String> {
    let payload = [CMD_GET_KEYBOARD_VALUE, VALUE_SWITCH_MATRIX_STATE, offset];
    let response = send_recv_with_retry(device, &payload)?;
    if response[0] == 0xff {
        return Err("keyboard returned VIA_UNHANDLED for switch matrix state".to_string());
    }
    if response[0] != CMD_GET_KEYBOARD_VALUE || response[1] != VALUE_SWITCH_MATRIX_STATE {
        return Err(format!(
            "unexpected switch matrix response 0x{:02x} 0x{:02x}",
            response[0], response[1]
        ));
    }

    let payload_start = 3;
    let end = payload_start + matrix_byte_len(offset);
    Ok(response[payload_start..end].to_vec())
}

fn matrix_byte_len(offset: u8) -> usize {
    let bytes_per_row = (MATRIX_COLS + 7) / 8;
    let rows = MATRIX_ROWS.saturating_sub(offset as usize);
    rows * bytes_per_row
}

fn print_bytes(bytes: &[u8]) {
    println!(
        "{}",
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<Vec<_>>()
            .join(" ")
    );
}
