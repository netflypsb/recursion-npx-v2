export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'org' | 'location' | 'concept' | 'date' | 'money' | 'product' | 'event' | string;
  description: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  relationship: string;
  context: string;
}

export async function extractEntitiesFromChunk(
  chunkText: string,
  docContext: string,
  llmClient: LLMClient
): Promise<EntityExtractionResult> {
  const prompt = `
Extract all named entities and their relationships from this text.
Document context: ${docContext}

Text:
${chunkText}

Return JSON:
{
  "entities": [
    {"name": "...", "type": "person|org|location|concept|date|money|product|event", "description": "brief description"}
  ],
  "relationships": [
    {"source": "entity name", "target": "entity name", "relationship": "verb phrase", "context": "brief context"}
  ]
}
`;

  const response = await llmClient.complete(prompt);
  return parseEntityExtractionResponse(response);
}

export function parseEntityExtractionResponse(response: string): EntityExtractionResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
      };
    }
  } catch {
    // Fall through to return empty result
  }
  
  return { entities: [], relationships: [] };
}

export function mergeEntities(
  existing: ExtractedEntity[],
  extracted: ExtractedEntity[]
): ExtractedEntity[] {
  const merged = [...existing];
  
  for (const newEntity of extracted) {
    const normalizedName = normalizeEntityName(newEntity.name);
    const existingIndex = merged.findIndex(e => 
      normalizeEntityName(e.name) === normalizedName && e.type === newEntity.type
    );
    
    if (existingIndex === -1) {
      merged.push(newEntity);
    } else if (newEntity.description.length > merged[existingIndex].description.length) {
      merged[existingIndex].description = newEntity.description;
    }
  }
  
  return merged;
}

function normalizeEntityName(name: string): string {
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
