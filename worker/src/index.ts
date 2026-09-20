import type { BotClueRequest, BotClueResponse, BotVoteRequest, BotVoteResponse } from "../../shared/game";
import { cluePrompt, votePrompt } from "./prompts";
import { createProvider, selectedProviderName, PROVIDER_NAMES, ProviderError, type AiProvider, type Env, type GenerateOptions, type JsonSchema } from "./providers";

// In production the web app is served by this same Worker, so requests are same-origin and need no CORS.
// During local development Vite runs on a separate port, so we allow those origins explicitly.
const DEV_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin");
  if (!origin || !DEV_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  };
};

const json = (request: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(request) }
});

class ApiError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

function oneWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[.,!?;:'"()[\]{}]/g, "");
  if (!cleaned || /\s/.test(cleaned) || cleaned.length > 24) return null;
  // Reject phrases glued together to dodge the one-word rule: "DeepDish", "walk-like-an-egyptian", "Tour_de_France".
  if (/[-_]/.test(cleaned) || /\p{Ll}\p{Lu}/u.test(cleaned)) return null;
  return cleaned;
}

async function generateClue(ai: AiProvider, input: BotClueRequest): Promise<BotClueResponse> {
  if (!input.playerName || !input.category || !Array.isArray(input.previousClues)) throw new ApiError("Invalid clue request", 400);
  if (input.role === "player" && !input.secretWord) throw new ApiError("Player is missing the secret word", 400);
  const used = new Set(input.previousClues.map(c => c.word.toLowerCase()));
  // "reason" comes first so the model thinks before it picks the clue. Only the clue is returned to the client.
  const schema: JsonSchema = { type: "object", properties: { reason: { type: "string" }, clue: { type: "string" } }, required: ["reason", "clue"], additionalProperties: false };
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateJsonWithRetry<BotClueResponse & { reason?: string }>(ai, cluePrompt(input, correction), schema);
    const clue = oneWord(result.clue);
    const secret = input.secretWord?.toLowerCase();
    const lower = clue?.toLowerCase() ?? "";
    const revealsSecret = Boolean(secret && (lower === secret || lower.includes(secret) || secret.includes(lower)));
    if (clue && !revealsSecret && !used.has(lower)) return { clue };
    correction = `\nYour previous answer "${result.clue}" was rejected: it was not a single plain word (no glued-together phrases, hyphens, or capitals mid-word), repeated an earlier clue, or contained the secret word. Choose a completely different single word.`;
  }
  throw new ApiError(`${ai.name} could not produce a valid clue`, 502);
}

async function generateVote(ai: AiProvider, input: BotVoteRequest): Promise<BotVoteResponse> {
  if (!input.playerId || !Array.isArray(input.candidates) || !input.candidates.length) throw new ApiError("Invalid vote request", 400);
  const allowed = new Set(input.candidates.filter(p => p.id !== input.playerId).map(p => p.id));
  // "reason" first so the model weighs the clues before committing to a vote. Only playerId is returned.
  const schema: JsonSchema = { type: "object", properties: { reason: { type: "string" }, playerId: { type: "string", enum: [...allowed] } }, required: ["reason", "playerId"], additionalProperties: false };
  const result = await generateJsonWithRetry<BotVoteResponse & { reason?: string }>(ai, votePrompt(input), schema, { temperature: 0.5 });
  if (!allowed.has(result.playerId)) throw new ApiError(`${ai.name} selected an invalid player`, 502);
  return { playerId: result.playerId };
}

// Small models occasionally ramble past the token limit and return truncated JSON. One retry fixes almost all cases.
async function generateJsonWithRetry<T>(ai: AiProvider, prompt: string, schema: JsonSchema, options?: GenerateOptions): Promise<T> {
  try { return await ai.generateJson<T>(prompt, schema, options); }
  catch (error) {
    if (error instanceof ProviderError && /invalid JSON/.test(error.message)) return ai.generateJson<T>(prompt, schema, options);
    throw error;
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ProviderError) return new ApiError(error.message, error.status);
  return new ApiError("Invalid request", 400);
}

function requireProvider(env: Env): AiProvider {
  const ai = createProvider(env);
  if (ai) return ai;
  const name = selectedProviderName(env);
  const reason = PROVIDER_NAMES.includes(name) ? `${name} credentials are missing` : `unknown AI_PROVIDER "${name}" (expected one of ${PROVIDER_NAMES.join(", ")})`;
  throw new ApiError(`AI provider is not configured: ${reason}`, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json(request, { ok: true });
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const ai = createProvider(env);
      return json(request, { ok: true, provider: selectedProviderName(env), configured: Boolean(ai), model: ai?.model ?? null });
    }

    if (url.pathname === "/api/bot/clue" && request.method === "POST") {
      try {
        const input = await request.json<BotClueRequest>();
        return json(request, await generateClue(requireProvider(env), input));
      } catch (error) {
        const apiError = toApiError(error);
        return json(request, { error: apiError.message }, apiError.status);
      }
    }

    if (url.pathname === "/api/bot/vote" && request.method === "POST") {
      try {
        const input = await request.json<BotVoteRequest>();
        return json(request, await generateVote(requireProvider(env), input));
      } catch (error) {
        const apiError = toApiError(error);
        return json(request, { error: apiError.message }, apiError.status);
      }
    }

    return json(request, { error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;
