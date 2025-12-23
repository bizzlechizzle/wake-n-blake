/**
 * USB Vendor Database
 *
 * Known USB Vendor IDs (VID) and Product IDs (PID) for cameras and media devices.
 * Used for camera identification when connecting via USB.
 *
 * Sources:
 * - https://usb-ids.gowdy.us/
 * - nightfoxfilms camera detection
 * - Manual verification
 */

// =============================================================================
// VENDOR IDS
// =============================================================================

/** USB Vendor ID -> Company Name */
export const USB_VENDORS: Record<number, string> = {
  // Camera manufacturers
  1193: 'Canon',           // 0x04a9
  1356: 'Sony',            // 0x054c
  1112: 'Panasonic',       // 0x0458 (Matsushita)
  1133: 'Nikon',           // 0x046d
  1265: 'JVC',             // 0x04f1 (JVC Kenwood Corporation)
  1227: 'Fujifilm',        // 0x04cb
  8711: 'Olympus',         // 0x2207
  1266: 'Pentax',          // 0x04f2 (Ricoh/Pentax)
  9817: 'Leica',           // 0x2659
  1003: 'Samsung',         // 0x03eb (for cameras)
  4328: 'Sigma',           // 0x10e8

  // Action cameras
  2996: 'GoPro',           // 0x0bb4
  10239: 'Insta360',       // 0x27ff
  11271: 'DJI Action',     // 0x2c07

  // Drones
  10007: 'DJI',            // 0x2717 (SZ DJI Technology)
  11270: 'DJI',            // 0x2c06 (Alternate)

  // Phones
  1452: 'Apple',           // 0x05ac
  6353: 'Google',          // 0x18d1
  1256: 'Samsung',         // 0x04e8
  8921: 'OnePlus',         // 0x22d9

  // Card readers
  1921: 'SanDisk',         // 0x0781
  2316: 'Lexar',           // 0x090c
  1058: 'Kingston',        // 0x0422
  4047: 'ProGrade',        // 0x0fcf
  2385: 'Transcend',       // 0x0951

  // Cinema cameras
  7086: 'RED',             // 0x1bae
  11046: 'Blackmagic',     // 0x2b26
  9987: 'ARRI',            // 0x2703

  // External recorders
  9191: 'Atomos',          // 0x23e7
};

// =============================================================================
// PRODUCT IDS (Selected important models)
// =============================================================================

/** Vendor:Product ID -> Device Name */
export const USB_DEVICES: Record<string, string> = {
  // Sony cameras
  '1356:2479': 'Sony Alpha (MTP)',
  '1356:2557': 'Sony FX3/FX6',
  '1356:2551': 'Sony A7S III',

  // Canon cameras
  '1193:12818': 'Canon EOS R5',
  '1193:12819': 'Canon EOS R6',
  '1193:12855': 'Canon EOS C70',

  // Panasonic
  '1112:58113': 'Panasonic GH5/GH6',
  '1112:58114': 'Panasonic S5/S1H',

  // GoPro
  '2996:512': 'GoPro HERO',
  '2996:513': 'GoPro HERO (MTP)',

  // DJI
  '10007:3840': 'DJI Mavic',
  '10007:3872': 'DJI Mini',
  '10007:3904': 'DJI Air',
  '10007:256': 'DJI Ronin',

  // JVC
  '1265:775': 'JVC Everio',
  '1265:776': 'JVC GY-HM',

  // Card readers
  '1921:21889': 'SanDisk Extreme Pro',
  '1921:1665': 'SanDisk ImageMate',
  '2316:1792': 'Lexar Professional',
};

// =============================================================================
// DEVICE CATEGORIES
// =============================================================================

export type DeviceCategory =
  | 'camera_cinema'
  | 'camera_professional'
  | 'camera_prosumer'
  | 'camera_consumer'
  | 'camera_action'
  | 'drone'
  | 'phone'
  | 'card_reader'
  | 'external_recorder'
  | 'unknown';

/** Vendor ID -> Default category */
export const VENDOR_CATEGORIES: Record<number, DeviceCategory> = {
  // Cinema cameras
  7086: 'camera_cinema',    // RED
  11046: 'camera_cinema',   // Blackmagic
  9987: 'camera_cinema',    // ARRI

  // Professional
  1356: 'camera_professional',  // Sony
  1193: 'camera_professional',  // Canon
  1112: 'camera_professional',  // Panasonic
  1133: 'camera_professional',  // Nikon

  // Prosumer
  1227: 'camera_prosumer',  // Fujifilm
  8711: 'camera_prosumer',  // Olympus
  1266: 'camera_prosumer',  // Pentax

  // Consumer
  1265: 'camera_consumer',  // JVC

  // Action
  2996: 'camera_action',    // GoPro
  10239: 'camera_action',   // Insta360

  // Drones
  10007: 'drone',           // DJI
  11270: 'drone',           // DJI alternate

  // Phones
  1452: 'phone',            // Apple
  6353: 'phone',            // Google

  // Card readers
  1921: 'card_reader',      // SanDisk
  2316: 'card_reader',      // Lexar
  1058: 'card_reader',      // Kingston

  // External recorders
  9191: 'external_recorder', // Atomos
};

// =============================================================================
// HELPERS
// =============================================================================

/** Get vendor name from VID */
export function getVendorName(vendorId: number): string | undefined {
  return USB_VENDORS[vendorId];
}

/** Get device name from VID:PID */
export function getDeviceName(vendorId: number, productId: number): string | undefined {
  const key = `${vendorId}:${productId}`;
  return USB_DEVICES[key];
}

/** Get device category from VID */
export function getDeviceCategory(vendorId: number): DeviceCategory {
  return VENDOR_CATEGORIES[vendorId] || 'unknown';
}

/** Check if vendor is a known camera manufacturer */
export function isCameraVendor(vendorId: number): boolean {
  const category = VENDOR_CATEGORIES[vendorId];
  return category !== undefined && category.startsWith('camera_');
}

/** Check if vendor is a known drone manufacturer */
export function isDroneVendor(vendorId: number): boolean {
  return VENDOR_CATEGORIES[vendorId] === 'drone';
}

/** Check if vendor is a card reader */
export function isCardReaderVendor(vendorId: number): boolean {
  return VENDOR_CATEGORIES[vendorId] === 'card_reader';
}

/** Parse hex ID string from system_profiler */
export function parseHexId(idString: string): number {
  if (typeof idString === 'number') return idString;
  if (typeof idString !== 'string') return 0;

  // Handle "0x04f1" or "0x04f1  (Company Name)" format
  const match = idString.match(/0x([0-9a-fA-F]+)/);
  return match ? parseInt(match[1], 16) : 0;
}

/** Format VID:PID as string */
export function formatVidPid(vendorId: number, productId: number): string {
  return `${vendorId.toString(16).padStart(4, '0')}:${productId.toString(16).padStart(4, '0')}`;
}
