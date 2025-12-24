/**
 * Email Metadata Wrapper
 *
 * Extracts metadata from email files (EML, MSG formats).
 * Uses Python libraries for robust parsing.
 *
 * Install:
 *   For .eml files: pip install email-validator (built-in email module)
 *   For .msg files: pip install extract-msg
 *
 * @module services/metadata/wrappers/email
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Email metadata result
 */
export interface EmailResult {
  /** Email format */
  format: 'eml' | 'msg';
  /** Email subject */
  subject?: string;
  /** From address */
  from?: string;
  /** To addresses */
  to?: string[];
  /** CC addresses */
  cc?: string[];
  /** BCC addresses (if available) */
  bcc?: string[];
  /** Email date */
  date?: string;
  /** Message ID */
  messageId?: string;
  /** In-Reply-To header */
  inReplyTo?: string;
  /** Whether email has attachments */
  hasAttachments: boolean;
  /** Number of attachments */
  attachmentCount: number;
  /** Attachment filenames */
  attachmentNames?: string[];
  /** Total size of attachments in bytes */
  attachmentTotalSize?: number;
  /** Whether email is HTML */
  isHtml: boolean;
  /** Plain text body (truncated) */
  textPreview?: string;
  /** X-Mailer or User-Agent */
  mailer?: string;
  /** Priority level */
  priority?: string;
}

// Python script for EML parsing
const EML_SCRIPT = `
import sys
import json
import email
from email import policy
from email.utils import parsedate_to_datetime

def get_addresses(msg, header):
    addrs = msg.get_all(header, [])
    result = []
    for addr in addrs:
        if isinstance(addr, str):
            result.append(addr)
        else:
            result.extend(addr)
    return [a.strip() for a in result if a.strip()]

def extract_attachments(msg):
    attachments = []
    total_size = 0
    for part in msg.walk():
        content_disposition = part.get("Content-Disposition", "")
        if "attachment" in content_disposition or "inline" in content_disposition:
            filename = part.get_filename()
            if filename:
                attachments.append(filename)
                payload = part.get_payload(decode=True)
                if payload:
                    total_size += len(payload)
    return attachments, total_size

try:
    with open(sys.argv[1], 'rb') as f:
        msg = email.message_from_binary_file(f, policy=policy.default)

    subject = msg.get('subject', '')
    from_addr = msg.get('from', '')
    to_addrs = get_addresses(msg, 'to')
    cc_addrs = get_addresses(msg, 'cc')
    bcc_addrs = get_addresses(msg, 'bcc')
    date = msg.get('date', '')
    message_id = msg.get('message-id', '')
    in_reply_to = msg.get('in-reply-to', '')
    mailer = msg.get('x-mailer') or msg.get('user-agent', '')
    priority = msg.get('x-priority') or msg.get('importance', '')

    attachments, attachment_size = extract_attachments(msg)

    # Get body preview
    body = msg.get_body(preferencelist=('plain', 'html'))
    text_preview = ''
    is_html = False
    if body:
        content = body.get_content()
        if isinstance(content, str):
            is_html = body.get_content_type() == 'text/html'
            # Strip HTML if needed (basic)
            if is_html:
                import re
                text_preview = re.sub(r'<[^>]+>', '', content)[:500]
            else:
                text_preview = content[:500]

    result = {
        'subject': subject,
        'from': from_addr,
        'to': to_addrs if to_addrs else None,
        'cc': cc_addrs if cc_addrs else None,
        'bcc': bcc_addrs if bcc_addrs else None,
        'date': date,
        'messageId': message_id,
        'inReplyTo': in_reply_to if in_reply_to else None,
        'hasAttachments': len(attachments) > 0,
        'attachmentCount': len(attachments),
        'attachmentNames': attachments if attachments else None,
        'attachmentTotalSize': attachment_size if attachment_size > 0 else None,
        'isHtml': is_html,
        'textPreview': text_preview.strip() if text_preview.strip() else None,
        'mailer': mailer if mailer else None,
        'priority': priority if priority else None
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

// Python script for MSG parsing
const MSG_SCRIPT = `
import sys
import json
import extract_msg

