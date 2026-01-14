import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionExporter } from './exporter.js';

// Mock the dependencies
vi.mock('@notionhq/client');
vi.mock('notion-to-md');
vi.mock('fs/promises');

describe('NotionExporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with valid config', () => {
      const config = {
        notionToken: 'test_token',
        outputDir: './test-output',
      };

      const exporter = new NotionExporter(config);
      expect(exporter).toBeInstanceOf(NotionExporter);
    });

    it('should accept optional rootPageId', () => {
      const config = {
        notionToken: 'test_token',
        outputDir: './test-output',
        rootPageId: 'test_page_id',
      };

      const exporter = new NotionExporter(config);
      expect(exporter).toBeInstanceOf(NotionExporter);
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace invalid characters with hyphens', () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      // Access private method through type assertion for testing
      const sanitize = (fileName: string): string =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).sanitizeFileName(fileName) as string;

      expect(sanitize('Test: File/Name')).toBe('Test-File-Name');
      expect(sanitize('File|With*Invalid?Chars')).toBe(
        'File-With-Invalid-Chars'
      );
      expect(sanitize('Multiple   Spaces')).toBe('Multiple-Spaces');
      expect(sanitize('---Multiple---Hyphens---')).toBe('Multiple-Hyphens');
    });

    it('should handle empty or invalid filenames', () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const sanitize = (fileName: string): string =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).sanitizeFileName(fileName) as string;

      expect(sanitize('')).toBe('untitled');
      expect(sanitize('   ')).toBe('untitled');
      expect(sanitize(':::')).toBe('untitled');
    });

    it('should limit filename length', () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const sanitize = (fileName: string): string =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).sanitizeFileName(fileName) as string;

      const longName = 'a'.repeat(250);
      const result = sanitize(longName);
      expect(result.length).toBeLessThanOrEqual(200);
    });
  });
});

