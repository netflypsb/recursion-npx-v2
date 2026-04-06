/**
 * Structure Extractor
 * Extracts hierarchical document structure from markdown
 */

import type { DocumentStructure, SectionNode } from './types.js';

export class StructureExtractor {
  extract(markdown: string): DocumentStructure {
    const lines = markdown.split('\n');
    const sections: SectionNode[] = [];
    const sectionStack: SectionNode[] = [];
    
    let currentSection: SectionNode | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        const level = headerMatch[1].length;
        const title = headerMatch[2].trim();
        
        // Close previous section at this level
        if (currentSection) {
          currentSection.endLine = i - 1;
          currentSection.wordCount = this.countWords(
            lines.slice(currentSection.startLine, currentSection.endLine + 1).join('\n')
          );
        }
        
        // Create new section
        const newSection: SectionNode = {
          id: this.generateSectionId(level, title, i),
          level,
          title,
          startLine: i,
          endLine: -1, // Will be set later
          children: [],
        };
        
        // Find parent
        if (level === 1 || sectionStack.length === 0) {
          sections.push(newSection);
        } else {
          // Find parent at level - 1
          let parent: SectionNode | null = null;
          for (let j = sectionStack.length - 1; j >= 0; j--) {
            if (sectionStack[j].level < level) {
              parent = sectionStack[j];
              break;
            }
          }
          
          if (parent) {
            newSection.parentId = parent.id;
            parent.children.push(newSection);
          } else {
            sections.push(newSection);
          }
        }
        
        // Update stack
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
          sectionStack.pop();
        }
        sectionStack.push(newSection);
        
        currentSection = newSection;
      }
    }
    
    // Close final section
    if (currentSection) {
      currentSection.endLine = lines.length - 1;
      currentSection.wordCount = this.countWords(
        lines.slice(currentSection.startLine, currentSection.endLine + 1).join('\n')
      );
    }
    
    const maxDepth = this.calculateMaxDepth(sections);
    
    return {
      title: this.extractTitle(markdown) || 'Untitled Document',
      sections,
      outline: this.generateOutline(sections),
      totalSections: this.countAllSections(sections),
      maxDepth,
    };
  }
  
  private extractTitle(markdown: string): string | null {
    // Try to find H1
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }
    
    // Try first line that's not empty
    const lines = markdown.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.substring(0, 100);
      }
    }
    
    return null;
  }
  
  private generateSectionId(level: number, title: string, lineNum: number): string {
    const safeTitle = title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    return `${level}-${safeTitle}-${lineNum}`;
  }
  
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }
  
  private calculateMaxDepth(sections: SectionNode[]): number {
    let maxDepth = 0;
    const traverse = (nodes: SectionNode[], depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      for (const node of nodes) {
        traverse(node.children, depth + 1);
      }
    };
    traverse(sections, 1);
    return maxDepth;
  }
  
  private countAllSections(sections: SectionNode[]): number {
    let count = 0;
    const traverse = (nodes: SectionNode[]) => {
      for (const node of nodes) {
        count++;
        traverse(node.children);
      }
    };
    traverse(sections);
    return count;
  }
  
  private generateOutline(sections: SectionNode[], indent = 0): string {
    let outline = '';
    for (const section of sections) {
      const prefix = '  '.repeat(indent);
      outline += `${prefix}${'#'.repeat(section.level)} ${section.title}\n`;
      if (section.children.length > 0) {
        outline += this.generateOutline(section.children, indent + 1);
      }
    }
    return outline;
  }
  
  findSectionById(sections: SectionNode[], id: string): SectionNode | null {
    for (const section of sections) {
      if (section.id === id) {
        return section;
      }
      const found = this.findSectionById(section.children, id);
      if (found) {
        return found;
      }
    }
    return null;
  }
  
  getAllSections(sections: SectionNode[]): SectionNode[] {
    const all: SectionNode[] = [];
    const traverse = (nodes: SectionNode[]) => {
      for (const node of nodes) {
        all.push(node);
        traverse(node.children);
      }
    };
    traverse(sections);
    return all;
  }
}
