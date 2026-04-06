/// <reference lib="dom" />

export interface EmbedderConfig {
  provider: 'ollama' | 'llamacpp' | 'transformers';
  model: string;
  dimensions: number;
  batchSize: number;
  baseUrl: string;
}

export class LocalEmbedder {
  config: EmbedderConfig;

  constructor(config?: Partial<EmbedderConfig>) {
    this.config = {
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
      batchSize: 32,
      baseUrl: 'http://localhost:11434',
      ...config,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    switch (this.config.provider) {
      case 'ollama':
        return this.embedViaOllama(texts);
      case 'llamacpp':
        return this.embedViaLlamaCpp(texts);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }

  private async embedViaOllama(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      
      for (const text of batch) {
        try {
          const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              model: this.config.model, 
              prompt: text.substring(0, 8000),
            }),
          });
          
          if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
          }
          
          const data = await response.json() as { embedding: number[] };
          results.push(data.embedding);
        } catch (error) {
          console.error(`Failed to embed text: ${error}`);
          results.push(new Array(this.config.dimensions).fill(0));
        }
      }
    }
    
    return results;
  }

  private async embedViaLlamaCpp(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (const text of texts) {
      try {
        const response = await fetch(`${this.config.baseUrl}/embedding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text.substring(0, 8000) }),
        });
        
        if (!response.ok) {
          throw new Error(`llama.cpp error: ${response.status}`);
        }
        
        const data = await response.json() as { embedding: number[] };
        results.push(data.embedding);
      } catch (error) {
        console.error(`Failed to embed text: ${error}`);
        results.push(new Array(this.config.dimensions).fill(0));
      }
    }
    
    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (this.config.provider === 'ollama') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const resp = await fetch(`${this.config.baseUrl}/api/tags`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (!resp.ok) return false;
        
        const data = await resp.json() as { models?: Array<{ name: string }> };
        return data.models?.some((m: { name: string }) => 
          m.name.includes(this.config.model) || 
          m.name.includes(this.config.model.split(':')[0])
        ) ?? false;
      }
      return false;
    } catch {
      return false;
    }
  }

  async ensureModel(): Promise<void> {
    if (this.config.provider === 'ollama') {
      try {
        await fetch(`${this.config.baseUrl}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.config.model }),
        });
      } catch (error) {
        console.error(`Failed to pull model: ${error}`);
      }
    }
  }
}
