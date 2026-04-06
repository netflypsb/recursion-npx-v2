import { DocumentStore, type SearchResult } from './store.js';
import { LocalEmbedder, type EmbedderConfig } from './embedder.js';

export interface RAGConfig {
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface QueryOptions {
  topK?: number;
  docId?: string;
  contextChunks?: number;
}

export interface RAGResult {
  answer: string;
  sources: Array<{
    docId: string;
    chunkId: string;
    section?: string;
    relevance: number;
  }>;
  entities: string[];
}

export class RAGQueryEngine {
  private store: DocumentStore;
  private embedder: LocalEmbedder;
  private config: RAGConfig;

  constructor(store: DocumentStore, embedder: LocalEmbedder, config: RAGConfig = {}) {
    this.store = store;
    this.embedder = embedder;
    this.config = {
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'qwen3.5:2b',
      maxTokens: 2048,
      temperature: 0.7,
      ...config,
    };
  }

  async query(
    question: string,
    options: QueryOptions = {}
  ): Promise<RAGResult> {
    const topK = options.topK ?? 5;
    const contextChunks = options.contextChunks ?? 5;

    const searchResults = await this.store.hybridSearch(question, {
      limit: topK,
      docId: options.docId,
    });

    const uniqueChunks = deduplicateChunks(searchResults);
    const contextChunks_ = uniqueChunks.slice(0, contextChunks);

    const context = contextChunks_
      .map(c => `[${c.section || 'Section ' + c.index}]\n${c.text}`)
      .join('\n\n---\n\n');

    const answer = await this.generateAnswer(question, context);

    const sources = contextChunks_.map(c => ({
      docId: c.docId,
      chunkId: c.id,
      section: c.section,
      relevance: c.score,
    }));

    const entities = this.extractMentionedEntities(context, question);

    return {
      answer,
      sources,
      entities,
    };
  }

  private async generateAnswer(question: string, context: string): Promise<string> {
    try {
      const prompt = `You are a helpful assistant answering questions based on the provided document context.

Context:
${context}

Question: ${question}

Answer the question based ONLY on the provided context. If the context doesn't contain enough information to answer the question, say so. Be concise and direct.`;

      const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ollamaModel,
          prompt,
          stream: false,
          options: {
            num_predict: this.config.maxTokens,
            temperature: this.config.temperature,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json() as { response: string };
      return data.response.trim();
    } catch (error) {
      console.error(`Failed to generate answer with Ollama: ${error}`);
      return `Based on the retrieved context, I can address the question. The context contains ${context.length} characters from relevant document sections. However, I was unable to generate a full answer using the LLM. Please check that Ollama is running and the model is available.`;
    }
  }

  private extractMentionedEntities(context: string, question: string): string[] {
    const commonEntityTypes = ['person', 'org', 'location', 'concept'];
    return commonEntityTypes.filter(type => 
      context.toLowerCase().includes(type) || question.toLowerCase().includes(type)
    );
  }
}

function deduplicateChunks(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export function reciprocalRankFusion(
  ...resultSets: SearchResult[][]
): SearchResult[] {
  const k = 60;
  const scores = new Map<string, number>();
  const allResults = new Map<string, SearchResult>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      allResults.set(result.id, result);
      const current = scores.get(result.id) || 0;
      scores.set(result.id, current + 1 / (k + rank + 1));
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({
      ...allResults.get(id)!,
      score,
    }));
}
