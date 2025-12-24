/**
 * Calendar/Contact Metadata Wrapper
 *
 * Extracts metadata from calendar (ICS) and contact (VCF) files.
 * Uses Python vobject library for parsing.
 *
 * Install:
 *   pip install vobject
 *
 * Fallback: Pure Python icalendar library for ICS
 *   pip install icalendar
 *
 * @module services/metadata/wrappers/calendar
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Calendar event metadata
 */
export interface CalendarResult {
  /** File format */
  format: 'ics';
  /** Number of events */
  eventCount: number;
  /** Number of todos */
  todoCount: number;
  /** Number of journals */
  journalCount: number;
  /** Date range of events */
  dateRange?: {
    earliest: string;
    latest: string;
  };
  /** Calendar name/title */
  calendarName?: string;
  /** Calendar timezone */
  timezone?: string;
  /** Whether calendar has recurring events */
  hasRecurring: boolean;
  /** Whether calendar has alarms */
  hasAlarms: boolean;
  /** Producer/generator */
  prodId?: string;
  /** Unique event summaries (first 20) */
  eventSummaries?: string[];
}

/**
 * Contact metadata
 */
export interface ContactResult {
  /** File format */
  format: 'vcf';
  /** Number of contacts */
  contactCount: number;
  /** Whether any contact has photo */
  hasPhotos: boolean;
  /** Whether any contact has organization */
  hasOrganizations: boolean;
  /** Number of contacts with email */
  emailCount: number;
  /** Number of contacts with phone */
  phoneCount: number;
  /** Number of contacts with address */
  addressCount: number;
  /** vCard version (3.0, 4.0) */
  vcardVersion?: string;
  /** Contact names (first 20) */
  contactNames?: string[];
}

// Python script for ICS parsing
const ICS_SCRIPT = `
import sys
import json

# Try vobject first, then icalendar
try:
    import vobject
    USE_VOBJECT = True
except ImportError:
    USE_VOBJECT = False

try:
    from icalendar import Calendar
    USE_ICALENDAR = True
except ImportError:
    USE_ICALENDAR = False

def parse_vobject(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    result = {
        'eventCount': 0,
        'todoCount': 0,
        'journalCount': 0,
        'hasRecurring': False,
        'hasAlarms': False,
        'eventSummaries': []
    }

    dates = []

    for cal in vobject.readComponents(content):
        if hasattr(cal, 'prodid'):
            result['prodId'] = str(cal.prodid.value)

        if hasattr(cal, 'x_wr_calname'):
            result['calendarName'] = str(cal.x_wr_calname.value)
        elif hasattr(cal, 'name'):
            result['calendarName'] = str(cal.name.value) if hasattr(cal.name, 'value') else None

        if hasattr(cal, 'x_wr_timezone'):
            result['timezone'] = str(cal.x_wr_timezone.value)

        for component in cal.getChildren():
            name = component.name.upper()

            if name == 'VEVENT':
                result['eventCount'] += 1

                if hasattr(component, 'summary'):
                    summary = str(component.summary.value)
                    if len(result['eventSummaries']) < 20:
                        result['eventSummaries'].append(summary)

                if hasattr(component, 'dtstart'):
                    try:
                        dt = component.dtstart.value
                        if hasattr(dt, 'isoformat'):
                            dates.append(dt.isoformat())
                        else:
                            dates.append(str(dt))
                    except:
                        pass

                if hasattr(component, 'dtend'):
                    try:
                        dt = component.dtend.value
                        if hasattr(dt, 'isoformat'):
                            dates.append(dt.isoformat())
                        else:
                            dates.append(str(dt))
                    except:
                        pass

                if hasattr(component, 'rrule'):
                    result['hasRecurring'] = True

                if hasattr(component, 'valarm'):
                    result['hasAlarms'] = True

            elif name == 'VTODO':
                result['todoCount'] += 1

            elif name == 'VJOURNAL':
                result['journalCount'] += 1

    if dates:
        dates.sort()
        result['dateRange'] = {
            'earliest': dates[0],
            'latest': dates[-1]
        }

    return result

def parse_icalendar(filepath):
    with open(filepath, 'rb') as f:
        cal = Calendar.from_ical(f.read())

    result = {
        'eventCount': 0,
        'todoCount': 0,
        'journalCount': 0,
        'hasRecurring': False,
        'hasAlarms': False,
        'eventSummaries': []
    }

    dates = []

    if cal.get('prodid'):
        result['prodId'] = str(cal.get('prodid'))

    if cal.get('x-wr-calname'):
        result['calendarName'] = str(cal.get('x-wr-calname'))

    if cal.get('x-wr-timezone'):
        result['timezone'] = str(cal.get('x-wr-timezone'))

    for component in cal.walk():
        name = component.name.upper()

        if name == 'VEVENT':
            result['eventCount'] += 1

            summary = component.get('summary')
            if summary and len(result['eventSummaries']) < 20:
                result['eventSummaries'].append(str(summary))

            dtstart = component.get('dtstart')
            if dtstart:
                try:
                    dt = dtstart.dt
                    if hasattr(dt, 'isoformat'):
                        dates.append(dt.isoformat())
                except:
                    pass

            dtend = component.get('dtend')
            if dtend:
                try:
                    dt = dtend.dt
                    if hasattr(dt, 'isoformat'):
                        dates.append(dt.isoformat())
                except:
                    pass

            if component.get('rrule'):
                result['hasRecurring'] = True

        elif name == 'VALARM':
            result['hasAlarms'] = True

        elif name == 'VTODO':
            result['todoCount'] += 1

        elif name == 'VJOURNAL':
            result['journalCount'] += 1

    if dates:
        dates.sort()
        result['dateRange'] = {
            'earliest': dates[0],
            'latest': dates[-1]
        }

    return result

try:
    filepath = sys.argv[1]

    if USE_VOBJECT:
        result = parse_vobject(filepath)
        result['parser'] = 'vobject'
    elif USE_ICALENDAR:
        result = parse_icalendar(filepath)
        result['parser'] = 'icalendar'
    else:
        print(json.dumps({'error': 'No parser available'}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

// Python script for VCF parsing
const VCF_SCRIPT = `
import sys
import json

