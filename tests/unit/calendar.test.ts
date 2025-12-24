/**
 * Calendar/Contact Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { calendar } from '../../src/services/metadata/index.js';

function checkPythonLibAvailable(lib: string): boolean {
  try {
    execSync(`python3 -c "import ${lib}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasVobject = checkPythonLibAvailable('vobject');
const hasIcalendar = checkPythonLibAvailable('icalendar');
const hasAnyCalendarLib = hasVobject || hasIcalendar;

describe('Calendar/Contact Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-calendar-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isCalendarAvailable', () => {
    it('should correctly detect tool availability', async () => {
      const available = await calendar.isCalendarAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasAnyCalendarLib);
    });
  });

  describe('isContactAvailable', () => {
    it('should correctly detect vobject availability', async () => {
      const available = await calendar.isContactAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(hasVobject);
    });
  });

  describe('extractCalendar', () => {
    it.skipIf(!hasAnyCalendarLib)('should parse ICS file', async () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
X-WR-CALNAME:Test Calendar
BEGIN:VEVENT
DTSTART:20240101T100000Z
DTEND:20240101T110000Z
SUMMARY:Test Event 1
END:VEVENT
BEGIN:VEVENT
DTSTART:20240102T140000Z
DTEND:20240102T150000Z
SUMMARY:Test Event 2
END:VEVENT
END:VCALENDAR`;
      const icsFile = path.join(tempDir, 'calendar.ics');
      await fs.writeFile(icsFile, icsContent);

      const result = await calendar.extractCalendar(icsFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('ics');
      expect(result!.eventCount).toBe(2);
      expect(result!.calendarName).toBe('Test Calendar');
    });

    it('should return undefined for non-existent files', async () => {
      const result = await calendar.extractCalendar('/nonexistent/file.ics');
      expect(result).toBeUndefined();
    });
  });

  describe('extractContact', () => {
    it.skipIf(!hasVobject)('should parse VCF file', async () => {
      const vcfContent = `BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
EMAIL:john@example.com
TEL:+1234567890
ORG:Test Company
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
N:Smith;Jane;;;
EMAIL:jane@example.com
END:VCARD`;
      const vcfFile = path.join(tempDir, 'contacts.vcf');
      await fs.writeFile(vcfFile, vcfContent);

      const result = await calendar.extractContact(vcfFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('vcf');
      expect(result!.contactCount).toBe(2);
      expect(result!.emailCount).toBeGreaterThanOrEqual(1);
      expect(result!.hasOrganizations).toBe(true);
    });

    it('should return undefined for non-existent files', async () => {
      const result = await calendar.extractContact('/nonexistent/file.vcf');
      expect(result).toBeUndefined();
    });
  });

  describe('calendarToRawMetadata', () => {
    it('should convert calendar result to prefixed key-value pairs', () => {
      const result: calendar.CalendarResult = {
        format: 'ics',
        eventCount: 10,
        todoCount: 5,
        journalCount: 2,
        calendarName: 'Work Calendar',
        timezone: 'America/New_York',
        hasRecurring: true,
        hasAlarms: true,
        dateRange: {
          earliest: '2024-01-01T00:00:00Z',
          latest: '2024-12-31T23:59:59Z',
        },
        prodId: '-//Google Inc//Google Calendar//EN',
        eventSummaries: ['Meeting', 'Conference', 'Review'],
      };

      const metadata = calendar.calendarToRawMetadata(result);

      expect(metadata['Calendar_Format']).toBe('ICS');
      expect(metadata['Calendar_EventCount']).toBe(10);
      expect(metadata['Calendar_TodoCount']).toBe(5);
      expect(metadata['Calendar_JournalCount']).toBe(2);
      expect(metadata['Calendar_TotalItems']).toBe(17);
      expect(metadata['Calendar_Name']).toBe('Work Calendar');
      expect(metadata['Calendar_Timezone']).toBe('America/New_York');
      expect(metadata['Calendar_HasRecurring']).toBe(true);
      expect(metadata['Calendar_HasAlarms']).toBe(true);
      expect(metadata['Calendar_DateStart']).toBe('2024-01-01T00:00:00Z');
      expect(metadata['Calendar_DateEnd']).toBe('2024-12-31T23:59:59Z');
      expect(metadata['Calendar_Producer']).toBe('-//Google Inc//Google Calendar//EN');
      expect(metadata['Calendar_EventSummaries']).toBe('Meeting; Conference; Review');
    });
  });

  describe('contactToRawMetadata', () => {
    it('should convert contact result to prefixed key-value pairs', () => {
      const result: calendar.ContactResult = {
        format: 'vcf',
        contactCount: 50,
        hasPhotos: true,
        hasOrganizations: true,
        emailCount: 45,
        phoneCount: 40,
        addressCount: 30,
        vcardVersion: '3.0',
        contactNames: ['John Doe', 'Jane Smith', 'Bob Wilson'],
      };

      const metadata = calendar.contactToRawMetadata(result);

      expect(metadata['Contact_Format']).toBe('VCF');
      expect(metadata['Contact_Count']).toBe(50);
      expect(metadata['Contact_HasPhotos']).toBe(true);
      expect(metadata['Contact_HasOrganizations']).toBe(true);
      expect(metadata['Contact_WithEmail']).toBe(45);
      expect(metadata['Contact_WithPhone']).toBe(40);
      expect(metadata['Contact_WithAddress']).toBe(30);
      expect(metadata['Contact_VCardVersion']).toBe('3.0');
      expect(metadata['Contact_Names']).toBe('John Doe; Jane Smith; Bob Wilson');
    });

    it('should calculate average fields per contact', () => {
      const result: calendar.ContactResult = {
        format: 'vcf',
        contactCount: 10,
        hasPhotos: false,
        hasOrganizations: false,
        emailCount: 10,
        phoneCount: 8,
        addressCount: 5,
      };

      const metadata = calendar.contactToRawMetadata(result);

      // (10 + 8 + 5) / 10 = 2.3
      expect(metadata['Contact_AvgFieldsPerContact']).toBeCloseTo(2.3, 1);
    });
  });

  describe('toRawMetadata (auto-detect)', () => {
    it('should use calendar format for ICS results', () => {
      const result: calendar.CalendarResult = {
        format: 'ics',
        eventCount: 5,
        todoCount: 0,
        journalCount: 0,
        hasRecurring: false,
        hasAlarms: false,
      };

      const metadata = calendar.toRawMetadata(result);

      expect(metadata['Calendar_Format']).toBe('ICS');
      expect(metadata['Calendar_EventCount']).toBe(5);
    });

    it('should use contact format for VCF results', () => {
      const result: calendar.ContactResult = {
        format: 'vcf',
        contactCount: 10,
        hasPhotos: false,
        hasOrganizations: false,
        emailCount: 5,
        phoneCount: 5,
        addressCount: 3,
      };

      const metadata = calendar.toRawMetadata(result);

      expect(metadata['Contact_Format']).toBe('VCF');
      expect(metadata['Contact_Count']).toBe(10);
    });
  });
});
