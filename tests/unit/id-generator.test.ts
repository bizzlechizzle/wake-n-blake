/**
 * ID Generator Tests
 * Tests for ID generation functionality
 */

import { describe, it, expect } from 'vitest';
import {
  generateBlake3Id,
  generateBlake3Ids,
  generateBlake3IdFrom,
  generateUuid,
  generateUuids,
  generateUuidV1,
  generateUuidV4,
  generateUuidV5,
  generateUuidV7,
  generateULID,
  generateULIDs,
  parseUlidTimestamp,
  id,
  UUID_NAMESPACES
} from '../../src/core/id-generator.js';

describe('ID Generator', () => {
  describe('generateBlake3Id', () => {
    it('should generate 16-character hex ID by default', () => {
      const result = generateBlake3Id();

      expect(result).toHaveLength(16);
      expect(result).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should generate 64-character hex ID when full option is set', () => {
      const result = generateBlake3Id({ full: true });

      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateBlake3Id());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateBlake3Ids', () => {
    it('should generate multiple unique IDs', () => {
      const ids = generateBlake3Ids(10);

      expect(ids).toHaveLength(10);
      const unique = new Set(ids);
      expect(unique.size).toBe(10);
    });

    it('should generate full IDs when specified', () => {
      const ids = generateBlake3Ids(5, { full: true });

      ids.forEach(id => {
        expect(id).toHaveLength(64);
      });
    });
  });

  describe('generateBlake3IdFrom', () => {
    it('should generate deterministic ID from string', () => {
      const id1 = generateBlake3IdFrom('test-input');
      const id2 = generateBlake3IdFrom('test-input');

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different inputs', () => {
      const id1 = generateBlake3IdFrom('input-a');
      const id2 = generateBlake3IdFrom('input-b');

      expect(id1).not.toBe(id2);
    });

    it('should generate ID from Buffer', () => {
      const buffer = Buffer.from('buffer-input');
      const result = generateBlake3IdFrom(buffer);

      expect(result).toHaveLength(16);
    });

    it('should generate full ID when specified', () => {
      const result = generateBlake3IdFrom('input', { full: true });

      expect(result).toHaveLength(64);
    });
  });

  describe('generateUuidV1', () => {
    it('should generate valid UUID v1', () => {
      const uuid = generateUuidV1();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUuidV1());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('generateUuidV4', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUuidV4();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUuidV4());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('generateUuidV5', () => {
    it('should generate deterministic UUID v5', () => {
      const uuid1 = generateUuidV5('test-name', 'dns');
      const uuid2 = generateUuidV5('test-name', 'dns');

      expect(uuid1).toBe(uuid2);
    });

    it('should generate valid UUID v5 format', () => {
      const uuid = generateUuidV5('test', 'url');

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should support different namespaces', () => {
      const dnsUuid = generateUuidV5('example.com', 'dns');
      const urlUuid = generateUuidV5('example.com', 'url');

      expect(dnsUuid).not.toBe(urlUuid);
    });
  });

  describe('generateUuidV7', () => {
    it('should generate valid UUID v7', () => {
      const uuid = generateUuidV7();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should be roughly sortable by time', async () => {
      const uuid1 = generateUuidV7();
      await new Promise(resolve => setTimeout(resolve, 10));
      const uuid2 = generateUuidV7();

      // UUIDs should be in order (string comparison works for time-ordered UUIDs)
      expect(uuid1 < uuid2).toBe(true);
    });
  });

  describe('generateUuid', () => {
    it('should default to v4', () => {
      const uuid = generateUuid();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should support numeric version 4 parameter', () => {
      const v4 = generateUuid(4);

      expect(v4).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
    });

    it('should support numeric version 7 parameter', () => {
      const v7 = generateUuid(7);

      expect(v7).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/i);
    });

    it('should support numeric version 1 parameter', () => {
      const v1 = generateUuid(1);

      expect(v1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-/i);
    });
  });

  describe('generateUuids', () => {
    it('should generate multiple UUIDs', () => {
      const uuids = generateUuids(10);

      expect(uuids).toHaveLength(10);
      uuids.forEach(uuid => {
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
      });
    });
  });

  describe('generateULID', () => {
    it('should generate valid ULID', () => {
      const ulid = generateULID();

      expect(ulid).toHaveLength(26);
      expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('should generate unique ULIDs', () => {
      const ulids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ulids.add(generateULID());
      }
      expect(ulids.size).toBe(100);
    });

    it('should support custom timestamp', () => {
      const timestamp = new Date('2024-01-01').getTime();
      const ulid = generateULID({ timestamp });

      expect(ulid).toHaveLength(26);
      // First 10 characters encode timestamp
      const parsed = parseUlidTimestamp(ulid);
      expect(parsed.getTime()).toBe(timestamp);
    });
  });

  describe('generateULIDs', () => {
    it('should generate multiple ULIDs', () => {
      const ulids = generateULIDs(10);

      expect(ulids).toHaveLength(10);
      ulids.forEach(ulid => {
        expect(ulid).toHaveLength(26);
      });
    });

    it('should support monotonic generation', () => {
      const ulids = generateULIDs(10, { monotonic: true });

      // Monotonic ULIDs should be strictly increasing
      for (let i = 1; i < ulids.length; i++) {
        expect(ulids[i] > ulids[i - 1]).toBe(true);
      }
    });
  });

  describe('parseUlidTimestamp', () => {
    it('should extract timestamp from ULID', () => {
      const now = Date.now();
      const ulid = generateULID({ timestamp: now });

      const extracted = parseUlidTimestamp(ulid);

      expect(extracted.getTime()).toBe(now);
    });

    it('should handle ULIDs from different times', () => {
      const time1 = new Date('2023-01-01').getTime();
      const time2 = new Date('2024-06-15').getTime();

      const ulid1 = generateULID({ timestamp: time1 });
      const ulid2 = generateULID({ timestamp: time2 });

      expect(parseUlidTimestamp(ulid1).getTime()).toBe(time1);
      expect(parseUlidTimestamp(ulid2).getTime()).toBe(time2);
    });
  });

  describe('id (shorthand)', () => {
    it('should generate BLAKE3 ID by default', () => {
      const result = id();

      expect(result).toHaveLength(16);
      expect(result).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should support full option', () => {
      const result = id({ full: true });

      expect(result).toHaveLength(64);
    });
  });

  describe('UUID_NAMESPACES', () => {
    it('should have standard namespaces', () => {
      expect(UUID_NAMESPACES.dns).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      expect(UUID_NAMESPACES.url).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8');
      expect(UUID_NAMESPACES.oid).toBe('6ba7b812-9dad-11d1-80b4-00c04fd430c8');
      expect(UUID_NAMESPACES.x500).toBe('6ba7b814-9dad-11d1-80b4-00c04fd430c8');
    });
  });
});
