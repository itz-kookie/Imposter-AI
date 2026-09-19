export type PlayerId = string;

export interface Player {
  id: PlayerId;
  name: string;
  isHuman: boolean;
}

export interface Clue {
  playerId: PlayerId;
  word: string;
  round: number;
}

export interface BotClueRequest {
  playerName: string;
  role: "player" | "imposter";
  category: string;
  secretWord?: string;
  previousClues: Array<Clue & { playerName: string }>;
  difficulty: "gentle" | "standard" | "devious";
}

export interface BotVoteRequest {
  playerId: PlayerId;
  playerName: string;
  role: "player" | "imposter";
  category: string;
  secretWord?: string;
  candidates: Player[];
  clues: Array<Clue & { playerName: string }>;
  difficulty: "gentle" | "standard" | "devious";
}

export interface BotClueResponse {
  clue: string;
}

export interface BotVoteResponse {
  playerId: PlayerId;
}
