import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

type PageObjectResponse = Extract<
  Awaited<ReturnType<Client['pages']['retrieve']>>,
  { properties: Record<string, unknown> }
>;

type PartialPageObjectResponse = Exclude<
  Awaited<ReturnType<Client['pages']['retrieve']>>,
  { properties: Record<string, unknown> }
>;

export interface ExporterConfig {
  notionToken: string;
  outputDir: string;
  rootPageId?: string;
}

export class NotionExporter {
  private static readonly MAX_FILENAME_LENGTH = 200;
  
  private readonly notion: Client;
  private readonly n2m: NotionToMarkdown;
  private readonly outputDir: string;
  private readonly rootPageId?: string;
  private readonly processedPages = new Set<string>();

  constructor(config: ExporterConfig) {
    this.notion = new Client({ auth: config.notionToken });
    this.n2m = new NotionToMarkdown({ 
      notionClient: this.notion,
      config: {
        parseChildPages: false, // Don't include child page content in parent
      }
    });
    this.outputDir = config.outputDir;
    this.rootPageId = config.rootPageId;
  }

  /**
   * Export all pages from the Notion workspace to markdown files
   */
  async exportAll(): Promise<void> {
    console.log('Starting export...');
    
    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });

    if (this.rootPageId) {
      // Export from a specific root page
      await this.exportPage(this.rootPageId, this.outputDir);
    } else {
      // Search for all pages in the workspace
      await this.exportAllPages();
    }

    console.log(`Export complete! Files saved to: ${this.outputDir}`);
    console.log(`Total pages exported: ${this.processedPages.size}`);
  }

  /**
   * Export all pages accessible in the workspace
   */
  private async exportAllPages(): Promise<void> {
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const response = await this.notion.search({
        filter: { property: 'object', value: 'page' },
        start_cursor: startCursor,
        page_size: 100,
      });

      for (const page of response.results) {
        // Type guard to ensure it's a page (not a database)
        if ('properties' in page) {
          await this.exportPage(page.id, this.outputDir);
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }
  }

  /**
   * Export a single page and its children recursively
   */
  private async exportPage(
    pageId: string,
    parentDir: string
  ): Promise<void> {
    // Skip if already processed
    if (this.processedPages.has(pageId)) {
      return;
    }

    this.processedPages.add(pageId);

    try {
      // Get page details
      const page = await this.notion.pages.retrieve({ page_id: pageId });

      if (!this.isFullPage(page)) {
        console.log(`Skipping page ${pageId} - insufficient permissions`);
        return;
      }

      // Get page title
      const title = this.getPageTitle(page);
      console.log(`Exporting: ${title}`);

      // Get child pages first to determine if we need to append links
      const children = await this.getChildPages(pageId);

      // Convert page content to markdown
      const mdBlocks = await this.n2m.pageToMarkdown(pageId);
      const mdString = this.n2m.toMarkdownString(mdBlocks);

      // Create safe filename
      const fileName = this.sanitizeFileName(title);
      const filePath = path.join(parentDir, `${fileName}.md`);

      // Process images in the markdown
      let processedMarkdown = await this.processImages(
        mdString.parent,
        parentDir
      );

      // If there are child pages, append a list of links to them
      if (children.length > 0) {
        processedMarkdown += '\n\n## Subnotes\n\n';
        for (const child of children) {
          const childTitle = this.getPageTitle(child);
          const childFileName = this.sanitizeFileName(childTitle);
          processedMarkdown += `- [${childTitle}](./${fileName}/${childFileName}.md)\n`;
        }
      }

      // Write markdown file
      await fs.writeFile(filePath, processedMarkdown, 'utf-8');

      if (children.length > 0) {
        // Create directory for child pages
        const childDir = path.join(parentDir, fileName);
        await fs.mkdir(childDir, { recursive: true });

        // Export child pages
        for (const child of children) {
          await this.exportPage(child.id, childDir);
        }
      }
    } catch (error) {
      console.error(`Error exporting page ${pageId}:`, error);
    }
  }

  /**
   * Get all child pages of a parent page
   */
  private async getChildPages(
    pageId: string
  ): Promise<PageObjectResponse[]> {
    const children: PageObjectResponse[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;

    while (hasMore) {
      const response = await this.notion.blocks.children.list({
        block_id: pageId,
        start_cursor: startCursor,
        page_size: 100,
      });

      for (const block of response.results) {
        if ('type' in block && block.type === 'child_page') {
          try {
            const childPage = await this.notion.pages.retrieve({
              page_id: block.id,
            });
            if (this.isFullPage(childPage)) {
              children.push(childPage);
            }
          } catch (error) {
            console.error(`Error fetching child page ${block.id}:`, error);
          }
        }
      }

      hasMore = response.has_more;
      startCursor = response.next_cursor ?? undefined;
    }

    return children;
  }

  /**
   * Extract title from a page object
   */
  private getPageTitle(page: PageObjectResponse): string {
    const properties = page.properties;

    // Try to find title property
    for (const [, property] of Object.entries(properties)) {
      if (
        property &&
        typeof property === 'object' &&
        'type' in property &&
        property.type === 'title' &&
        'title' in property &&
        Array.isArray(property.title) &&
        property.title.length > 0
      ) {
        return property.title
          .map((t: { plain_text?: string }) => t.plain_text ?? '')
          .join('');
      }
    }

    return 'Untitled';
  }

  /**
   * Sanitize filename to be filesystem-safe
   */
  private sanitizeFileName(fileName: string): string {
    return (
      fileName
        .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid chars
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .substring(0, NotionExporter.MAX_FILENAME_LENGTH) || 'untitled'
    );
  }

  /**
   * Type guard to check if page is a full page object
   */
  private isFullPage(
    page: PageObjectResponse | PartialPageObjectResponse
  ): page is PageObjectResponse {
    return 'properties' in page;
  }

  /**
   * Process images in markdown: download them and update references
   */
  private async processImages(
    markdown: string,
    parentDir: string
  ): Promise<string> {
    // Regular expression to match markdown images: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...markdown.matchAll(imageRegex)];

    if (matches.length === 0) {
      return markdown;
    }

    // Create images directory at the same level as the markdown file
    const imagesDir = path.join(parentDir, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    let processedMarkdown = markdown;
    let imageCounter = 1;

    for (const match of matches) {
      const fullMatch = match[0];
      const altText = match[1];
      const imageUrl = match[2];

      try {
        // Skip if it's already a local path
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          continue;
        }

        // Only download Notion-hosted images
        const urlObj = new URL(imageUrl);
        if (!urlObj.hostname.includes('notion.so')) {
          console.log(`  Skipping non-Notion image: ${imageUrl}`);
          continue;
        }

        // Extract file extension from URL or use default
        const urlPath = urlObj.pathname;
        const extMatch = urlPath.match(/\.([a-zA-Z0-9]+)(\?|$)/);
        const ext = extMatch ? extMatch[1] : 'png';

        // Create a safe filename for the image
        const imageFileName = `image-${imageCounter}.${ext}`;
        const localImagePath = path.join(imagesDir, imageFileName);
        
        // Download the image
        await this.downloadImage(imageUrl, localImagePath);

        // Update markdown to use relative path
        const relativeImagePath = `./images/${imageFileName}`;
        const newImageMarkdown = `![${altText}](${relativeImagePath})`;
        processedMarkdown = processedMarkdown.replace(fullMatch, newImageMarkdown);

        console.log(`  Downloaded image: ${imageFileName}`);
        imageCounter++;
      } catch (error) {
        console.error(`  Failed to download image from ${imageUrl}:`, error);
        // Keep the original URL if download fails
      }
    }

    return processedMarkdown;
  }

  /**
   * Download an image from a URL to a local path
   */
  private async downloadImage(url: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadImage(redirectUrl, filePath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const fileStream = fsSync.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err: Error) => {
          // Clean up failed download
          fsSync.unlink(filePath, () => {
            // Ignore unlink errors
          });
          reject(err);
        });
      }).on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}
