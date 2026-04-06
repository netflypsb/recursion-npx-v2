export interface RLMConfig {
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  maxDepth: number;
  maxIterations: number;
  timeout: number;
}

export interface RLMResult {
  answer: string;
  iterations: number;
  trajectory: Array<{ role: string; content: string }>;
}

export interface AnalyzeOptions {
  maxDepth?: number;
  maxIterations?: number;
}

const defaultConfig: RLMConfig = {
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3.5:2b',
  maxDepth: 1,
  maxIterations: 20,
  timeout: 300000,
};

export class RLMEngine {
  private config: RLMConfig;

  constructor(config?: Partial<RLMConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  async analyze(
    query: string,
    context: string,
    options?: AnalyzeOptions
  ): Promise<RLMResult> {
    const maxIterations = options?.maxIterations ?? this.config.maxIterations;
    
    const messages: Array<{ role: string; content: string }> = [
      { 
        role: 'system', 
        content: this.buildSystemPrompt() 
      },
      { 
        role: 'user', 
        content: this.buildUserPrompt(query, context) 
      },
    ];

    let iteration = 0;
    let answer: string | null = null;

    while (iteration < maxIterations) {
      const response = await this.callRootLLM(messages);
      
      const finalAnswer = this.parseFinalAnswer(response);
      if (finalAnswer) {
        answer = finalAnswer;
        messages.push({ role: 'assistant', content: response });
        break;
      }

      const codeResult = this.executeCode(response, context);
      messages.push(
        { role: 'assistant', content: response },
        { role: 'user', content: `Result: ${codeResult}` }
      );

      iteration++;
    }

    if (!answer) {
      answer = 'Analysis incomplete: max iterations reached.';
    }

    return {
      answer,
      iterations: iteration + 1,
      trajectory: messages,
    };
  }

  private buildSystemPrompt(): string {
    return `You are a Recursive Language Model analyzing a large document.

You have access to a Python variable 'context' containing the full document text.

You can:
1. Write Python code to explore the context (e.g., context[:500], context.find("term"), len(context))
2. Provide a direct answer using FINAL(your comprehensive answer here)

IMPORTANT: 
- If writing code, only output the code line (e.g., context[:1000])
- If providing an answer, use FINAL(your detailed answer)
- Be thorough in your analysis

Example code: context.find("maqasid")
Example answer: FINAL(The main topic is...)`;
  }

  private buildUserPrompt(query: string, context: string): string {
    return `Analyze this document to answer: ${query}

The document is in variable 'context' with ${context.length} characters.

First, explore the document by writing Python code (e.g., context[:500] to peek at the beginning).
After exploring, provide your answer using FINAL(your comprehensive answer).

Start by exploring:`; 
  }

  private async callRootLLM(messages: Array<{ role: string; content: string }>): Promise<string> {
    try {
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ollamaModel,
          prompt: `${prompt}\n\nGenerate Python code to explore the context or provide FINAL(answer):`,
          stream: false,
          options: {
            num_predict: 1024,
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json() as { response: string };
      return data.response.trim();
    } catch (error) {
      console.error(`RLM LLM call failed: ${error}`);
      // Fallback: return a simple slice operation
      return 'context[:1000]';
    }
  }

  private parseFinalAnswer(response: string): string | null {
    // Try to extract FINAL() content
    const finalMatch = response.match(/FINAL\((.*?)\)/s);
    if (finalMatch) {
      return finalMatch[1].trim();
    }
    
    // If no FINAL(), check if response looks like an answer (not code)
    const trimmed = response.trim();
    if (trimmed.length > 50 && !trimmed.includes('context[') && !trimmed.includes('context.')) {
      return trimmed;
    }
    
    return null;
  }

  private executeCode(code: string, context: string): string {
    const sliceMatch = code.match(/context\[(\d*):(\d*)\]/);
    if (sliceMatch) {
      const start = parseInt(sliceMatch[1]) || 0;
      const end = parseInt(sliceMatch[2]) || context.length;
      return context.substring(start, end);
    }

    const lenMatch = code.match(/len\(context\)/);
    if (lenMatch) {
      return String(context.length);
    }

    const findMatch = code.match(/context\.find\("([^"]+)"\)/);
    if (findMatch) {
      const pos = context.indexOf(findMatch[1]);
      return pos >= 0 ? String(pos) : 'Not found';
    }

    const countMatch = code.match(/context\.count\("([^"]+)"\)/);
    if (countMatch) {
      const count = (context.match(new RegExp(countMatch[1], 'g')) || []).length;
      return String(count);
    }

    const splitMatch = code.match(/context\.split\("([^"]+)"\)\[(\d+)\]/);
    if (splitMatch) {
      const parts = context.split(splitMatch[1]);
      const index = parseInt(splitMatch[2]);
      return parts[index] || 'Index out of range';
    }

    return 'Executed';
  }
}
