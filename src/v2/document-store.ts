/**
 * V2 Document Store
 * Manages file system storage of documents with navigable structure
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import type { V2Document, DocumentStructure, SectionNode, AnalysisEntry } from './types.js';

const V2_STORAGE_DIR = path.join(os.homedir(), '.kw-os', 'v2');

export class V2DocumentStore {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || V2_STORAGE_DIR;
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    const docsDir = path.join(this.storageDir, 'documents');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
  }

  getDocumentDir(docId: string): string {
    return path.join(this.storageDir, 'documents', docId);
  }

  createDocument(docId: string): string {
    const docDir = this.getDocumentDir(docId);
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
      fs.mkdirSync(path.join(docDir, 'analysis'), { recursive: true });
      fs.mkdirSync(path.join(docDir, 'analysis', 'sections'), { recursive: true });
    }
    return docDir;
  }

  saveMarkdown(docId: string, markdown: string): string {
    const docDir = this.getDocumentDir(docId);
    const markdownPath = path.join(docDir, 'document.md');
    fs.writeFileSync(markdownPath, markdown, 'utf-8');
    return markdownPath;
  }

  saveStructure(docId: string, structure: DocumentStructure): void {
    const docDir = this.getDocumentDir(docId);
    const structurePath = path.join(docDir, 'structure.json');
    fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2), 'utf-8');
  }

  saveIndex(docId: string, index: Record<string, any>): void {
    const docDir = this.getDocumentDir(docId);
    const indexPath = path.join(docDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  loadMarkdown(docId: string): string {
    const markdownPath = path.join(this.getDocumentDir(docId), 'document.md');
    if (!fs.existsSync(markdownPath)) {
      throw new Error(`Document not found: ${docId}`);
    }
    return fs.readFileSync(markdownPath, 'utf-8');
  }

  loadStructure(docId: string): DocumentStructure {
    const structurePath = path.join(this.getDocumentDir(docId), 'structure.json');
    if (!fs.existsSync(structurePath)) {
      throw new Error(`Structure not found for document: ${docId}`);
    }
    return JSON.parse(fs.readFileSync(structurePath, 'utf-8')) as DocumentStructure;
  }

  saveAnalysis(docId: string, analysis: AnalysisEntry): void {
    const analysisDir = path.join(this.getDocumentDir(docId), 'analysis');
    let analysisPath: string;
    
    if (analysis.sectionId === 'full') {
      analysisPath = path.join(analysisDir, `${analysis.analysisType}.json`);
    } else {
      analysisPath = path.join(analysisDir, 'sections', `${analysis.sectionId}-${analysis.analysisType}.json`);
    }
    
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf-8');
  }

  loadAnalysis(docId: string, sectionId: string, analysisType: string): AnalysisEntry | null {
    const analysisDir = path.join(this.getDocumentDir(docId), 'analysis');
    let analysisPath: string;
    
    if (sectionId === 'full') {
      analysisPath = path.join(analysisDir, `${analysisType}.json`);
    } else {
      analysisPath = path.join(analysisDir, 'sections', `${sectionId}-${analysisType}.json`);
    }
    
    if (!fs.existsSync(analysisPath)) {
      return null;
    }
    
    return JSON.parse(fs.readFileSync(analysisPath, 'utf-8')) as AnalysisEntry;
  }

  listAnalyses(docId: string): AnalysisEntry[] {
    const analysisDir = path.join(this.getDocumentDir(docId), 'analysis');
    const analyses: AnalysisEntry[] = [];
    
    // Load document-level analyses
    if (fs.existsSync(analysisDir)) {
      const files = fs.readdirSync(analysisDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(analysisDir, file), 'utf-8');
        analyses.push(JSON.parse(content));
      }
    }
    
    // Load section-level analyses
    const sectionsDir = path.join(analysisDir, 'sections');
    if (fs.existsSync(sectionsDir)) {
      const files = fs.readdirSync(sectionsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(sectionsDir, file), 'utf-8');
        analyses.push(JSON.parse(content));
      }
    }
    
    return analyses;
  }

  listDocuments(): string[] {
    const docsDir = path.join(this.storageDir, 'documents');
    if (!fs.existsSync(docsDir)) {
      return [];
    }
    return fs.readdirSync(docsDir).filter(id => {
      const docDir = path.join(docsDir, id);
      return fs.statSync(docDir).isDirectory();
    });
  }

  deleteDocument(docId: string): boolean {
    const docDir = this.getDocumentDir(docId);
    if (fs.existsSync(docDir)) {
      fs.rmSync(docDir, { recursive: true });
      return true;
    }
    return false;
  }
}
