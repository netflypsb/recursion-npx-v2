/**
 * Navigation Module
 * Provides tools for reading and searching documents
 */

import type { V2DocumentStore } from './document-store.js';
import type { StructureExtractor } from './structure-extractor.js';
import type { 
  ReadSectionOptions, 
  ReadRangeOptions, 
  SearchOptions, 
  SearchResult,
  SectionNode 
} from './types.js';

export class Navigation {
  constructor(
    private store: V2DocumentStore,
    private extractor: StructureExtractor
  ) {}

  readSection(options: ReadSectionOptions): string {
    const { docId, sectionId, includeChildren = false, maxLines, maxTokens } = this.resolveReadOptions(options);
    
    const structure = this.store.loadStructure(docId);
    const section = this.extractor.findSectionById(structure.sections, sectionId);
    
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }
    
    const markdown = this.store.loadMarkdown(docId);
    const lines = markdown.split('\n');
    
    let startLine = section.startLine;
    let endLine = section.endLine;
    
    // If including children, extend to the end of the last child
    if (includeChildren && section.children.length > 0) {
      const lastChild = this.findLastDescendant(section);
      endLine = lastChild.endLine;
    }
    
    let content = lines.slice(startLine, endLine + 1).join('\n');
    
    // Apply limits
    if (maxLines) {
      const limitedLines = content.split('\n').slice(0, maxLines);
      content = limitedLines.join('\n');
    }
    
    if (maxTokens) {
      content = this.limitByTokens(content, maxTokens);
    }
    
    return content;
  }

  readRange(options: ReadRangeOptions): string {
    const { docId, startLine, endLine } = options;
    
    const markdown = this.store.loadMarkdown(docId);
    const lines = markdown.split('\n');
    
    const actualStart = Math.max(0, startLine);
    const actualEnd = Math.min(lines.length - 1, endLine);
    
    return lines.slice(actualStart, actualEnd + 1).join('\n');
  }

  search(options: SearchOptions): SearchResult[] {
    const { docId, query, scope = 'full', sectionId, caseSensitive = false, contextLines = 3 } = options;
    
    const markdown = this.store.loadMarkdown(docId);
    const lines = markdown.split('\n');
    const structure = this.store.loadStructure(docId);
    
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const results: SearchResult[] = [];
    
    // Determine search range
    let startLine = 0;
    let endLine = lines.length - 1;
    
    if (scope === 'section' && sectionId) {
      const section = this.extractor.findSectionById(structure.sections, sectionId);
      if (section) {
        startLine = section.startLine;
        endLine = section.endLine;
      }
    }
    
    // Search line by line
    for (let i = startLine; i <= endLine; i++) {
      const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
      
      if (line.includes(searchQuery)) {
        // Get context
        const contextStart = Math.max(startLine, i - contextLines);
        const contextEnd = Math.min(endLine, i + contextLines);
        
        // Find which section this line belongs to
        const containingSection = this.findSectionForLine(structure.sections, i);
        
        results.push({
          lineNumber: i,
          context: lines.slice(contextStart, contextEnd + 1).join('\n'),
          exactMatch: lines[i],
          sectionId: containingSection?.id,
        });
      }
    }
    
    return results;
  }

  getDocumentInfo(docId: string): {
    structure: ReturnType<V2DocumentStore['loadStructure']>;
    totalLines: number;
    totalWords: number;
  } {
    const structure = this.store.loadStructure(docId);
    const markdown = this.store.loadMarkdown(docId);
    const lines = markdown.split('\n');
    const words = markdown.split(/\s+/).filter(w => w.length > 0).length;
    
    return {
      structure,
      totalLines: lines.length,
      totalWords: words,
    };
  }

  listSections(docId: string, level?: number, parentId?: string): SectionNode[] {
    const structure = this.store.loadStructure(docId);
    
    if (parentId) {
      const parent = this.extractor.findSectionById(structure.sections, parentId);
      if (parent) {
        return level !== undefined 
          ? parent.children.filter(c => c.level === level)
          : parent.children;
      }
      return [];
    }
    
    const allSections = this.extractor.getAllSections(structure.sections);
    
    if (level !== undefined) {
      return allSections.filter(s => s.level === level);
    }
    
    return allSections;
  }

  private resolveReadOptions(options: ReadSectionOptions): Required<ReadSectionOptions> {
    return {
      docId: options.docId,
      sectionId: options.sectionId,
      includeChildren: options.includeChildren ?? false,
      maxLines: options.maxLines ?? 0,
      maxTokens: options.maxTokens ?? 0,
    };
  }

  private findLastDescendant(section: SectionNode): SectionNode {
    if (section.children.length === 0) {
      return section;
    }
    return this.findLastDescendant(section.children[section.children.length - 1]);
  }

  private findSectionForLine(sections: SectionNode[], lineNum: number): SectionNode | null {
    for (const section of sections) {
      if (lineNum >= section.startLine && lineNum <= section.endLine) {
        // Check children first (more specific)
        const childMatch = this.findSectionForLine(section.children, lineNum);
        if (childMatch) {
          return childMatch;
        }
        return section;
      }
    }
    return null;
  }

  private limitByTokens(content: string, maxTokens: number): string {
    // Rough approximation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) {
      return content;
    }
    return content.substring(0, maxChars) + '\n... [content truncated]';
  }
}
