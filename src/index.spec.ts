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

  describe('processImages', () => {
    it('should return unchanged markdown if no images present', async () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const markdown = '# Title\n\nSome text without images.';
      const processImages = (
        md: string,
        dir: string
      ): Promise<string> =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).processImages(md, dir) as Promise<string>;

      const result = await processImages(markdown, '/tmp');
      expect(result).toBe(markdown);
    });

    it('should extract image URLs from markdown', async () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const markdown =
        '# Title\n\n![Alt text](https://example.com/image.png)\n\nSome text.';

      // Mock the downloadImage method to avoid actual downloads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(exporter as any, 'downloadImage').mockResolvedValue(undefined);

      const processImages = (
        md: string,
        dir: string
      ): Promise<string> =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).processImages(md, dir) as Promise<string>;

      const result = await processImages(markdown, '/tmp');
      expect(result).toContain('./images/image-1.png');
      expect(result).not.toContain('https://example.com/image.png');
    });

    it('should handle multiple images', async () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const markdown =
        '![Image 1](https://example.com/img1.jpg)\n![Image 2](https://example.com/img2.png)';

      // Mock the downloadImage method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(exporter as any, 'downloadImage').mockResolvedValue(undefined);

      const processImages = (
        md: string,
        dir: string
      ): Promise<string> =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).processImages(md, dir) as Promise<string>;

      const result = await processImages(markdown, '/tmp');
      expect(result).toContain('./images/image-1.jpg');
      expect(result).toContain('./images/image-2.png');
    });

    it('should skip non-HTTP image URLs', async () => {
      const exporter = new NotionExporter({
        notionToken: 'test',
        outputDir: './test',
      });

      const markdown =
        '![Local image](./local/image.png)\n![Remote](https://example.com/remote.png)';

      // Mock the downloadImage method
      const downloadSpy = vi
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(exporter as any, 'downloadImage')
        .mockResolvedValue(undefined);

      const processImages = (
        md: string,
        dir: string
      ): Promise<string> =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exporter as any).processImages(md, dir) as Promise<string>;

      const result = await processImages(markdown, '/tmp');
      
      // Should keep local path unchanged
      expect(result).toContain('./local/image.png');
      // Should update remote path
      expect(result).toContain('./images/image-1.png');
      // Download should only be called once for the remote image
      expect(downloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});

