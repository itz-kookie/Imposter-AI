// A provider turns a prompt into a JSON object that matches the given schema.
// To add a provider: implement this interface in a new file and register it in ./index.ts.
export interface AiProvider {
  /** Human readable name, used in health output and logs. */
  readonly name: string;
  /** Model identifier actually in use. */
  readonly model: string;
  generateJson<T>(prompt: string, schema: JsonSchema, options?: GenerateOptions): Promise<T>;
}

export interface GenerateOptions {
  /** 0 = deterministic, 1 = creative. Defaults to 0.85. */
  temperature?: number;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; enum?: string[] }>;
  required: string[];
  additionalProperties: false;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export function parseJson<T>(text: string | undefined, provider: string): T {
  if (!text) throw new ProviderError(`${provider} returned an empty response`);
  try { return JSON.parse(text) as T; }
  catch {
    console.error(`${provider} returned invalid JSON:`, text.slice(0, 300));
    throw new ProviderError(`${provider} returned invalid JSON`);
  }
}

export async function failFromResponse(response: Response, provider: string): Promise<never> {
  const detail = await response.text();
  console.error(`${provider} error`, response.status, detail.slice(0, 300));
  throw new ProviderError(response.status === 429 ? `${provider} is busy. Try again shortly.` : `${provider} request failed`);
}
