import { failFromResponse, parseJson, type AiProvider, type GenerateOptions, type JsonSchema } from "./types";

export class GeminiProvider implements AiProvider {
  readonly name = "Gemini";
  constructor(private readonly apiKey: string, readonly model = "gemini-3.5-flash-lite") {}

  async generateJson<T>(prompt: string, schema: JsonSchema, options: GenerateOptions = {}): Promise<T> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.85,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
          // Gemini honours propertyOrdering, so fields are emitted in schema order (reason before clue).
          responseJsonSchema: { ...schema, propertyOrdering: Object.keys(schema.properties) }
        }
      })
    });
    if (!response.ok) await failFromResponse(response, this.name);
    const payload = await response.json<any>();
    return parseJson<T>(payload?.candidates?.[0]?.content?.parts?.[0]?.text, this.name);
  }
}
