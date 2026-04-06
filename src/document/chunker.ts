import type Database from 'better-sqlite3';

export interface ChunkOptions {
  maxChunkSize: number;
  overlapSize: number;
  respectBoundaries: boolean;
}

export interface Chunk {
  id: string;
  docId: string;
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  metadata: {
    section?: string;
    page?: number;
    type?: 'text' | 'table' | 'code' | 'list' | 'heading';
  };
}

const defaultOptions: ChunkOptions = {
  maxChunkSize: 4000,
  overlapSize: 800,
  respectBoundaries: true,
};

export function chunkDocument(
  text: string,
  docId: string,
  options: Partial<ChunkOptions> = {}
): Chunk[] {
  const opts = { ...defaultOptions, ...options };
  const chunks: Chunk[] = [];
  
  let remaining = text;
  let offset = 0;
  let index = 0;
  let currentSection: string | undefined;

  while (remaining.length > 0) {
    let chunkText: string;
    let chunkLength: number;

    if (remaining.length <= opts.maxChunkSize) {
      chunkText = remaining;
      chunkLength = remaining.length;
      remaining = '';
    } else {
      let splitPoint = opts.maxChunkSize;

      if (opts.respectBoundaries) {
        const boundary = findBestBoundary(remaining, opts.maxChunkSize);
        if (boundary > opts.maxChunkSize * 0.7) {
          splitPoint = boundary;
        }
      }

      chunkText = remaining.substring(0, splitPoint);
      chunkLength = splitPoint;
      remaining = remaining.substring(splitPoint - opts.overlapSize);
      offset += splitPoint - opts.overlapSize;
    }

    const chunkType = detectChunkType(chunkText);
    if (chunkType === 'heading') {
      currentSection = chunkText.replace(/^#+\s*/, '').trim().substring(0, 100);
    }

    chunks.push({
      id: `${docId}-chunk-${index}`,
      docId,
      index,
      text: chunkText,
      startOffset: offset,
      endOffset: offset + chunkLength,
      metadata: {
        section: currentSection,
        type: chunkType,
      },
    });

    index++;
  }

  return chunks;
}

function findBestBoundary(text: string, maxPos: number): number {
  const boundaries = [
    /\n\n#{1,6}\s/m,
    /\n\n[-=]{3,}\s*\n/m,
    /\n{2,}/m,
    /\n/m,
    /[.!?]\s+/m,
    /[,;]\s+/m,
    /\s+/m,
  ];

  for (const pattern of boundaries) {
    let match;
    const regex = new RegExp(pattern.source, 'gm');
    let lastMatch = -1;
    
    while ((match = regex.exec(text)) !== null) {
      if (match.index > maxPos) break;
      lastMatch = match.index;
    }
    
    if (lastMatch > maxPos * 0.5) {
      return lastMatch;
    }
  }

  const lastSpace = text.lastIndexOf(' ', maxPos);
  return lastSpace > maxPos * 0.5 ? lastSpace : maxPos;
}

function detectChunkType(text: string): Chunk['metadata']['type'] {
  const trimmed = text.trim();
  
  if (/^#{1,6}\s/.test(trimmed)) return 'heading';
  if (/^\|[-:]/.test(trimmed) || /^\|[\s\w|]+\|/.test(trimmed)) return 'table';
  if (/^```|^\s{4}/.test(trimmed)) return 'code';
  if (/^\s*[-*+]\s|^\s*\d+[.)]\s/m.test(trimmed)) return 'list';
  
  return 'text';
}
