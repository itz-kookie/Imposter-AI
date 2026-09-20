import { failFromResponse, parseJson, type AiProvider, type GenerateOptions, type JsonSchema } from "./types";

export interface OpenAICompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Works with any chat-completions API that accepts response_format json_schema:
// Mistral, Groq, OpenAI, OpenRouter, NVIDIA NIM, and most self-hosted gateways.
export class OpenAICompatibleProvider implements AiProvider {
  readonly name: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
  }

  async generateJson<T>(prompt: string, schema: JsonSchema, options: GenerateOptions = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: options.temperature ?? 0.85,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: { name: "response", strict: true, schema } }
      })
    });
    if (!response.ok) await failFromResponse(response, this.name);
    const payload = await response.json<any>();
    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : undefined;
    return parseJson<T>(text, this.name);
  }
}
