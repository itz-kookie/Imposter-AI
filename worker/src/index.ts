import type { BotClueRequest, BotClueResponse, BotVoteRequest, BotVoteResponse } from "../../shared/game";

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
}

const ALLOWED_ORIGIN = "http://localhost:5173";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  }
});

class ApiError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

function oneWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[.,!?;:'"()[\]{}]/g, "");
  if (!cleaned || /\s/.test(cleaned) || cleaned.length > 24) return null;
  return cleaned;
}

async function callGemini<T>(env: Env, prompt: string, schema: object): Promise<T> {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 80,
        responseMimeType: "application/json",
        responseJsonSchema: schema
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Gemini error", response.status, detail.slice(0, 300));
    throw new ApiError(response.status === 429 ? "Gemini is busy. Try again shortly." : "Gemini request failed", 502);
  }

  const payload = await response.json<any>();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ApiError("Gemini returned an empty response", 502);
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError("Gemini returned invalid JSON", 502); }
}

function cluePrompt(input: BotClueRequest, correction = ""): string {
  const knowledge = input.role === "player"
    ? `You know the secret word is "${input.secretWord}".`
    : `You are the imposter. You do not know the secret word. You only know the category is "${input.category}".`;
  const history = input.previousClues.length
    ? input.previousClues.map(c => `${c.playerName} (round ${c.round}): ${c.word}`).join("\n")
    : "No clues have been given yet.";
  return `You are ${input.playerName} in a social deduction word game. ${knowledge}
Difficulty: ${input.difficulty}. Give exactly one subtle clue word. It should help real players believe you know the word, but must not reveal the answer. Never repeat an earlier clue. Never use the secret word itself or a direct form of it.

Clues so far:
${history}
${correction}

Return JSON only with one field named clue.`;
}

async function generateClue(env: Env, input: BotClueRequest): Promise<BotClueResponse> {
  if (!input.playerName || !input.category || !Array.isArray(input.previousClues)) throw new ApiError("Invalid clue request", 400);
  if (input.role === "player" && !input.secretWord) throw new ApiError("Player is missing the secret word", 400);
  const used = new Set(input.previousClues.map(c => c.word.toLowerCase()));
  const schema = { type: "object", properties: { clue: { type: "string" } }, required: ["clue"], additionalProperties: false };
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callGemini<BotClueResponse>(env, cluePrompt(input, correction), schema);
    const clue = oneWord(result.clue);
    const isSecret = Boolean(input.secretWord && clue?.toLowerCase() === input.secretWord.toLowerCase());
    if (clue && !isSecret && !used.has(clue.toLowerCase())) return { clue };
    correction = "Your last answer was invalid, repeated, or revealed the secret. Choose a different single word.";
  }
  throw new ApiError("Gemini could not produce a valid clue", 502);
}

function votePrompt(input: BotVoteRequest): string {
  const knowledge = input.role === "player"
    ? `You know the secret word is "${input.secretWord}" in category "${input.category}".`
    : `You are the imposter and know only the category "${input.category}". Deflect suspicion without voting for yourself.`;
  const history = input.clues.map(c => `${c.playerName} (round ${c.round}): ${c.word}`).join("\n");
  const candidates = input.candidates.map(p => `${p.id}: ${p.name}`).join("\n");
  return `You are ${input.playerName} voting in a social deduction game. ${knowledge}
Review the clues and select the single most suspicious candidate. You cannot vote for yourself.

Clues:
${history}

Candidates:
${candidates}

Return JSON only with the exact candidate id in playerId.`;
}

async function generateVote(env: Env, input: BotVoteRequest): Promise<BotVoteResponse> {
  if (!input.playerId || !Array.isArray(input.candidates) || !input.candidates.length) throw new ApiError("Invalid vote request", 400);
  const allowed = new Set(input.candidates.filter(p => p.id !== input.playerId).map(p => p.id));
  const schema = { type: "object", properties: { playerId: { type: "string", enum: [...allowed] } }, required: ["playerId"], additionalProperties: false };
  const result = await callGemini<BotVoteResponse>(env, votePrompt(input), schema);
  if (!allowed.has(result.playerId)) throw new ApiError("Gemini selected an invalid player", 502);
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, geminiConfigured: Boolean(env.GEMINI_API_KEY) });
    }

    if (url.pathname === "/api/bot/clue" && request.method === "POST") {
      try {
        const input = await request.json<BotClueRequest>();
        if (!env.GEMINI_API_KEY) throw new ApiError("Gemini is not configured", 503);
        return json(await generateClue(env, input));
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError("Invalid request", 400);
        return json({ error: apiError.message }, apiError.status);
      }
    }

    if (url.pathname === "/api/bot/vote" && request.method === "POST") {
      try {
        const input = await request.json<BotVoteRequest>();
        if (!env.GEMINI_API_KEY) throw new ApiError("Gemini is not configured", 503);
        return json(await generateVote(env, input));
      } catch (error) {
        const apiError = error instanceof ApiError ? error : new ApiError("Invalid request", 400);
        return json({ error: apiError.message }, apiError.status);
      }
    }

    return json({ error: "Not found" }, 404);
  }
} satisfies ExportedHandler<Env>;
