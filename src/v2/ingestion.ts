/**
 * Document Ingestion Pipeline for V2
 * Converts documents to markdown with navigable structure
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import type { V2DocumentStore } from './document-store.js';
import { StructureExtractor } from './structure-extractor.js';
import type { DocumentMetadata, IngestOptions } from './types.js';

export class V2IngestionPipeline {
  private extractor = new StructureExtractor();

  constructor(private store: V2DocumentStore) {}

  async ingest(options: IngestOptions): Promise<string> {
    const { filePath, title, extractStructure = true } = options;
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const docId = uuidv4();
    this.store.createDocument(docId);

    // Detect file type and convert to markdown
    const ext = path.extname(filePath).toLowerCase();
    let markdown: string;
    let metadata: DocumentMetadata;

    switch (ext) {
      case '.pdf':
        ({ markdown, metadata } = await this.processPDF(filePath));
        break;
      case '.docx':
        ({ markdown, metadata } = await this.processDOCX(filePath));
        break;
      case '.txt':
      case '.md':
        ({ markdown, metadata } = this.processText(filePath, ext));
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    // Add title if provided
    if (title && !markdown.startsWith('# ')) {
      markdown = `# ${title}\n\n${markdown}`;
      metadata.title = title;
    }

    // Save markdown
    this.store.saveMarkdown(docId, markdown);

    // Extract and save structure
    if (extractStructure) {
      const structure = this.extractor.extract(markdown);
      this.store.saveStructure(docId, structure);
      
      // Create index for fast lookups
      const index = this.createIndex(structure);
      this.store.saveIndex(docId, index);
    }

    return docId;
  }

  private async processPDF(filePath: string): Promise<{ markdown: string; metadata: DocumentMetadata }> {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    const stats = fs.statSync(filePath);
    
    // Convert to markdown (basic formatting)
    const markdown = this.formatAsMarkdown(pdfData.text);
    
    return {
      markdown,
      metadata: {
        title: pdfData.info?.Title || path.basename(filePath, '.pdf'),
        author: pdfData.info?.Author,
        pages: pdfData.numpages,
        fileType: 'pdf',
        fileSize: stats.size,
      },
    };
  }

  private async processDOCX(filePath: string): Promise<{ markdown: string; metadata: DocumentMetadata }> {
    const result = await mammoth.extractRawText({ path: filePath });
    
    const stats = fs.statSync(filePath);
    
    // Convert plain text to markdown (basic formatting)
    const markdown = this.formatAsMarkdown(result.value);
    
    return {
      markdown,
      metadata: {
        title: path.basename(filePath, '.docx'),
        fileType: 'docx',
        fileSize: stats.size,
      },
    };
  }

  private processText(filePath: string, ext: string): { markdown: string; metadata: DocumentMetadata } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    
    // If it's already markdown, use as-is
    const markdown = ext === '.md' ? content : this.formatAsMarkdown(content);
    
    return {
      markdown,
      metadata: {
        title: path.basename(filePath, ext),
        fileType: ext.substring(1),
        fileSize: stats.size,
      },
    };
  }

  private formatAsMarkdown(text: string): string {
    // Basic formatting to convert plain text to markdown
    const lines = text.split('\n');
    const formatted: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect potential headers (all caps, short lines)
      if (trimmed.length > 0 && trimmed.length < 100 && 
          trimmed === trimmed.toUpperCase() && 
          !trimmed.match(/^\d+$/)) {
        formatted.push(`## ${trimmed}`);
      }
      // Detect numbered sections
      else if (trimmed.match(/^\d+\.\s+\w+/)) {
        formatted.push(`### ${trimmed}`);
      }
      // Regular paragraph
      else if (trimmed.length > 0) {
        formatted.push(trimmed);
      }
      // Empty lines for spacing
      else {
        formatted.push('');
      }
    }
    
    return formatted.join('\n');
  }

  private createIndex(structure: any): Record<string, any> {
    const index: Record<string, any> = {
      sectionsById: {},
      sectionsByLevel: {},
      lineToSection: {},
    };

    const traverse = (section: any) => {
      index.sectionsById[section.id] = {
        id: section.id,
        title: section.title,
        level: section.level,
        startLine: section.startLine,
        endLine: section.endLine,
        wordCount: section.wordCount,
      };

      if (!index.sectionsByLevel[section.level]) {
        index.sectionsByLevel[section.level] = [];
      }
      index.sectionsByLevel[section.level].push(section.id);

      // Map lines to sections
      for (let i = section.startLine; i <= section.endLine; i++) {
        index.lineToSection[i] = section.id;
      }

      for (const child of section.children) {
        traverse(child);
      }
    };

    for (const section of structure.sections) {
      traverse(section);
    }

    return index;
  }
}
