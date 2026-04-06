/**
 * V2 CLI - MCP Server with Navigation-Enabled Document Analysis Tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { V2DocumentStore } from './v2/document-store.js';
import { StructureExtractor } from './v2/structure-extractor.js';
import { Navigation } from './v2/navigation.js';
import { V2IngestionPipeline } from './v2/ingestion.js';

const V2_STORAGE_DIR = path.join(os.homedir(), '.kw-os', 'v2');

// Initialize V2 components
const store = new V2DocumentStore(V2_STORAGE_DIR);
const extractor = new StructureExtractor();
const navigation = new Navigation(store, extractor);
const ingestion = new V2IngestionPipeline(store);

const server = new Server(
  {
    name: 'recursion-mcp-v2',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'ingest_document_v2',
        description: 'Ingest a document and convert to structured markdown with navigable sections. Supports PDF, DOCX, TXT, MD.',
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
            extractStructure: {
              type: 'boolean',
              description: 'Whether to extract document structure (default: true)',
            },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'get_document_structure',
        description: 'Get the hierarchical structure of a document (outline, chapters, sections)',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            depth: {
              type: 'number',
              description: 'How many levels deep to return (1=chapters, 2=sections, etc.)',
            },
          },
          required: ['docId'],
        },
      },
      {
        name: 'read_section',
        description: 'Read a specific section of the document by ID',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            sectionId: {
              type: 'string',
              description: 'Section identifier (from structure)',
            },
            includeChildren: {
              type: 'boolean',
              description: 'Include subsections in the output',
            },
            maxLines: {
              type: 'number',
              description: 'Maximum number of lines to return',
            },
          },
          required: ['docId', 'sectionId'],
        },
      },
      {
        name: 'read_document_range',
        description: 'Read a specific line range from the document',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            startLine: {
              type: 'number',
              description: 'Starting line number (0-indexed)',
            },
            endLine: {
              type: 'number',
              description: 'Ending line number (inclusive)',
            },
          },
          required: ['docId', 'startLine', 'endLine'],
        },
      },
      {
        name: 'search_document',
        description: 'Search for text in the document (exact match, not semantic)',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            query: {
              type: 'string',
              description: 'Search terms',
            },
            scope: {
              type: 'string',
              description: 'Search scope: "full" or "section"',
              enum: ['full', 'section'],
            },
            sectionId: {
              type: 'string',
              description: 'Section ID if scope is "section"',
            },
            contextLines: {
              type: 'number',
              description: 'Number of context lines around matches (default: 3)',
            },
          },
          required: ['docId', 'query'],
        },
      },
      {
        name: 'list_sections',
        description: 'List all sections at a specific level or within a parent',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            level: {
              type: 'number',
              description: 'Section level (1=chapters, 2=sections, etc.)',
            },
            parentId: {
              type: 'string',
              description: 'Parent section ID to list children',
            },
          },
          required: ['docId'],
        },
      },
      {
        name: 'save_analysis',
        description: 'Save agent-generated analysis for a document or section',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            sectionId: {
              type: 'string',
              description: 'Section ID or "full" for document-wide',
            },
            analysisType: {
              type: 'string',
              description: 'Type: summary, themes, critique, etc.',
            },
            content: {
              type: 'string',
              description: 'The analysis content',
            },
          },
          required: ['docId', 'sectionId', 'analysisType', 'content'],
        },
      },
      {
        name: 'get_analysis',
        description: 'Retrieve previously saved analysis',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
            sectionId: {
              type: 'string',
              description: 'Section ID or "full"',
            },
            analysisType: {
              type: 'string',
              description: 'Type of analysis to retrieve',
            },
          },
          required: ['docId', 'sectionId', 'analysisType'],
        },
      },
      {
        name: 'list_documents_v2',
        description: 'List all ingested documents',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delete_document_v2',
        description: 'Delete a document and all its analysis',
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
        name: 'get_document_info',
        description: 'Get information about a document (structure, size, word count)',
        inputSchema: {
          type: 'object',
          properties: {
            docId: {
              type: 'string',
              description: 'Document ID',
            },
          },
          required: ['docId'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'ingest_document_v2': {
        const { filePath, title, extractStructure = true } = args as {
          filePath: string;
          title?: string;
          extractStructure?: boolean;
        };
        
        const docId = await ingestion.ingest({
          filePath,
          title,
          extractStructure,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: `Document ingested successfully.\nDocument ID: ${docId}\nFile: ${path.basename(filePath)}`,
            },
          ],
        };
      }

      case 'get_document_structure': {
        const { docId, depth } = args as { docId: string; depth?: number };
        const structure = store.loadStructure(docId);
        
        let filteredStructure = structure;
        if (depth !== undefined) {
          // Filter sections by depth
          const filterByDepth = (sections: any[], currentDepth: number): any[] => {
            if (currentDepth > depth) return [];
            return sections.map(s => ({
              ...s,
              children: filterByDepth(s.children, currentDepth + 1),
            }));
          };
          
          filteredStructure = {
            ...structure,
            sections: filterByDepth(structure.sections, 1),
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(filteredStructure, null, 2),
            },
          ],
        };
      }

      case 'read_section': {
        const { docId, sectionId, includeChildren, maxLines } = args as {
          docId: string;
          sectionId: string;
          includeChildren?: boolean;
          maxLines?: number;
        };
        
        const content = navigation.readSection({
          docId,
          sectionId,
          includeChildren,
          maxLines,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      case 'read_document_range': {
        const { docId, startLine, endLine } = args as {
          docId: string;
          startLine: number;
          endLine: number;
        };
        
        const content = navigation.readRange({ docId, startLine, endLine });
        
        return {
          content: [
            {
              type: 'text',
              text: `Lines ${startLine}-${endLine}:\n\n${content}`,
            },
          ],
        };
      }

      case 'search_document': {
        const { docId, query, scope, sectionId, contextLines } = args as {
          docId: string;
          query: string;
          scope?: 'full' | 'section';
          sectionId?: string;
          contextLines?: number;
        };
        
        const results = navigation.search({
          docId,
          query,
          scope,
          sectionId,
          contextLines,
        });
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No matches found for "${query}"`,
              },
            ],
          };
        }
        
        const formatted = results.map((r, i) => 
          `[${i + 1}] Line ${r.lineNumber}${r.sectionId ? ` (${r.sectionId})` : ''}:\n${r.context}`
        ).join('\n\n---\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.length} matches for "${query}":\n\n${formatted}`,
            },
          ],
        };
      }

      case 'list_sections': {
        const { docId, level, parentId } = args as {
          docId: string;
          level?: number;
          parentId?: string;
        };
        
        const sections = navigation.listSections(docId, level, parentId);
        
        const formatted = sections.map(s => 
          `${'  '.repeat(s.level - 1)}[${s.level}] ${s.title} (lines ${s.startLine}-${s.endLine}, ${s.wordCount} words)`
        ).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Found ${sections.length} sections:\n\n${formatted}`,
            },
          ],
        };
      }

      case 'save_analysis': {
        const { docId, sectionId, analysisType, content } = args as {
          docId: string;
          sectionId: string;
          analysisType: string;
          content: string;
        };
        
        const analysis = {
          id: `${docId}-${sectionId}-${analysisType}`,
          docId,
          sectionId,
          analysisType,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        store.saveAnalysis(docId, analysis);
        
        return {
          content: [
            {
              type: 'text',
              text: `Analysis saved: ${analysisType} for ${sectionId === 'full' ? 'document' : sectionId}`,
            },
          ],
        };
      }

      case 'get_analysis': {
        const { docId, sectionId, analysisType } = args as {
          docId: string;
          sectionId: string;
          analysisType: string;
        };
        
        const analysis = store.loadAnalysis(docId, sectionId, analysisType);
        
        if (!analysis) {
          return {
            content: [
              {
                type: 'text',
                text: `No analysis found: ${analysisType} for ${sectionId}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: analysis.content,
            },
          ],
        };
      }

      case 'list_documents_v2': {
        const docIds = store.listDocuments();
        
        const docList = docIds.map(id => {
          try {
            const info = navigation.getDocumentInfo(id);
            return `${id}: ${info.structure.title} (${info.totalLines} lines, ${info.totalWords} words)`;
          } catch {
            return `${id}: [unable to load]`;
          }
        }).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: docList || 'No documents ingested',
            },
          ],
        };
      }

      case 'delete_document_v2': {
        const { docId } = args as { docId: string };
        const deleted = store.deleteDocument(docId);
        
        return {
          content: [
            {
              type: 'text',
              text: deleted ? `Document ${docId} deleted` : `Document ${docId} not found`,
            },
          ],
        };
      }

      case 'get_document_info': {
        const { docId } = args as { docId: string };
        const info = navigation.getDocumentInfo(docId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                title: info.structure.title,
                totalSections: info.structure.totalSections,
                maxDepth: info.structure.maxDepth,
                totalLines: info.totalLines,
                totalWords: info.totalWords,
                outline: info.structure.outline,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing tool ${name}: ${error}`
    );
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Recursion MCP V2 running on stdio');
}

main().catch(console.error);