try:
    import vobject
    USE_VOBJECT = True
except ImportError:
    USE_VOBJECT = False

def parse_vcf(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    result = {
        'contactCount': 0,
        'hasPhotos': False,
        'hasOrganizations': False,
        'emailCount': 0,
        'phoneCount': 0,
        'addressCount': 0,
        'contactNames': []
    }

    version = None

    for card in vobject.readComponents(content):
        if card.name.upper() != 'VCARD':
            continue

        result['contactCount'] += 1

        # Get version
        if hasattr(card, 'version') and not version:
            version = str(card.version.value)

        # Get name
        if hasattr(card, 'fn'):
            name = str(card.fn.value)
            if len(result['contactNames']) < 20:
                result['contactNames'].append(name)
        elif hasattr(card, 'n'):
            try:
                n = card.n.value
                name_parts = [n.prefix, n.given, n.additional, n.family, n.suffix]
                name = ' '.join(p for p in name_parts if p).strip()
                if name and len(result['contactNames']) < 20:
                    result['contactNames'].append(name)
            except:
                pass

        # Check for photo
        if hasattr(card, 'photo'):
            result['hasPhotos'] = True

        # Check for organization
        if hasattr(card, 'org'):
            result['hasOrganizations'] = True

        # Count emails
        if hasattr(card, 'email'):
            emails = card.contents.get('email', [])
            if emails:
                result['emailCount'] += 1

        # Count phones
        if hasattr(card, 'tel'):
            tels = card.contents.get('tel', [])
            if tels:
                result['phoneCount'] += 1

        # Count addresses
        if hasattr(card, 'adr'):
            adrs = card.contents.get('adr', [])
            if adrs:
                result['addressCount'] += 1

    if version:
        result['vcardVersion'] = version

    return result

try:
    filepath = sys.argv[1]

    if not USE_VOBJECT:
        print(json.dumps({'error': 'vobject not available'}), file=sys.stderr)
        sys.exit(1)

    result = parse_vcf(filepath)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

let hasVobject: boolean | undefined;
let hasIcalendar: boolean | undefined;

/**
 * Check if vobject is available
 */
async function checkVobject(): Promise<boolean> {
  if (hasVobject !== undefined) return hasVobject;

  try {
    await execFileAsync('python3', ['-c', 'import vobject'], { timeout: 5000 });
    hasVobject = true;
  } catch {
    hasVobject = false;
  }
  return hasVobject;
}

/**
 * Check if icalendar is available
 */
async function checkIcalendar(): Promise<boolean> {
  if (hasIcalendar !== undefined) return hasIcalendar;

  try {
    await execFileAsync('python3', ['-c', 'from icalendar import Calendar'], { timeout: 5000 });
    hasIcalendar = true;
  } catch {
    hasIcalendar = false;
  }
  return hasIcalendar;
}

/**
 * Check if calendar extraction is available
 */
export async function isCalendarAvailable(): Promise<boolean> {
  return (await checkVobject()) || (await checkIcalendar());
}

/**
 * Check if contact extraction is available
 */
export async function isContactAvailable(): Promise<boolean> {
  return checkVobject();
}

/**
 * Extract metadata from ICS calendar file
 *
 * @param filePath - Path to ICS file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extractCalendar(filePath: string): Promise<CalendarResult | undefined> {
  if (!(await isCalendarAvailable())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', ICS_SCRIPT, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      format: 'ics',
      eventCount: result.eventCount || 0,
      todoCount: result.todoCount || 0,
      journalCount: result.journalCount || 0,
      dateRange: result.dateRange,
      calendarName: result.calendarName,
      timezone: result.timezone,
      hasRecurring: result.hasRecurring || false,
      hasAlarms: result.hasAlarms || false,
      prodId: result.prodId,
      eventSummaries: result.eventSummaries?.length > 0 ? result.eventSummaries : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract metadata from VCF contact file
 *
 * @param filePath - Path to VCF file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extractContact(filePath: string): Promise<ContactResult | undefined> {
  if (!(await isContactAvailable())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', VCF_SCRIPT, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      format: 'vcf',
      contactCount: result.contactCount || 0,
      hasPhotos: result.hasPhotos || false,
      hasOrganizations: result.hasOrganizations || false,
      emailCount: result.emailCount || 0,
      phoneCount: result.phoneCount || 0,
      addressCount: result.addressCount || 0,
      vcardVersion: result.vcardVersion,
      contactNames: result.contactNames?.length > 0 ? result.contactNames : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract metadata from calendar or contact file
 *
 * @param filePath - Path to ICS or VCF file
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<CalendarResult | ContactResult | undefined> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ics':
    case '.vcs':
      return extractCalendar(filePath);

    case '.vcf':
    case '.vcard':
      return extractContact(filePath);

    default: {
      // Try to detect by content - attempt calendar first
      const calResult = await extractCalendar(filePath);
      if (calResult && calResult.eventCount > 0) return calResult;

      return extractContact(filePath);
    }
  }
}

/**
 * Convert calendar result to XMP rawMetadata format with Calendar_ prefix
 */
export function calendarToRawMetadata(result: CalendarResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Calendar_Format': 'ICS',
    'Calendar_EventCount': result.eventCount,
    'Calendar_TodoCount': result.todoCount,
    'Calendar_JournalCount': result.journalCount,
    'Calendar_TotalItems': result.eventCount + result.todoCount + result.journalCount,
    'Calendar_HasRecurring': result.hasRecurring,
    'Calendar_HasAlarms': result.hasAlarms,
  };

  if (result.calendarName) {
    metadata['Calendar_Name'] = result.calendarName;
  }

  if (result.timezone) {
    metadata['Calendar_Timezone'] = result.timezone;
  }

  if (result.dateRange) {
    metadata['Calendar_DateStart'] = result.dateRange.earliest;
    metadata['Calendar_DateEnd'] = result.dateRange.latest;
  }

  if (result.prodId) {
    metadata['Calendar_Producer'] = result.prodId;
  }

  if (result.eventSummaries && result.eventSummaries.length > 0) {
    metadata['Calendar_EventSummaries'] = result.eventSummaries.join('; ');
  }

  return metadata;
}

