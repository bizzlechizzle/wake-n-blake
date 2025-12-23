/**
 * wnb device command
 * Source device detection and listing
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { formatError } from '../output.js';
import {
  detectSourceDevice,
  getRemovableVolumes,
  getDeviceChain,
  getSourceType,
  formatDeviceInfo,
  createDeviceFingerprint,
} from '../../services/device/index.js';
import type { DeviceChain } from '../../services/device/types.js';

export const deviceCommand = new Command('device')
  .description('Source device detection and listing');

/**
 * List subcommand - list all removable volumes
 */
const listCmd = new Command('list')
  .alias('ls')
  .description('List all removable/external volumes')
  .option('-a, --all', 'Include internal volumes')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .action(async (options) => {
    try {
      const volumes = await getRemovableVolumes();

      if (options.output === 'json') {
        const results = await Promise.all(
          volumes.map(async (v) => {
            const chain = await getDeviceChain(v.mountPoint);
            return {
              mountPoint: v.mountPoint,
              volumeName: v.volumeName,
              volumeUUID: v.volumeUUID,
              device: v.device,
              filesystem: v.filesystemType,
              totalSize: v.totalSize,
              freeSpace: v.freeSpace,
              isRemovable: v.isRemovable,
              isExternal: v.isExternal,
              sourceType: chain ? getSourceType(chain) : 'unknown',
              deviceInfo: chain ? chainToInfo(chain) : undefined,
            };
          })
        );
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (volumes.length === 0) {
          console.log('No removable volumes detected');
          return;
        }

        console.log('Removable Volumes');
        console.log('=================');
        console.log();

        for (const vol of volumes) {
          const chain = await getDeviceChain(vol.mountPoint);
          const sourceType = chain ? getSourceType(chain) : 'unknown';

          console.log(`${vol.volumeName} (${vol.mountPoint})`);
          console.log(`├── Device:     ${vol.device}`);
          console.log(`├── Filesystem: ${vol.filesystemType}`);
          console.log(`├── Size:       ${formatBytes(vol.totalSize)} (${formatBytes(vol.freeSpace)} free)`);
          console.log(`├── Type:       ${sourceType}`);

          if (chain) {
            if (chain.usb) {
              console.log(`├── USB VID:PID: ${chain.usb.vendorId}:${chain.usb.productId}`);
              if (chain.usb.deviceName) {
                console.log(`├── USB Device: ${chain.usb.deviceName}`);
              }
              if (chain.usb.serial) {
                console.log(`├── USB Serial: ${chain.usb.serial}`);
              }
            }
            if (chain.cardReader) {
              console.log(`├── Card Reader: ${chain.cardReader.vendor} ${chain.cardReader.model}`);
            }
            if (chain.media?.serial) {
              console.log(`├── Media Serial: ${chain.media.serial}`);
            }

            console.log(`└── Fingerprint: ${createDeviceFingerprint(chainToDevice(chain))}`);
          } else {
            console.log(`└── (Device info not available)`);
          }
          console.log();
        }
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Detect subcommand - detect device for a specific path
 */
const detectCmd = new Command('detect')
  .description('Detect source device for a file or directory')
  .argument('<path>', 'File or directory path')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .action(async (targetPath: string, options) => {
    try {
      const absPath = path.resolve(targetPath);
      const result = await detectSourceDevice(absPath);

      if (options.output === 'json') {
        console.log(JSON.stringify({
          path: absPath,
          found: result.found,
          device: result.device,
          sourceType: result.chain ? getSourceType(result.chain) : undefined,
          fingerprint: result.device ? createDeviceFingerprint(result.device) : undefined,
          chain: result.chain,
          errors: result.errors,
          warnings: result.warnings,
        }, null, 2));
      } else {
        console.log(`Path: ${absPath}`);
        console.log();

        if (!result.found) {
          console.log('Device detection: NOT FOUND');
          if (result.errors.length > 0) {
            for (const err of result.errors) {
              console.error(formatError(err));
            }
          }
          return;
        }

        const sourceType = result.chain ? getSourceType(result.chain) : 'unknown';
        console.log(`Source Type: ${sourceType}`);
        console.log();

        if (result.device) {
          console.log(formatDeviceInfo(result.device));
          console.log();
          console.log(`Fingerprint: ${createDeviceFingerprint(result.device)}`);
        }

        if (result.warnings.length > 0) {
          console.log();
          console.log('Warnings:');
          for (const warn of result.warnings) {
            console.log(`  - ${warn}`);
          }
        }
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

/**
 * Info subcommand - detailed device info for a volume
 */
const infoCmd = new Command('info')
  .description('Show detailed device info for a volume')
  .argument('<volume>', 'Volume mount point')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .action(async (volumePath: string, options) => {
    try {
      const absPath = path.resolve(volumePath);
      const chain = await getDeviceChain(absPath);

      if (!chain) {
        console.error(formatError(`Could not get device info for: ${absPath}`));
        process.exit(1);
      }

      if (options.output === 'json') {
        console.log(JSON.stringify({
          volume: chain.volume,
          usb: chain.usb,
          cardReader: chain.cardReader,
          media: chain.media,
          sourceType: getSourceType(chain),
          isMemoryCard: chain.isMemoryCard,
          isCameraDirect: chain.isCameraDirect,
          isPhoneDirect: chain.isPhoneDirect,
          connectionType: chain.connectionType,
          fingerprint: createDeviceFingerprint(chainToDevice(chain)),
        }, null, 2));
      } else {
        console.log('Volume Information');
        console.log('==================');
        console.log(`Mount Point:  ${chain.volume.mountPoint}`);
        console.log(`Volume Name:  ${chain.volume.volumeName}`);
        if (chain.volume.volumeUUID) {
          console.log(`Volume UUID:  ${chain.volume.volumeUUID}`);
        }
        console.log(`Device:       ${chain.volume.device}`);
        console.log(`Filesystem:   ${chain.volume.filesystemType}`);
        console.log(`Size:         ${formatBytes(chain.volume.totalSize)}`);
        console.log(`Free:         ${formatBytes(chain.volume.freeSpace)}`);
        console.log(`Removable:    ${chain.volume.isRemovable ? 'Yes' : 'No'}`);
        console.log(`External:     ${chain.volume.isExternal ? 'Yes' : 'No'}`);
        console.log();

        if (chain.usb) {
          console.log('USB Device');
          console.log('----------');
          console.log(`Name:         ${chain.usb.deviceName}`);
          console.log(`VID:PID:      ${chain.usb.vendorId}:${chain.usb.productId}`);
          if (chain.usb.manufacturer) {
            console.log(`Manufacturer: ${chain.usb.manufacturer}`);
          }
          if (chain.usb.serial) {
            console.log(`Serial:       ${chain.usb.serial}`);
          }
          if (chain.usb.busLocation) {
            console.log(`Bus Location: ${chain.usb.busLocation}`);
          }
          console.log();
        }

        if (chain.cardReader) {
          console.log('Card Reader');
          console.log('-----------');
          console.log(`Vendor:       ${chain.cardReader.vendor}`);
          console.log(`Model:        ${chain.cardReader.model}`);
          if (chain.cardReader.serial) {
            console.log(`Serial:       ${chain.cardReader.serial}`);
          }
          console.log();
        }

        if (chain.media) {
          console.log('Physical Media');
          console.log('--------------');
          console.log(`Type:         ${chain.media.type.toUpperCase()}`);
          if (chain.media.manufacturer) {
            console.log(`Manufacturer: ${chain.media.manufacturer}`);
          }
          if (chain.media.serial) {
            console.log(`Serial:       ${chain.media.serial}`);
          }
          console.log(`Capacity:     ${formatBytes(chain.media.capacity)}`);
          console.log();
        }

        console.log('Classification');
        console.log('--------------');
        console.log(`Source Type:    ${getSourceType(chain)}`);
        console.log(`Memory Card:    ${chain.isMemoryCard ? 'Yes' : 'No'}`);
        console.log(`Camera Direct:  ${chain.isCameraDirect ? 'Yes' : 'No'}`);
        console.log(`Phone Direct:   ${chain.isPhoneDirect ? 'Yes' : 'No'}`);
        if (chain.connectionType) {
          console.log(`Connection:     ${chain.connectionType}`);
        }
        console.log();

        console.log(`Fingerprint: ${createDeviceFingerprint(chainToDevice(chain))}`);
      }
    } catch (err) {
      console.error(formatError(String(err)));
      process.exit(1);
    }
  });

// Add subcommands
deviceCommand.addCommand(listCmd);
deviceCommand.addCommand(detectCmd);
deviceCommand.addCommand(infoCmd);

// Default action - list volumes
deviceCommand.action(() => {
  listCmd.parseAsync(process.argv.slice(2));
});

/**
 * Convert DeviceChain to ImportSourceDevice
 */
function chainToDevice(chain: DeviceChain) {
  return {
    usb: chain.usb ? {
      vendorId: chain.usb.vendorId,
      productId: chain.usb.productId,
      serial: chain.usb.serial,
      devicePath: chain.usb.devicePath,
      deviceName: chain.usb.deviceName,
      busLocation: chain.usb.busLocation,
    } : undefined,
    cardReader: chain.cardReader ? {
      vendor: chain.cardReader.vendor,
      model: chain.cardReader.model,
      serial: chain.cardReader.serial,
      port: chain.cardReader.port,
    } : undefined,
    media: chain.media ? {
      type: chain.media.type,
      serial: chain.media.serial,
      manufacturer: chain.media.manufacturer,
      capacity: chain.media.capacity,
      firmware: chain.media.firmware,
    } : undefined,
    tetheredConnection: chain.isCameraDirect ? 'usb' as const : undefined,
  };
}

/**
 * Convert chain to simplified info object
 */
function chainToInfo(chain: DeviceChain) {
  return {
    usb: chain.usb ? {
      vendorId: chain.usb.vendorId,
      productId: chain.usb.productId,
      name: chain.usb.deviceName,
      serial: chain.usb.serial,
    } : undefined,
    cardReader: chain.cardReader ? {
      vendor: chain.cardReader.vendor,
      model: chain.cardReader.model,
    } : undefined,
    media: chain.media ? {
      type: chain.media.type,
      serial: chain.media.serial,
    } : undefined,
    isMemoryCard: chain.isMemoryCard,
    isCameraDirect: chain.isCameraDirect,
    isPhoneDirect: chain.isPhoneDirect,
  };
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}
