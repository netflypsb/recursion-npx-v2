import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { chunkDocument, type Chunk } from './chunker.js';
import { DocumentStore } from './store.js';
import { LocalEmbedder } from './embedder.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface IngestOptions {
  title?: string;
  store: DocumentStore;
  embedder: LocalEmbedder;
}

export async function ingestDocument(
  filePath: string,
  options: IngestOptions
): Promise<string> {
  const { title, store, embedder } = options;
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  const docId = uuidv4();

  let text: string;
  let filetype: string;

  switch (ext) {
    case '.pdf':
      text = await extractPdf(filePath);
      filetype = 'pdf';
      break;
    case '.docx':
    case '.doc':
      text = await extractDocx(filePath);
      filetype = 'docx';
      break;
    case '.xlsx':
    case '.xls':
    case '.csv':
      text = await extractSpreadsheet(filePath);
      filetype = 'spreadsheet';
      break;
    case '.md':
    case '.markdown':
      text = fs.readFileSync(filePath, 'utf-8');
      filetype = 'markdown';
      break;
    case '.txt':
    case '.text':
      text = fs.readFileSync(filePath, 'utf-8');
      filetype = 'text';
      break;
    case '.html':
    case '.htm':
      text = fs.readFileSync(filePath, 'utf-8');
      filetype = 'html';
      break;
    case '.json':
      text = fs.readFileSync(filePath, 'utf-8');
      filetype = 'json';
      break;
    default:
      text = fs.readFileSync(filePath, 'utf-8');
      filetype = 'unknown';
  }

  const chunks = chunkDocument(text, docId);
  const totalTokens = Math.round(text.length / 4);

  store.insertDocument({
    id: docId,
    filename,
    filepath: filePath,
    filetype,
    title: title || filename,
    total_chunks: chunks.length,
    total_tokens: totalTokens,
    metadata: JSON.stringify({ ingested_by: 'recursion-mcp' }),
  });

  for (const chunk of chunks) {
    store.insertChunk(chunk);
  }

  const ollamaAvailable = await embedder.isAvailable();
  if (ollamaAvailable) {
    try {
      const chunkTexts = chunks.map(c => c.text);
      const embeddings = await embedder.embed(chunkTexts);
      
      for (let i = 0; i < chunks.length; i++) {
        store.insertEmbedding(chunks[i].id, embeddings[i]);
      }
    } catch (error) {
      console.error(`Failed to generate embeddings: ${error}`);
    }
  }

  return docId;
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractSpreadsheet(filePath: string): Promise<string> {
  const workbook = XLSX.readFile(filePath);
  let text = '';
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `\n=== Sheet: ${sheetName} ===\n${csv}\n`;
  }
  
  return text;
}
