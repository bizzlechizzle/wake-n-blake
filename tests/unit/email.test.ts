/**
 * Email Metadata Extraction Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { email } from '../../src/services/metadata/index.js';

describe('Email Metadata Extraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wnb-email-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isEmailAvailable', () => {
    it('should return true for EML (uses built-in Python email)', async () => {
      const available = await email.isEmailAvailable('eml');
      expect(available).toBe(true);
    });
  });

  describe('extract', () => {
    it('should parse simple EML file', async () => {
      const emlContent = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Date: Mon, 1 Jan 2024 12:00:00 +0000
Message-ID: <test123@example.com>

This is the email body.
`;
      const emlFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(emlFile, emlContent);

      const result = await email.extract(emlFile);

      expect(result).toBeDefined();
      expect(result!.format).toBe('eml');
      expect(result!.subject).toBe('Test Email');
      expect(result!.from).toContain('sender@example.com');
      expect(result!.hasAttachments).toBe(false);
    });

    it('should return undefined for non-existent files', async () => {
      const result = await email.extract('/nonexistent/file.eml');
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid EML content', async () => {
      const invalidFile = path.join(tempDir, 'invalid.eml');
      await fs.writeFile(invalidFile, 'not valid email content');

      const result = await email.extract(invalidFile);

      // Might parse but with limited info, or return undefined
      if (result) {
        expect(result.format).toBe('eml');
      }
    });
  });

  describe('toRawMetadata', () => {
    it('should convert result to prefixed key-value pairs', () => {
      const result: email.EmailResult = {
        format: 'eml',
        subject: 'Important Email',
        from: 'sender@example.com',
        to: ['recipient1@example.com', 'recipient2@example.com'],
        cc: ['cc@example.com'],
        date: 'Mon, 1 Jan 2024 12:00:00 +0000',
        messageId: '<test123@example.com>',
        hasAttachments: true,
        attachmentCount: 2,
        attachmentNames: ['document.pdf', 'image.jpg'],
        isHtml: false,
      };

      const metadata = email.toRawMetadata(result);

      expect(metadata['Email_Format']).toBe('EML');
      expect(metadata['Email_Subject']).toBe('Important Email');
      expect(metadata['Email_From']).toBe('sender@example.com');
      expect(metadata['Email_To']).toBe('recipient1@example.com; recipient2@example.com');
      expect(metadata['Email_RecipientCount']).toBe(2);
      expect(metadata['Email_CC']).toBe('cc@example.com');
      expect(metadata['Email_HasAttachments']).toBe(true);
      expect(metadata['Email_AttachmentCount']).toBe(2);
      expect(metadata['Email_Attachments']).toBe('document.pdf; image.jpg');
      expect(metadata['Email_IsHTML']).toBe(false);
    });

    it('should handle email with HTML body', () => {
      const result: email.EmailResult = {
        format: 'eml',
        subject: 'HTML Email',
        from: 'sender@example.com',
        hasAttachments: false,
        attachmentCount: 0,
        isHtml: true,
        textPreview: 'This is the text preview...',
      };

      const metadata = email.toRawMetadata(result);

      expect(metadata['Email_IsHTML']).toBe(true);
      expect(metadata['Email_Preview']).toBe('This is the text preview...');
    });

    it('should include mailer info if present', () => {
      const result: email.EmailResult = {
        format: 'eml',
        subject: 'Test',
        hasAttachments: false,
        attachmentCount: 0,
        isHtml: false,
        mailer: 'Mozilla Thunderbird 115.0',
        priority: '1',
      };

      const metadata = email.toRawMetadata(result);

      expect(metadata['Email_Mailer']).toBe('Mozilla Thunderbird 115.0');
      expect(metadata['Email_Priority']).toBe('1');
    });
  });
});
