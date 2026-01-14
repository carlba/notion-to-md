#!/usr/bin/env node

import { NotionExporter } from './exporter.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  const notionToken = process.env.NOTION_TOKEN;
  const outputDir = process.env.OUTPUT_DIR || './notion-export';
  const rootPageId = process.env.ROOT_PAGE_ID;

  if (!notionToken) {
    console.error('Error: NOTION_TOKEN environment variable is required');
    console.error('\nUsage:');
    console.error('  1. Create a .env file with the following variables:');
    console.error('     NOTION_TOKEN=your_notion_integration_token');
    console.error('     OUTPUT_DIR=./output (optional, defaults to ./notion-export)');
    console.error('     ROOT_PAGE_ID=page_id (optional, exports all pages if not set)');
    console.error('\n  2. Run: npm start');
    process.exit(1);
  }

  try {
    const exporter = new NotionExporter({
      notionToken,
      outputDir,
      rootPageId,
    });

    await exporter.exportAll();
  } catch (error) {
    console.error('Error during export:', error);
    process.exit(1);
  }
}

main();
