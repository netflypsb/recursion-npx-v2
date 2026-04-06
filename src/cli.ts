#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { DocumentStore } from './document/store.js';
import { LocalEmbedder } from './document/embedder.js';
import { RAGQueryEngine } from './document/rag-query.js';
import { RLMEngine } from './document/rlm-engine.js';
import { ingestDocument } from './document/ingestion.js';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const KWOS_DIR = path.join(os.homedir(), '.kw-os');
if (!fs.existsSync(KWOS_DIR)) {
  fs.mkdirSync(KWOS_DIR, { recursive: true });
}

const store = new DocumentStore(path.join(KWOS_DIR, 'documents.db'));
const embedder = new LocalEmbedder();
const ragEngine = new RAGQueryEngine(store, embedder, {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3.5:2b',
});

const server = new Server(
  {
    name: 'recursion-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ingest_document',
        description: 'Ingest a document (PDF, DOCX, XLSX, TXT, MD) into the knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Absolute path to the document file',
            },
            title: {
              type: 'string',
              description: 'Optional title for the document',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'search_documents',
        description: 'Search across all ingested documents using hybrid search (vector + keyword)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default: 10)',
            },
            docId: {
              type: 'string',
              description: 'Optional: limit search to specific document ID',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'retrieve_context',
        description: 'Retrieve relevant document chunks for a question using hybrid search (vector + keyword). Returns context that the AI agent can use to answer the question.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Question to retrieve context for',
            },
            topK: {
              type: 'number',
              description: 'Number of chunks to retrieve (default: 5)',
            },
            docId: {
              type: 'string',
              description: 'Optional: limit to specific document ID',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'ask_documents',
        description: 'Ask a question and get an answer based on ingested documents using RAG with Ollama (local LLM)',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Question to answer',
            },
            topK: {
              type: 'number',
              description: 'Number of chunks to use for context (default: 5)',
            },
            docId: {
              type: 'string',
              description: 'Optional: limit to specific document ID',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'rlm_analyze',
        description: 'Use Recursive Language Model to deeply analyze a document with unlimited context. The RLM writes Python code to explore the document context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Analysis query or instruction',
            },
            docId: {
              type: 'string',
              description: 'Document ID to analyze',
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum recursion depth (default: 1)',
            },
            maxIterations: {
              type: 'number',
              description: 'Max REPL iterations (default: 20)',
            },
          },
          required: ['query', 'docId'],
        },
      },
      {
        name: 'get_document_context',
        description: 'Get the full text or a large portion of a document for deep analysis. Useful when the AI agent needs to analyze the entire document or large sections.',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID to retrieve context from',
            },
            maxChunks: {
              type: 'number',
              description: 'Maximum number of chunks to return (default: 100, use -1 for all)',
            },
            startChunk: {
              type: 'number',
              description: 'Starting chunk index (default: 0)',
            },
          },
          required: ['docId'],
        },
      },
      {
        name: 'list_documents',
        description: 'List all ingested documents',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_entities',
        description: 'Get extracted entities from documents',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Optional: filter by document ID',
            },
            type: {
              type: 'string',
              description: 'Optional: filter by entity type (person, org, location, concept, date, money)',
            },
          },
        },
      },
      {
        name: 'delete_document',
        description: 'Delete a document and all its associated data',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID to delete',
            },
          },
          required: ['docId'],
        },
      },
      {
        name: 'check_ollama',
        description: 'Check if Ollama is running and embedding model is available',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const docs = store.listDocuments();
  return {
    resources: docs.map(doc => ({
      uri: `document://${doc.id}`,
      mimeType: 'text/plain',
      name: doc.title || doc.filename,
      description: `Document: ${doc.filename} (${doc.total_chunks} chunks, ${doc.total_tokens} tokens)`,
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const match = uri.match(/^document:\/\/(.+)$/);
  if (!match) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid URI format: ${uri}`);
  }
  const docId = match[1];
  const doc = store.getDocument(docId);
  if (!doc) {
    throw new McpError(ErrorCode.InvalidRequest, `Document not found: ${docId}`);
  }
  const chunks = store.getChunks(docId);
  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: chunks.map(c => c.text).join('\n\n---\n\n'),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'ingest_document': {
        const { filePath, title } = args as { filePath: string; title?: string };
        if (!fs.existsSync(filePath)) {
          throw new McpError(ErrorCode.InvalidRequest, `File not found: ${filePath}`);
        }
        const docId = await ingestDocument(filePath, { title, store, embedder });
        return {
          content: [
            {
              type: 'text',
              text: `Document ingested successfully.\nDocument ID: ${docId}\nFile: ${path.basename(filePath)}`,
            },
          ],
        };
      }

      case 'search_documents': {
        const { query, topK = 10, docId } = args as { query: string; topK?: number; docId?: string };
        const results = await store.hybridSearch(query, { limit: topK, docId });
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No results found.' }],
          };
        }
        const formatted = results.map((r, i) => 
          `[${i + 1}] Score: ${r.score.toFixed(3)} | ${r.section || 'Section ' + r.index}\n${r.text.substring(0, 300)}...`
        ).join('\n\n');
        return {
          content: [{ type: 'text', text: `Found ${results.length} results:\n\n${formatted}` }],
        };
      }

      case 'retrieve_context': {
        const { question, topK = 5, docId } = args as { question: string; topK?: number; docId?: string };
        const results = await store.hybridSearch(question, { limit: topK, docId });
        
        if (results.length === 0) {
          return {
            content: [{ 
              type: 'text', 
              text: 'No relevant chunks found for this question.' 
            }],
          };
        }
        
        const chunks = results.map((r, i) => 
          `[Chunk ${i + 1}] Document: ${r.docId} | Section: ${r.section || 'Section ' + r.index} | Score: ${r.score.toFixed(3)}\n${r.text}`
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Retrieved ${results.length} relevant chunks for the question: "${question}"\n\n${chunks}`,
            },
          ],
        };
      }

      case 'ask_documents': {
        const { question, topK = 5, docId } = args as { question: string; topK?: number; docId?: string };
        const result = await ragEngine.query(question, { topK, docId });
        const sources = result.sources.map((s, i) => 
          `[${i + 1}] ${s.section || 'Section'} (relevance: ${s.relevance.toFixed(3)})`
        ).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `${result.answer}\n\n---\nSources:\n${sources}`,
            },
          ],
        };
      }

      case 'rlm_analyze': {
        const { query, docId, maxDepth = 1, maxIterations = 20 } = args as { 
          query: string; 
          docId: string; 
          maxDepth?: number;
          maxIterations?: number;
        };
        const doc = store.getDocument(docId);
        if (!doc) {
          throw new McpError(ErrorCode.InvalidRequest, `Document not found: ${docId}`);
        }
        const chunks = store.getChunks(docId);
        const fullText = chunks.map(c => c.text).join('\n\n');
        
        const rlm = new RLMEngine({ maxDepth, maxIterations });
        const result = await rlm.analyze(query, fullText);
        
        return {
          content: [
            {
              type: 'text',
              text: `${result.answer}\n\n---\nIterations: ${result.iterations}`,
            },
          ],
        };
      }

      case 'get_document_context': {
        const { docId, maxChunks = 100, startChunk = 0 } = args as { 
          docId: string; 
          maxChunks?: number;
          startChunk?: number;
        };
        const doc = store.getDocument(docId);
        if (!doc) {
          throw new McpError(ErrorCode.InvalidRequest, `Document not found: ${docId}`);
        }
        const allChunks = store.getChunks(docId);
        const chunksToReturn = maxChunks === -1 ? allChunks : allChunks.slice(startChunk, startChunk + maxChunks);
        
        const context = chunksToReturn.map((c, i) => 
          `[Chunk ${startChunk + i}] Section: ${c.metadata.section || 'Section ' + c.index}\n${c.text}`
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Document: ${doc.title || doc.filename}\nTotal chunks: ${allChunks.length} | Returning: ${chunksToReturn.length}\n\n${context}`,
            },
          ],
        };
      }

      case 'list_documents': {
        const docs = store.listDocuments();
        if (docs.length === 0) {
          return {
            content: [{ type: 'text', text: 'No documents ingested yet.' }],
          };
        }
        const formatted = docs.map(d => 
          `- ${d.id}: ${d.title || d.filename} (${d.filetype}, ${d.total_chunks} chunks, ingested: ${d.ingested_at})`
        ).join('\n');
        return {
          content: [{ type: 'text', text: `${docs.length} documents:\n\n${formatted}` }],
        };
      }

      case 'get_entities': {
        const { docId, type } = args as { docId?: string; type?: string };
        const entities = store.getEntities(docId, type);
        if (entities.length === 0) {
          return {
            content: [{ type: 'text', text: 'No entities found.' }],
          };
        }
        const formatted = entities.map(e => 
          `- ${e.name} (${e.type}): ${e.description || 'No description'}`
        ).join('\n');
        return {
          content: [{ type: 'text', text: `${entities.length} entities:\n\n${formatted}` }],
        };
      }

      case 'delete_document': {
        const { docId } = args as { docId: string };
        store.deleteDocument(docId);
        return {
          content: [{ type: 'text', text: `Document ${docId} deleted successfully.` }],
        };
      }

      case 'check_ollama': {
        const available = await embedder.isAvailable();
        if (available) {
          return {
            content: [{ type: 'text', text: `Ollama is running and ${embedder.config.model} is available.` }],
          };
        } else {
          return {
            content: [{ 
              type: 'text', 
              text: `Ollama is not available at ${embedder.config.baseUrl}.\nPlease install Ollama and run: ollama pull ${embedder.config.model}`,
            }],
            isError: true,
          };
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Recursion MCP server running on stdio');
}

main().catch(console.error);
