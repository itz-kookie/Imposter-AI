import type { BotClueRequest, BotVoteRequest } from "../../shared/game";

// Prompts are tuned for small models (Ministral 14B, Gemini Flash-Lite): short rules, concrete examples, one job per call.

export const DIFFICULTY_RULES: Record<BotClueRequest["difficulty"], string> = {
  gentle: `Difficulty GENTLE. Recipe: name something you would see or use together with the word, such as a part, an accessory, or the place it lives. Example for "Bicycle": "Helmet", "Basket", "Chain".`,
  standard: `Difficulty STANDARD. Recipe: name a well known example, brand, character, event, or place that most people would tie to the word, rather than a part or feature of the word itself. Example for "Bicycle": "Amsterdam", "Peloton", "Postman". Not "Wheel", "Pedal", "Helmet", and not an obscure name only experts know.`,
  devious: `Difficulty DEVIOUS. Recipe: name something from a story, a saying, a habit, or a lesser known fact about the word, so the link is clear only to someone who already knows it. Example for "Bicycle": "Elliott" (E.T.), "Flanders", "Stabilisers". Not "Wheel", "Peloton", "Tour".`
};

const CLUE_STYLE = `What makes a good clue:
- A concrete word: a thing, place, name, action, or well known phrase. Never a feeling, mood, or vague adjective. "Nostalgia", "Joy", "Serenity", "Majestic" are useless and make you look like the imposter.
- Specific to the word for someone who knows it, yet fits several other words in the category for someone who does not.
- Not the single most famous association with the word (the imposter will guess that one too). Reach for the second or third thing that comes to mind.
- Examples for secret word "Pizza": BAD "Delicious", "Happiness", "Joy" (fit anything, look like hedging). GOOD "Friday", "Cardboard", "Ninja", "Domino".
- Examples for secret word "Penguin": BAD "Cute", "Majestic", "Animal". GOOD "Tuxedo", "Huddle", "Batman", "Madagascar".`;

export function cluePrompt(input: BotClueRequest, correction = ""): string {
  const round = input.previousClues.reduce((max, c) => Math.max(max, c.round), 1);
  const history = input.previousClues.length
    ? input.previousClues.map(c => `${c.playerName} (round ${c.round}): ${c.word}`).join("\n")
    : "No clues have been given yet.";

  if (input.role === "player") {
    return `You are ${input.playerName} in a social deduction word game. Everyone at the table knows a secret word except one imposter, who only knows the category. Each player says one word as a clue. Afterwards everyone votes on who the imposter is.

The secret word is "${input.secretWord}". Category: ${input.category}.

Your clue has two jobs:
1. Prove to the other real players that you know the word. They will vote for whoever seems least connected to it.
2. Not help the imposter guess the word. The imposter sees the category and every clue.

${CLUE_STYLE}

${DIFFICULTY_RULES[input.difficulty]}

${round > 1 ? "This is round " + round + ". Pick a different angle from every clue already given, and keep your clue at least as specific as theirs." : ""}

Rules: exactly one plain word (a single name is fine), never a phrase glued together like "DeepDish" or "TourdeFrance". Never use the secret word, part of it, a plural, a translation, or a rhyme. Never repeat a clue already given.

Clues so far:
${history}
${correction}

Return JSON with "reason" (under 25 words, plain text, no markdown: the link between your clue and the secret word) and "clue".`;
  }

  return `You are ${input.playerName} in a social deduction word game. You are the IMPOSTER. You do not know the secret word. You only know the category: "${input.category}". Everyone else knows the word. Each player says one word as a clue, then everyone votes on who the imposter is. You must not be voted out.

Read the clues so far and make your best private guess at the secret word. Then give a clue that fits your guess and would also fit a few other likely words in the category, so you blend in whether or not you are right.

Rules for your clue:
- A concrete word: a thing, place, name, or action. Vague words like "Nice", "Fun", "Majestic", "Joy" get you caught because real players notice you are hedging.
- Do not name a part or a defining feature of your guess. Real players do not do that either, and if your guess is wrong it exposes you.
- Match the style and specificity of the clues already given.
- Exactly one plain word (a single name is fine), never a phrase glued together like "DeepDish". Never repeat a clue already given.

Clues so far:
${history}
${correction}

Return JSON with "reason" (under 25 words, plain text, no markdown: your guess and why the clue fits it and other words too) and "clue".`;
}

export function votePrompt(input: BotVoteRequest): string {
  const history = input.clues.map(c => `${c.playerName} (round ${c.round}): ${c.word}`).join("\n");
  const candidates = input.candidates.map(p => `${p.id}: ${p.name}`).join("\n");

  if (input.role === "player") {
    const obviousTell = input.difficulty === "gentle" ? "" : `
Second tell: real players were told never to name a part, ingredient, or plain feature of "${input.secretWord}" because that would help the imposter. So if a candidate's clues do fit "${input.secretWord}" but are the most obvious, basic words for it, that candidate may be an imposter who guessed right and is overplaying it.`;
    return `You are ${input.playerName} in a social deduction word game. The secret word is "${input.secretWord}" (category: ${input.category}). Every player except one knows it. The imposter only knows the category and gave clues based on a guess. Find the imposter.

Step 1. For each candidate, take their clues together and name the single ${input.category} word those clues fit best. Consider brands, famous examples, characters, sayings, and habits as valid fits. If you do not recognise a reference, write "unknown" for it: a real player may know things you do not, so an unknown reference is NOT evidence against them.
Step 2. A candidate is suspicious only when their clues clearly point to a DIFFERENT ${input.category} word than "${input.secretWord}", or are so generic they fit the whole category. Vote for the candidate whose clues point most clearly away from "${input.secretWord}".${obviousTell}
Step 3. If nobody's clues point away from "${input.secretWord}", vote for the candidate whose clues are the most generic.

Clues:
${history}

Candidates (you are not listed):
${candidates}

Return JSON with "reason" and "playerId". In "reason" write each candidate on the pattern "Name: clue, clue -> best-fit word" with at most five words of explanation each. Plain text only: no markdown, no asterisks, no bold. Then in "playerId" give the exact id of the candidate you vote for.`;
  }

  return `You are ${input.playerName} in a social deduction word game. You are the imposter: you do not know the secret word, only the category "${input.category}". You must vote for someone else and avoid suspicion.

Vote for the player whose clues look vaguest or least consistent with the others, so the real players may follow your lead.

Clues:
${history}

Candidates (you are not listed):
${candidates}

Return JSON with "reason" (under 25 words, plain text) and "playerId" (the exact id of the candidate you vote for).`;
}
