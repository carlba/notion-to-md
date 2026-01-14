# notion-to-md

Export your Notion workspace to a structured collection of markdown files.

## Features

- 🚀 Export all pages from your Notion workspace or start from a specific page
- 📁 Preserves hierarchical page structure in the file system
- 📝 Converts Notion blocks to clean markdown format
- 🔄 Handles nested pages automatically

## Prerequisites

1. **Notion Integration Token**: You need to create a Notion integration to get an API token
   - Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
   - Click "New integration"
   - Give it a name (e.g., "Markdown Exporter")
   - Copy the "Internal Integration Token"

2. **Grant Access**: Share your Notion pages with the integration
   - Open the page(s) you want to export in Notion
   - Click "Share" in the top right
   - Invite your integration by name
   - The integration can only access pages that have been shared with it

## Setup

1. Clone the repository:
```bash
git clone https://github.com/carlba/notion-to-md.git
cd notion-to-md
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Notion integration token:
```env
NOTION_TOKEN=secret_your_notion_integration_token_here
OUTPUT_DIR=./notion-export  # Optional: customize output directory
ROOT_PAGE_ID=               # Optional: specific page ID to start from
```

## Usage

### Export all accessible pages:

```bash
npm start
```

This will export all pages that your integration has access to into the `./notion-export` directory (or the directory specified in `OUTPUT_DIR`).

### Export from a specific page:

Set the `ROOT_PAGE_ID` in your `.env` file to a specific page ID. You can find the page ID in the Notion URL:

```
https://www.notion.so/My-Page-abc123def456?v=...
                            ^^^^^^^^^^^^^^^^
                            This is the page ID
```

Then run:
```bash
npm start
```

### Development mode:

```bash
npm run start:dev
```

## Output Structure

The script will create a directory structure that mirrors your Notion page hierarchy:

```
notion-export/
├── Page-1.md
├── Page-2.md
│   ├── Child-Page-1.md
│   └── Child-Page-2.md
└── Page-3.md
    └── Nested-Page.md
```

Each page is exported as a markdown file, and if a page has child pages, a directory with the page's name is created to hold those children.

## Development

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Lint

```bash
npm run lint
```

### Format Code

```bash
npm run format
```

## Troubleshooting

### "Error: NOTION_TOKEN environment variable is required"

Make sure you have created a `.env` file with your Notion integration token.

### "Error 401: Unauthorized"

- Verify that your integration token is correct
- Make sure you've shared the pages you want to export with your integration

### "Error 404: Not Found"

- The page ID might be incorrect
- The page might not be shared with your integration

### No pages exported

- Make sure you've shared at least one page with your integration
- Check that your integration has the correct permissions

## License

UNLICENSED