/**
 * Convert contact result to XMP rawMetadata format with Contact_ prefix
 */
export function contactToRawMetadata(result: ContactResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Contact_Format': 'VCF',
    'Contact_Count': result.contactCount,
    'Contact_HasPhotos': result.hasPhotos,
    'Contact_HasOrganizations': result.hasOrganizations,
  };

  if (result.vcardVersion) {
    metadata['Contact_VCardVersion'] = result.vcardVersion;
  }

  if (result.emailCount > 0) {
    metadata['Contact_WithEmail'] = result.emailCount;
  }

  if (result.phoneCount > 0) {
    metadata['Contact_WithPhone'] = result.phoneCount;
  }

  if (result.addressCount > 0) {
    metadata['Contact_WithAddress'] = result.addressCount;
  }

  if (result.contactNames && result.contactNames.length > 0) {
    metadata['Contact_Names'] = result.contactNames.join('; ');
  }

  // Completeness indicator
  const totalFields = result.emailCount + result.phoneCount + result.addressCount;
  const avgFieldsPerContact = result.contactCount > 0 ? totalFields / result.contactCount : 0;
  metadata['Contact_AvgFieldsPerContact'] = Math.round(avgFieldsPerContact * 10) / 10;

  return metadata;
}

/**
 * Convert result to XMP rawMetadata format (auto-detect type)
 */
export function toRawMetadata(result: CalendarResult | ContactResult): Record<string, unknown> {
  if (result.format === 'ics') {
    return calendarToRawMetadata(result as CalendarResult);
  } else {
    return contactToRawMetadata(result as ContactResult);
  }
}

/**
 * Get available libraries for calendar/contact extraction
 */
export async function getAvailableLibraries(): Promise<string[]> {
  const libs: string[] = [];

  if (await checkVobject()) {
    libs.push('vobject');
  }

  if (await checkIcalendar()) {
    libs.push('icalendar');
  }

  return libs;
}

/**
 * Get vobject version information
 */
export async function getVersion(): Promise<string | undefined> {
  const libs = await getAvailableLibraries();

  if (libs.length === 0) return undefined;

  try {
    if (libs.includes('vobject')) {
      const { stdout } = await execFileAsync('python3', ['-c', 'import vobject; print(vobject.VERSION)'], {
        timeout: 5000
      });
      return `vobject ${stdout.trim()}`;
    }

    if (libs.includes('icalendar')) {
      const { stdout } = await execFileAsync('python3', ['-c', 'import icalendar; print(icalendar.__version__)'], {
        timeout: 5000
      });
      return `icalendar ${stdout.trim()}`;
    }
  } catch {
    return libs.join(', ') + ' (version unknown)';
  }

  return undefined;
}
