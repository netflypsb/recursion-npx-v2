# Recursion MCP V2

[![npm version](https://img.shields.io/npm/v/recursion-mcp)](https://www.npmjs.com/package/recursion-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An NPX-installable MCP (Model Context Protocol) server for **navigation-enabled recursive document analysis**. Works entirely offline with no external APIs required.

## Features

- **No External APIs**: Pure file-system based, works completely offline
- **Complete Document Analysis**: No missed content like brittle RAG chunking
- **Hierarchical Navigation**: Read any section, any line range
- **Persistent Analysis**: Save and retrieve agent-generated insights
- **Markdown Conversion**: PDF/DOCX → structured markdown
- **Recursive Reading**: Agent-controlled systematic analysis

## Quick Start

```bash
# Run via NPX (no install needed)
npx recursion-mcp recursion-mcp-v2

# Or install globally
npm install -g recursion-mcp

# Run V2
recursion-mcp-v2
```

## Terminal Commands

### Package Management

```bash
# Install globally
npm install -g recursion-mcp

# Uninstall globally
npm uninstall -g recursion-mcp

# Check if installed globally
npm list -g recursion-mcp

# Check local project installation
npm list recursion-mcp

# View package info (version, dependencies, etc.)
npm info recursion-mcp

# View latest version available
npm view recursion-mcp version

# Update to latest version
npm update -g recursion-mcp
```

### MCP Configuration Cleanup

After uninstalling, remove the MCP server entry from your IDE config:

**Windsurf:** `~/.codeium/windsurf/mcp_config.json`  
**Claude Desktop:** `~/AppData/Roaming/Claude/config.json`  
**Cursor:** `~/.cursor/mcp.json`

Remove the `recursion-v2` entry under `mcpServers`.

## Installation Verification

After installation, verify it's working:

```bash
# Check if package is installed
npm view recursion-mcp version

# Test V2 server
npx recursion-mcp recursion-mcp-v2 --help
recursion-mcp-v2 --help
```

## Manual MCP Configuration

If automatic IDE configuration doesn't work, copy this prompt for your AI assistant:

> **Please add the Recursion V2 MCP server to my IDE's MCP configuration file.**
> 
> **For Windsurf:** Add this to `~/.codeium/windsurf/mcp_config.json`:
> ```json
> {
>   "mcpServers": {
>     "recursion-v2": {
>       "command": "npx",
>       "args": ["recursion-mcp", "recursion-mcp-v2"]
>     }
>   }
> }
> ```

Or with absolute paths for global install:
> ```json
> {
>   "mcpServers": {
>     "recursion-v2": {
>       "command": "node",
>       "args": ["C:/Users/YOUR_USERNAME/AppData/Roaming/npm/node_modules/recursion-mcp/dist/cli-v2.js"]
>     }
>   }
> }
> ```

## Installation

### Via NPX (recommended)

```bash
npx recursion-mcp recursion-mcp-v2
```

### Global Install

```bash
npm install -g recursion-mcp

# Run V2
recursion-mcp-v2
```

### Automatic IDE Configuration

When you install globally, the package automatically configures MCP for detected IDEs:

| IDE | Auto-Configured |
|-----|----------------|
| **Windsurf** | ✅ Yes |
| **Claude Desktop** | ✅ Yes |
| **Cursor** | ✅ Yes |
| **VSCode** | ✅ Yes (with MCP extension) |

**Restart your IDE** after installation to see the MCP tools.

### Manual Setup (if auto-config fails)

```bash
# Run setup manually
npm run setup --prefix $(npm root -g)/recursion-mcp
```

Or manually add to your IDE's MCP settings (see MCP Configuration section above).

### Prerequisites

- Node.js 18+ only (no other dependencies!)

## MCP Configuration

### V2 Configuration (Navigation)

```json
{
  "mcpServers": {
    "recursion-v2": {
      "command": "npx",
      "args": ["recursion-mcp", "recursion-mcp-v2"]
    }
  }
}
```

## Available Tools

### `ingest_document_v2`
Convert and store document with navigable structure.

```json
{
  "filePath": "/path/to/document.pdf",
  "title": "Optional Title"
}
```

### `get_document_structure`
Get hierarchical outline (chapters, sections, subsections).

```json
{
  "docId": "document-id",
  "depth": 2
}
```

### `read_section`
Read a specific section by ID.

```json
{
  "docId": "document-id",
  "sectionId": "section-id",
  "maxLines": 100
}
```

### `search_document`
Search for text with context lines.

```json
{
  "docId": "document-id",
  "query": "search term",
  "contextLines": 3
}
```

### `save_analysis` / `get_analysis`
Save and retrieve agent-generated analysis.

```json
{
  "docId": "document-id",
  "sectionId": "full",
  "analysisType": "summary",
  "content": "Analysis text..."
}
```

## Agent Analysis Pattern

```typescript
// 1. Ingest document
const docId = await ingest_document_v2({
  filePath: "/path/to/book.pdf"
});

// 2. Get structure
const structure = await get_document_structure({ docId });

// 3. Systematic analysis
for (const chapter of structure.sections) {
  const content = await read_section({ docId, sectionId: chapter.id });
  const analysis = agentAnalyze(content);
  await save_analysis({ docId, sectionId: chapter.id, analysisType: "summary", content: analysis });
}

// 4. Synthesize complete understanding
const fullAnalysis = await get_analysis({ docId, sectionId: "full", analysisType: "complete" });
```

## Storage

Documents are stored at `~/.kw-os/v2/documents/{doc-id}/`:
- `document.md` - Full markdown
- `structure.json` - Hierarchical outline
- `analysis/` - Saved analyses

## Architecture

- **File System Storage**: Markdown + JSON structure
- **Hierarchical Navigation**: Section-level granularity
- **Agent-Driven**: AI controls reading, no brittle retrieval
- **Analysis Persistence**: Incremental understanding building
- **Zero Dependencies**: Only requires Node.js 18+

## Documentation

- [V2 Implementation Plan](version2/V2-Implementation-Plan.md)
- [V2 Summary](version2/V2-Summary.md)

## License

MIT © netflypsb

## Links

- [GitHub Repository](https://github.com/netflypsb/recursion-npx-v2)
- [NPM Package](https://www.npmjs.com/package/recursion-mcp)
- [Issues](https://github.com/netflypsb/recursion-npx-v2/issues)

