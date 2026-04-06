/**
 * Type definitions for Recursion MCP V2
 */

export interface V2Document {
  id: string;
  title: string;
  sourcePath: string;
  markdownPath: string;
  totalLines: number;
  metadata: DocumentMetadata;
  structure: DocumentStructure;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  date?: string;
  pages?: number;
  fileType: string;
  fileSize: number;
}

export interface DocumentStructure {
  title: string;
  sections: SectionNode[];
  outline: string;
  totalSections: number;
  maxDepth: number;
}

export interface SectionNode {
  id: string;
  level: number;
  title: string;
  startLine: number;
  endLine: number;
  children: SectionNode[];
  parentId?: string;
  wordCount?: number;
  summary?: string;
}

export interface NavigableChunk {
  id: string;
  docId: string;
  sectionId?: string;
  startLine: number;
  endLine: number;
  content: string;
  wordCount: number;
}

export interface AnalysisEntry {
  id: string;
  docId: string;
  sectionId: string; // 'full' for document-wide
  analysisType: string; // 'summary', 'themes', 'critique', etc.
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  lineNumber: number;
  context: string;
  exactMatch: string;
  sectionId?: string;
}

export interface ReadSectionOptions {
  docId: string;
  sectionId: string;
  includeChildren?: boolean;
  maxLines?: number;
  maxTokens?: number;
}

export interface ReadRangeOptions {
  docId: string;
  startLine: number;
  endLine: number;
}

export interface SearchOptions {
  docId: string;
  query: string;
  scope?: 'full' | 'section';
  sectionId?: string;
  caseSensitive?: boolean;
  contextLines?: number;
}

export interface IngestOptions {
  filePath: string;
  title?: string;
  extractStructure?: boolean;
  maxChunkSize?: number;
}

export interface AnalysisOptions {
  docId: string;
  sectionId?: string;
  analysisType: string;
  content: string;
}
