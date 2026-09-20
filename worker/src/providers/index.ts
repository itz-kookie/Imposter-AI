import { GeminiProvider } from "./gemini";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { AiProvider } from "./types";

export type { AiProvider, GenerateOptions, JsonSchema } from "./types";
export { ProviderError } from "./types";

export interface Env {
  /** Which provider to use. Defaults to "gemini". */
  AI_PROVIDER?: string;

  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;

  MISTRAL_API_KEY?: string;
  MISTRAL_MODEL?: string;

  /** Any other OpenAI-compatible endpoint (Groq, OpenRouter, OpenAI, NVIDIA NIM, ...). */
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

// Each factory returns null when its configuration is incomplete.
// Add a new provider by adding one entry here.
const REGISTRY: Record<string, (env: Env) => AiProvider | null> = {
  gemini: env => env.GEMINI_API_KEY ? new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined) : null,

  mistral: env => env.MISTRAL_API_KEY
    ? new OpenAICompatibleProvider({ name: "Mistral", baseUrl: "https://api.mistral.ai/v1", apiKey: env.MISTRAL_API_KEY, model: env.MISTRAL_MODEL || "ministral-14b-latest" })
    : null,

  openai: env => env.OPENAI_API_KEY && env.OPENAI_MODEL
    ? new OpenAICompatibleProvider({ name: "OpenAI-compatible", baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL })
    : null
};

export const PROVIDER_NAMES = Object.keys(REGISTRY);

export function selectedProviderName(env: Env): string {
  return (env.AI_PROVIDER || "gemini").trim().toLowerCase();
}

/** Returns the configured provider, or null when AI_PROVIDER is unknown or its credentials are missing. */
export function createProvider(env: Env): AiProvider | null {
  const factory = REGISTRY[selectedProviderName(env)];
  return factory ? factory(env) : null;
}