try:
    msg = extract_msg.Message(sys.argv[1])

    # Get attachments
    attachments = []
    attachment_size = 0
    for att in msg.attachments:
        if hasattr(att, 'longFilename') and att.longFilename:
            attachments.append(att.longFilename)
        elif hasattr(att, 'shortFilename') and att.shortFilename:
            attachments.append(att.shortFilename)
        if hasattr(att, 'data') and att.data:
            attachment_size += len(att.data)

    # Get text preview
    text_preview = ''
    is_html = False
    if msg.htmlBody:
        is_html = True
        import re
        text_preview = re.sub(r'<[^>]+>', '', msg.htmlBody[:1000])[:500]
    elif msg.body:
        text_preview = msg.body[:500]

    result = {
        'subject': msg.subject,
        'from': msg.sender,
        'to': [msg.to] if msg.to else None,
        'cc': [msg.cc] if msg.cc else None,
        'date': msg.date.isoformat() if msg.date else None,
        'messageId': msg.messageId if hasattr(msg, 'messageId') else None,
        'hasAttachments': len(attachments) > 0,
        'attachmentCount': len(attachments),
        'attachmentNames': attachments if attachments else None,
        'attachmentTotalSize': attachment_size if attachment_size > 0 else None,
        'isHtml': is_html,
        'textPreview': text_preview.strip() if text_preview.strip() else None
    }
    print(json.dumps(result))
    msg.close()
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
`;

let hasExtractMsg: boolean | undefined;

/**
 * Check if extract-msg is available (for .msg files)
 */
async function checkExtractMsg(): Promise<boolean> {
  if (hasExtractMsg !== undefined) return hasExtractMsg;
  try {
    await execFileAsync('python3', ['-c', 'import extract_msg'], { timeout: 5000 });
    hasExtractMsg = true;
  } catch {
    hasExtractMsg = false;
  }
  return hasExtractMsg;
}

/**
 * Check if email extraction is available
 * EML files always work (built-in Python email module)
 * MSG files require extract-msg
 */
export async function isEmailAvailable(format?: string): Promise<boolean> {
  if (!format || format.toLowerCase() === 'eml') {
    return true; // Built-in Python email module
  }
  if (format.toLowerCase() === 'msg') {
    return checkExtractMsg();
  }
  return false;
}

/**
 * Extract metadata from EML file
 */
async function extractEml(filePath: string): Promise<EmailResult | undefined> {
  try {
    const { stdout } = await execFileAsync('python3', ['-c', EML_SCRIPT, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      format: 'eml',
      subject: result.subject || undefined,
      from: result.from || undefined,
      to: result.to,
      cc: result.cc,
      bcc: result.bcc,
      date: result.date || undefined,
      messageId: result.messageId || undefined,
      inReplyTo: result.inReplyTo,
      hasAttachments: result.hasAttachments,
      attachmentCount: result.attachmentCount,
      attachmentNames: result.attachmentNames,
      attachmentTotalSize: result.attachmentTotalSize,
      isHtml: result.isHtml,
      textPreview: result.textPreview,
      mailer: result.mailer,
      priority: result.priority,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract metadata from MSG file
 */
async function extractMsg(filePath: string): Promise<EmailResult | undefined> {
  if (!(await checkExtractMsg())) return undefined;

  try {
    const { stdout } = await execFileAsync('python3', ['-c', MSG_SCRIPT, filePath], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(stdout);
    if (result.error) return undefined;

    return {
      format: 'msg',
      subject: result.subject || undefined,
      from: result.from || undefined,
      to: result.to,
      cc: result.cc,
      date: result.date || undefined,
      messageId: result.messageId || undefined,
      hasAttachments: result.hasAttachments,
      attachmentCount: result.attachmentCount,
      attachmentNames: result.attachmentNames,
      attachmentTotalSize: result.attachmentTotalSize,
      isHtml: result.isHtml,
      textPreview: result.textPreview,
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract metadata from an email file
 *
 * @param filePath - Path to email file (.eml or .msg)
 * @returns Extraction result or undefined if extraction failed
 */
export async function extract(filePath: string): Promise<EmailResult | undefined> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.eml':
      return extractEml(filePath);
    case '.msg':
      return extractMsg(filePath);
    default:
      // Try EML by default
      return extractEml(filePath);
  }
}

/**
 * Convert result to XMP rawMetadata format with Email_ prefix
 */
export function toRawMetadata(result: EmailResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    'Email_Format': result.format.toUpperCase(),
    'Email_HasAttachments': result.hasAttachments,
    'Email_AttachmentCount': result.attachmentCount,
    'Email_IsHTML': result.isHtml,
  };

  if (result.subject) {
    metadata['Email_Subject'] = result.subject;
  }

  if (result.from) {
    metadata['Email_From'] = result.from;
  }

  if (result.to && result.to.length > 0) {
    metadata['Email_To'] = result.to.join('; ');
    metadata['Email_RecipientCount'] = result.to.length;
  }

  if (result.cc && result.cc.length > 0) {
    metadata['Email_CC'] = result.cc.join('; ');
  }

  if (result.bcc && result.bcc.length > 0) {
    metadata['Email_BCC'] = result.bcc.join('; ');
  }

  if (result.date) {
    metadata['Email_Date'] = result.date;
  }

  if (result.messageId) {
    metadata['Email_MessageID'] = result.messageId;
  }

  if (result.inReplyTo) {
    metadata['Email_InReplyTo'] = result.inReplyTo;
  }

  if (result.attachmentNames && result.attachmentNames.length > 0) {
    metadata['Email_Attachments'] = result.attachmentNames.join('; ');
  }

  if (result.attachmentTotalSize) {
    metadata['Email_AttachmentSize'] = result.attachmentTotalSize;
  }

  if (result.textPreview) {
    metadata['Email_Preview'] = result.textPreview;
  }

  if (result.mailer) {
    metadata['Email_Mailer'] = result.mailer;
  }

  if (result.priority) {
    metadata['Email_Priority'] = result.priority;
  }

  return metadata;
}

/**
 * Get available libraries for email extraction
 */
export async function getAvailableLibraries(): Promise<string[]> {
  const libs = ['email (built-in)'];  // Python email module is always available

  if (await checkExtractMsg()) {
    libs.push('extract-msg');
  }

  return libs;
}
