import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Chunk } from './chunker.js';

export interface Document {
  id: string;
  filename: string;
  filepath: string;
  filetype: string;
  title: string | null;
  total_chunks: number;
  total_tokens: number;
  ingested_at: string;
  metadata: string;
}

export interface SearchResult {
  id: string;
  docId: string;
  index: number;
  text: string;
  section?: string;
  score: number;
}

export interface Entity {
  id: number;
  name: string;
  type: string;
  description: string | null;
  doc_id: string;
  chunk_ids: string;
  metadata: string;
}

export interface Relationship {
  id: number;
  source_entity_id: number;
  target_entity_id: number;
  relationship: string;
  weight: number;
  doc_id: string;
  chunk_id: string | null;
  metadata: string;
}

export interface SearchOptions {
  limit?: number;
  docId?: string;
}

export class DocumentStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.kw-os', 'documents.db');
    const finalPath = dbPath || defaultPath;
    
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(finalPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        filepath TEXT,
        filetype TEXT,
        title TEXT,
        total_chunks INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        ingested_at TEXT DEFAULT (datetime('now')),
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        start_offset INTEGER,
        end_offset INTEGER,
        section TEXT,
        page_number INTEGER,
        token_count INTEGER,
        metadata TEXT DEFAULT '{}',
        UNIQUE(doc_id, chunk_index)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        section,
        content='chunks',
        content_rowid='rowid'
      );

      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        embedding BLOB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        chunk_ids TEXT,
        metadata TEXT DEFAULT '{}',
        UNIQUE(name, type, doc_id)
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
        target_entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
        relationship TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        chunk_id TEXT,
        metadata TEXT DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
      CREATE INDEX IF NOT EXISTS idx_entities_doc ON entities(doc_id);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
    `);
  }

  insertDocument(doc: Omit<Document, 'ingested_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO documents (id, filename, filepath, filetype, title, total_chunks, total_tokens, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(doc.id, doc.filename, doc.filepath, doc.filetype, doc.title, doc.total_chunks, doc.total_tokens, doc.metadata);
  }

  insertChunk(chunk: Chunk): void {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, doc_id, chunk_index, text, start_offset, end_offset, section, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      chunk.id,
      chunk.docId,
      chunk.index,
      chunk.text,
      chunk.startOffset,
      chunk.endOffset,
      chunk.metadata.section || null,
      JSON.stringify(chunk.metadata)
    );

    const ftsStmt = this.db.prepare(`
      INSERT INTO chunks_fts (rowid, text, section)
      VALUES ((SELECT rowid FROM chunks WHERE id = ?), ?, ?)
    `);
    ftsStmt.run(chunk.id, chunk.text, chunk.metadata.section || '');
  }

  insertEmbedding(chunkId: string, embedding: number[]): void {
    // Try to insert, if table schema doesn't match, just skip
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
        VALUES (?, ?)
      `);
      const buffer = Buffer.from(new Float32Array(embedding).buffer);
      stmt.run(chunkId, buffer);
    } catch (error) {
      // Table might have different schema, skip embedding storage
      console.warn(`Failed to store embedding: ${error}`);
    }
  }

  insertEntity(entity: Omit<Entity, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO entities (name, type, description, doc_id, chunk_ids, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(entity.name, entity.type, entity.description, entity.doc_id, entity.chunk_ids, entity.metadata);
    return result.lastInsertRowid as number;
  }

  getDocument(id: string): Document | undefined {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    return stmt.get(id) as Document | undefined;
  }

  listDocuments(): Document[] {
    const stmt = this.db.prepare('SELECT * FROM documents ORDER BY ingested_at DESC');
    return stmt.all() as Document[];
  }

  getChunks(docId: string): Array<Chunk & { rowid: number }> {
    const stmt = this.db.prepare('SELECT *, rowid FROM chunks WHERE doc_id = ? ORDER BY chunk_index');
    const rows = stmt.all(docId) as Array<{
      id: string;
      doc_id: string;
      chunk_index: number;
      text: string;
      start_offset: number;
      end_offset: number;
      section: string | null;
      metadata: string;
      rowid: number;
    }>;
    
    return rows.map(row => ({
      id: row.id,
      docId: row.doc_id,
      index: row.chunk_index,
      text: row.text,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      metadata: {
        section: row.section || undefined,
        ...JSON.parse(row.metadata),
      },
      rowid: row.rowid,
    }));
  }

  async vectorSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    return [];
  }

  keywordSearch(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit || 10;
    
    // FTS5 best practices: use double quotes for phrases, escape internal quotes
    const escapeForFTS5 = (text: string): string => {
      // Replace double quotes with escaped double quotes
      return text.replace(/"/g, '""');
    };
    
    // Split query into terms and build FTS5 query
    const terms = query
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 0);
    
    let ftsQuery: string;
    if (terms.length === 1) {
      // Single term - use prefix search for partial matches
      ftsQuery = `"${escapeForFTS5(terms[0])}"*`;
    } else if (terms.length <= 3) {
      // Short phrase - use exact phrase search
      ftsQuery = `"${escapeForFTS5(query.trim())}"`;
    } else {
      // Longer query - use AND search for all terms
      ftsQuery = terms.map(term => `"${escapeForFTS5(term)}"*`).join(' AND ');
    }
    
    let sql: string;
    let params: (string | number)[];
    
    try {
      if (options.docId) {
        sql = `
          SELECT c.id, c.doc_id, c.chunk_index, c.text, c.section,
                 bm25(chunks_fts) as score
          FROM chunks_fts
          JOIN chunks c ON chunks_fts.rowid = c.rowid
          WHERE chunks_fts MATCH ? AND c.doc_id = ?
          ORDER BY score
          LIMIT ?
        `;
        params = [ftsQuery, options.docId, limit];
      } else {
        sql = `
          SELECT c.id, c.doc_id, c.chunk_index, c.text, c.section,
                 bm25(chunks_fts) as score
          FROM chunks_fts
          JOIN chunks c ON chunks_fts.rowid = c.rowid
          WHERE chunks_fts MATCH ?
          ORDER BY score
          LIMIT ?
        `;
        params = [ftsQuery, limit];
      }
      
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as Array<{
        id: string;
        doc_id: string;
        chunk_index: number;
        text: string;
        section: string | null;
        score: number;
      }>;
      
      return rows.map(row => ({
        id: row.id,
        docId: row.doc_id,
        index: row.chunk_index,
        text: row.text,
        section: row.section || undefined,
        score: 1 / (1 + Math.abs(row.score)),
      }));
    } catch (error) {
      console.error(`FTS search error: ${error}`);
      return [];
    }
  }

  async hybridSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Try keyword search first
    const keywordResults = this.keywordSearch(query, options);
    
    // If we got results, return them
    if (keywordResults.length > 0) {
      return keywordResults;
    }
    
    // Fallback: simple substring matching
    console.log(`Keyword search returned 0 results, using fallback search for: "${query}"`);
    return this.fallbackSearch(query, options);
  }

  private fallbackSearch(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit || 10;
    const docId = options.docId;
    
    // Get all chunks for the document
    let chunks: Array<Chunk & { rowid: number }>;
    if (docId) {
      chunks = this.getChunks(docId);
    } else {
      // Get all chunks from all documents
      const allDocs = this.listDocuments();
      chunks = [];
      for (const doc of allDocs) {
        chunks.push(...this.getChunks(doc.id));
      }
    }
    
    // Extract search terms from query
    const terms = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 3);
    
    // Score chunks based on term matches
    const scoredChunks = chunks.map(chunk => {
      const text = chunk.text.toLowerCase();
      let score = 0;
      
      for (const term of terms) {
        if (text.includes(term)) {
          score += 1;
          // Bonus for multiple occurrences
          const matches = (text.match(new RegExp(term, 'g')) || []).length;
          score += matches * 0.5;
        }
      }
      
      return { chunk, score };
    });
    
    // Sort by score and return top results
    return scoredChunks
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        id: item.chunk.id,
        docId: item.chunk.docId,
        index: item.chunk.index,
        text: item.chunk.text,
        section: item.chunk.metadata.section,
        score: item.score,
      }));
  }

  getEntities(docId?: string, type?: string): Entity[] {
    let sql = 'SELECT * FROM entities WHERE 1=1';
    const params: (string | number)[] = [];
    
    if (docId) {
      sql += ' AND doc_id = ?';
      params.push(docId);
    }
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY name';
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Entity[];
  }

  getRelationships(entityId: number): Relationship[] {
    const stmt = this.db.prepare(`
      SELECT * FROM relationships 
      WHERE source_entity_id = ? OR target_entity_id = ?
    `);
    return stmt.all(entityId, entityId) as Relationship[];
  }

  deleteDocument(docId: string): void {
    const stmt = this.db.prepare('DELETE FROM documents WHERE id = ?');
    stmt.run(docId);
  }

  close(): void {
    this.db.close();
  }
}
