import type { BotClueRequest, BotClueResponse, BotVoteRequest, BotVoteResponse } from "../../shared/game";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "The AI service is unavailable");
  return payload;
}

export const botClue = (request: BotClueRequest) => post<BotClueResponse>("/api/bot/clue", request);
export const botVote = (request: BotVoteRequest) => post<BotVoteResponse>("/api/bot/vote", request);
