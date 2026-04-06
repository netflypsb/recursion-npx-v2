# Recursion MCP

An NPX-installable MCP (Model Context Protocol) server for unbounded document processing using Recursive Language Models (RLM), local RAG with Ollama, and SQLite storage.

## Features

- **Document Ingestion**: PDF, DOCX, XLSX, TXT, MD, HTML, JSON support
- **Smart Chunking**: Overlapping chunks preserving document structure
- **Local Embeddings**: Via Ollama (nomic-embed-text, all-minilm, etc.) for semantic search
- **SQLite + FTS5**: Zero-infrastructure storage with full-text search
- **Local RAG with Ollama**: Uses Ollama (llama3, mistral, etc.) for answer generation
- **RLM Engine**: Recursive Language Model for unlimited context analysis via Python REPL
- **Hybrid Search**: Vector similarity + keyword search with reciprocal rank fusion

## Installation

### Via NPX (recommended)

```bash
# Run directly without installing
npx @recursion-mcp/npx

# Or install globally
npm install -g @recursion-mcp/npx
recursion-mcp
```

### Prerequisites

1. **Node.js 18+**
2. **Ollama** (for embeddings and RAG answer generation):
   ```bash
   # Install Ollama from https://ollama.com
   # Pull an embedding model:
   ollama pull nomic-embed-text
   # Pull a chat model for RAG:
   ollama pull llama3
   ```

3. **Python 3** (for RLM REPL execution)

## MCP Configuration

Add to your MCP settings (e.g., Claude Desktop, Windsurf, etc.):

```json
{
  "mcpServers": {
    "recursion": {
      "command": "npx",
      "args": ["@recursion-mcp/npx"]
    }
  }
}
```

## Available Tools

### `ingest_document`
Ingest a document into the knowledge base.

```json
{
  "filePath": "/path/to/document.pdf",
  "title": "Optional Title"
}
```

### `search_documents`
Search across all ingested documents using hybrid search.

```json
{
  "query": "search query",
  "topK": 10,
  "docId": "optional-doc-id"
}
```

### `retrieve_context`
Retrieve relevant document chunks for a question using hybrid search. Returns context that the AI agent can use to answer the question.

```json
{
  "question": "What is the main topic?",
  "topK": 5,
  "docId": "optional-doc-id"
}
```

### `ask_documents`
Ask a question and get an answer based on ingested documents using RAG with Ollama.

```json
{
  "question": "What is the main topic?",
  "topK": 5,
  "docId": "doc-id"
}
```

### `rlm_analyze`
Use Recursive Language Model to deeply analyze a document with unlimited context. The RLM writes Python code to explore the document context.

```json
{
  "query": "Analyze the contract terms",
  "docId": "doc-id",
  "maxDepth": 1,
  "maxIterations": 20
}
```

### `get_document_context`
Get the full text or a large portion of a document for deep analysis.

```json
{
  "docId": "doc-id",
  "maxChunks": 100,
  "startChunk": 0
}
```

### `list_documents`
List all ingested documents.

### `get_entities`
Get extracted entities from documents.

```json
{
  "docId": "optional-doc-id",
  "type": "person|org|location|concept|date|money"
}
```

### `delete_document`
Delete a document and all its data.

```json
{
  "docId": "doc-id"
}
```

### `check_ollama`
Check if Ollama is running and models are available.

## Storage Location

Documents and data are stored in `~/.kw-os/documents.db`

## Architecture

This MCP server combines multiple approaches for document analysis:

1. **RAG (Retrieval Augmented Generation)**: Uses Ollama for both embeddings and answer generation. Retrieves relevant chunks and generates answers locally.

2. **RLM (Recursive Language Model)**: Based on MIT research (2025), allows unlimited context by storing documents as Python variables. The LLM writes code to explore the context, supporting peeking, grepping, slicing, and recursive sub-queries.

3. **Hybrid Search**: Combines vector similarity (semantic) with keyword search (FTS5 BM25) using reciprocal rank fusion.

### RAG vs RLM

- **RAG**: Best for Q&A tasks. Fast, efficient, uses local LLM for answer generation.
- **RLM**: Best for deep analysis of large documents (10M+ tokens). Unlimited context, code-driven exploration.

### Environment Variables

- `OLLAMA_BASE_URL`: Ollama server URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL`: Chat model for RAG (default: `llama3`)

## License

MIT
