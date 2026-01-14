import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    this.n2m = new NotionToMarkdown({ notionClient: this.notion });
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

      // Convert page content to markdown
      const mdBlocks = await this.n2m.pageToMarkdown(pageId);
      const mdString = this.n2m.toMarkdownString(mdBlocks);

      // Create safe filename
      const fileName = this.sanitizeFileName(title);
      const filePath = path.join(parentDir, `${fileName}.md`);

      // Write markdown file
      await fs.writeFile(filePath, mdString.parent, 'utf-8');

      // Get child pages
      const children = await this.getChildPages(pageId);

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
}
