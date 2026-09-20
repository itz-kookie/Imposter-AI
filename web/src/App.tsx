import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { BotClueRequest, BotVoteRequest, BotVoteResponse, Clue, Player } from "../../shared/game";
import { botClue, botVote } from "./api";
import { BOT_NAMES, COLORS, WORDS, type WordPack } from "./data";

type Screen = "setup" | "reveal" | "play" | "vote" | "result";
type Difficulty = "gentle" | "standard" | "devious";
type GamePlayer = Player & { color: string };
const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const initials = (name: string) => name.slice(0, 2).toUpperCase();
const loadScores = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem("imposter-scores") || "{}"); } catch { return {}; } };

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [playerCount, setPlayerCount] = useState(4);
  const [userName, setUserName] = useState("You");
  const [difficulty, setDifficulty] = useState<Difficulty>("standard");
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [wordPack, setWordPack] = useState<WordPack | null>(null);
  const [imposterId, setImposterId] = useState("");
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(2);
  const [turnIndex, setTurnIndex] = useState(0);
  const [clues, setClues] = useState<Clue[]>([]);
  const [roleVisible, setRoleVisible] = useState(false);
  const [selectedVote, setSelectedVote] = useState("");
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>(loadScores);
  const [gameNumber, setGameNumber] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ caught: boolean; tie: boolean } | null>(null);
  const botTurnKey = useRef("");
  const currentId = turnOrder[turnIndex];
  const currentPlayer = players.find(p => p.id === currentId);

  useEffect(() => { localStorage.setItem("imposter-scores", JSON.stringify(scores)); }, [scores]);
  useEffect(() => {
    if (screen !== "play" || !currentPlayer || currentPlayer.isHuman || busy || !wordPack) return;
    const key = `${gameNumber}-${round}-${turnIndex}-${currentPlayer.id}`;
    if (botTurnKey.current === key) return;
    botTurnKey.current = key;
    void runBotTurn(currentPlayer, wordPack);
  }, [screen, currentPlayer?.id, busy, wordPack, gameNumber, round, turnIndex]);

  function startGame() {
    const nextPlayers: GamePlayer[] = [
      { id: "human", name: userName.trim() || "You", isHuman: true, color: COLORS[0] },
      ...BOT_NAMES.slice(0, playerCount - 1).map((name, i) => ({ id: `bot-${i + 1}`, name, isHuman: false, color: COLORS[i + 1] }))
    ];
    setPlayers(nextPlayers); setWordPack(pick(WORDS)); setImposterId(pick(nextPlayers).id); setTurnOrder(shuffled(nextPlayers.map(p => p.id)));
    setRound(1); setTotalRounds(playerCount > 5 ? 3 : 2); setTurnIndex(0); setClues([]); setRoleVisible(false); setSelectedVote("");
    setVotes({}); setResult(null); setError(""); setBusy(false); setGameNumber(n => n + 1); setScreen("reveal"); botTurnKey.current = "";
    setScores(old => Object.fromEntries(nextPlayers.map(p => [p.id, old[p.id] || 0])));
  }

  function advanceWithClue(playerId: string, word: string) {
    setClues(old => [...old, { playerId, word, round }]); setError("");
    if (turnIndex + 1 < players.length) setTurnIndex(i => i + 1);
    else if (round < totalRounds) { setRound(r => r + 1); setTurnIndex(0); }
    else { setTurnIndex(0); setScreen("vote"); }
    botTurnKey.current = "";
  }

  async function runBotTurn(bot: GamePlayer, pack: WordPack) {
    setBusy(true); setError("");
    const request: BotClueRequest = {
      playerName: bot.name, role: bot.id === imposterId ? "imposter" : "player", category: pack.category,
      ...(bot.id === imposterId ? {} : { secretWord: pack.word }),
      previousClues: clues.map(c => ({ ...c, playerName: players.find(p => p.id === c.playerId)?.name || "Player" })), difficulty
    };
    try { advanceWithClue(bot.id, (await botClue(request)).clue); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reach the AI service"); botTurnKey.current = ""; }
    finally { setBusy(false); }
  }

  function useFallback() {
    if (!currentPlayer || !wordPack) return;
    const used = new Set(clues.map(c => c.word.toLowerCase()));
    const source = currentPlayer.id === imposterId ? wordPack.imposterFallback : wordPack.fallback;
    const available = source.filter(word => !used.has(word.toLowerCase()));
    advanceWithClue(currentPlayer.id, pick(available.length ? available : source));
  }

  function submitHumanClue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clue = String(new FormData(event.currentTarget).get("clue") || "").trim().replace(/[.,!?;:'"()[\]{}]/g, "");
    if (!clue || /\s/.test(clue)) return setError("Enter exactly one clue word.");
    if (clue.length > 24) return setError("Keep your clue under 25 characters.");
    if (wordPack && clue.toLowerCase() === wordPack.word.toLowerCase()) return setError("That is the secret word—choose something subtler.");
    if (clues.some(c => c.word.toLowerCase() === clue.toLowerCase())) return setError("That clue has already been used.");
    advanceWithClue("human", clue);
  }

  async function confirmVote() {
    if (!selectedVote || !wordPack) return;
    setBusy(true); setError("");
    const allVotes: Record<string, string> = { human: selectedVote };
    const history = clues.map(c => ({ ...c, playerName: players.find(p => p.id === c.playerId)?.name || "Player" }));
    const bots = players.filter(p => !p.isHuman);
    // Votes run one at a time: free-tier providers allow roughly one request per second, and parallel calls turn into 429s.
    const responses: PromiseSettledResult<BotVoteResponse>[] = [];
    for (const bot of bots) {
      const request: BotVoteRequest = {
        playerId: bot.id, playerName: bot.name, role: bot.id === imposterId ? "imposter" : "player", category: wordPack.category,
        ...(bot.id === imposterId ? {} : { secretWord: wordPack.word }),
        candidates: players.filter(p => p.id !== bot.id).map(({ id, name, isHuman }) => ({ id, name, isHuman })), clues: history, difficulty
      };
      responses.push(await botVote(request).then(value => ({ status: "fulfilled", value } as const), reason => ({ status: "rejected", reason } as const)));
    }
    responses.forEach((entry, index) => { const bot = bots[index]; allVotes[bot.id] = entry.status === "fulfilled" ? entry.value.playerId : pick(players.filter(p => p.id !== bot.id)).id; });
    const counts: Record<string, number> = {}; Object.values(allVotes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const max = Math.max(...Object.values(counts)); const leaders = Object.keys(counts).filter(id => counts[id] === max);
    const caught = leaders.length === 1 && leaders[0] === imposterId; const tie = leaders.length > 1;
    setVotes(allVotes); setResult({ caught, tie });
    setScores(old => { const next = { ...old }; if (caught) players.filter(p => p.id !== imposterId).forEach(p => { next[p.id] = (next[p.id] || 0) + 1; }); else next[imposterId] = (next[imposterId] || 0) + 1; return next; });
    setBusy(false); setScreen("result");
  }

  const progress = screen === "result" ? 100 : screen === "vote" ? 86 : screen === "reveal" ? 8 : screen === "play" ? 16 + (((round - 1) * players.length + turnIndex) / (totalRounds * players.length)) * 62 : 0;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">◐</span><span>IMPOSTER</span><span className="prototype-pill">AI edition</span></div><button className="icon-btn" aria-label="How to play" onClick={() => alert("Know the word, give subtle clues, then vote for the imposter. A tied vote lets the imposter escape.")}>?</button></header>
    {screen !== "setup" && <Progress value={progress} game={gameNumber} label={screen === "result" ? "COMPLETE" : screen === "vote" ? "FINAL VOTE" : screen === "reveal" ? "SECRET ROLE" : `ROUND ${round} OF ${totalRounds}`} />}
    {screen === "setup" && <Setup count={playerCount} name={userName} difficulty={difficulty} onCount={setPlayerCount} onName={setUserName} onDifficulty={setDifficulty} onStart={startGame} />}
    {screen === "reveal" && wordPack && <GameLayout players={players} order={turnOrder} activeId=""><Stage eyebrow="Eyes only" title="Know your part." badge={`${players.length} players`} /><div className="secret-wrap">{!roleVisible ? <Secret kind="hidden" title="Tap to reveal" note="Make sure nobody else can see your screen." /> : imposterId === "human" ? <Secret kind="danger" title="Imposter" category={wordPack.category} note="Blend in. Use the clues to work out the word." /> : <Secret kind="word" title={wordPack.word} category={wordPack.category} note="Be subtle. The imposter is listening." />}</div><div className="card-actions"><button className="secondary-btn" onClick={() => setScreen("setup")}>Change setup</button><button className="primary-btn" onClick={() => roleVisible ? (setRoleVisible(false), setScreen("play")) : setRoleVisible(true)}>{roleVisible ? "Hide & begin" : "Reveal my role"}</button></div></GameLayout>}
    {screen === "play" && currentPlayer && wordPack && <GameLayout players={players} order={turnOrder} activeId={currentId} doneCount={turnIndex}><Stage eyebrow={`Round ${round}`} title={currentPlayer.isHuman ? "Your move." : "Listen closely."} badge={`Turn ${turnIndex + 1} of ${players.length}`} /><ClueBoard clues={clues} players={players} />{currentPlayer.isHuman ? <form className="clue-entry" onSubmit={submitHumanClue}><span className="eyebrow">Your turn</span><h3>Choose one subtle word</h3><p>Show that you know the secret without making it obvious.</p><div className="input-row"><input name="clue" autoFocus autoComplete="off" placeholder="Type one word…" maxLength={24} /><button className="primary-btn">Lock clue</button></div>{error && <p className="error">{error}</p>}</form> : <BotWaiting player={currentPlayer} busy={busy} error={error} onRetry={() => { setError(""); botTurnKey.current = ""; void runBotTurn(currentPlayer, wordPack); }} onFallback={useFallback} />}</GameLayout>}
    {screen === "vote" && <GameLayout players={players} order={turnOrder} activeId=""><Stage eyebrow="Final vote" title="Who doesn’t belong?" badge="One choice" /><p className="subcopy">Look for clues that were vague, copied, or suspiciously safe.</p><div className="vote-grid">{players.filter(p => !p.isHuman).map(p => <button key={p.id} className={`vote-card ${selectedVote === p.id ? "selected" : ""}`} onClick={() => setSelectedVote(p.id)}><Avatar player={p} large /><span><b>{p.name}</b><small>{clues.filter(c => c.playerId === p.id).map(c => c.word).join(" · ")}</small></span></button>)}</div><div className="vote-actions"><button className="primary-btn" disabled={!selectedVote || busy} onClick={confirmVote}>{busy ? "Collecting votes…" : "Confirm vote"}</button></div></GameLayout>}
    {screen === "result" && wordPack && result && <Result players={players} imposterId={imposterId} word={wordPack.word} votes={votes} scores={scores} result={result} onSetup={() => setScreen("setup")} onReplay={startGame} />}
  </div>;
}

function Progress({ value, game, label }: { value: number; game: number; label: string }) { return <div className="progress-wrap"><div className="progress-meta"><span>GAME {game}</span><span>{label}</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${value}%` }} /></div></div>; }
function Stage({ eyebrow, title, badge }: { eyebrow: string; title: string; badge: string }) { return <div className="stage-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span className="round-badge">{badge}</span></div>; }

function Setup({ count, name, difficulty, onCount, onName, onDifficulty, onStart }: { count: number; name: string; difficulty: Difficulty; onCount: (n: number) => void; onName: (s: string) => void; onDifficulty: (d: Difficulty) => void; onStart: () => void }) {
  return <div className="setup-grid"><article className="hero-card"><div><span className="eyebrow">A game of careful clues</span><h1>Trust no one.</h1><p className="hero-copy">Everyone knows the secret word—except one player. Give a clue that proves you belong without giving the answer away.</p></div><div className="rule-strip">{[["01","Learn your role"],["02","Give subtle clues"],["03","Find the imposter"]].map(([n,t]) => <div key={n}><strong>{n}</strong><span>{t}</span></div>)}</div></article><section className="setup-card"><h2>Set the table</h2><p className="subcopy">AI controls every opponent at the table.</p><label>Your name<input value={name} maxLength={16} onChange={e => onName(e.target.value)} /></label><label><span className="label-row"><span>Players</span><b>{count}</b></span><input type="range" min={3} max={8} value={count} onChange={e => onCount(Number(e.target.value))} /></label><div><label>Bot subtlety</label><div className="segmented">{(["gentle","standard","devious"] as Difficulty[]).map(d => <button key={d} className={difficulty === d ? "active" : ""} onClick={() => onDifficulty(d)}>{d}</button>)}</div></div><div className="player-preview"><span className="mini-player"><i style={{ background: COLORS[0] }}>{initials(name || "You")}</i>{name || "You"}</span>{BOT_NAMES.slice(0, count - 1).map((bot, i) => <span className="mini-player" key={bot}><i style={{ background: COLORS[i + 1] }}>{initials(bot)}</i>{bot}</span>)}</div><button className="primary-btn start-btn" onClick={onStart}>Deal the roles</button></section></div>;
}

function Avatar({ player, large = false }: { player: GamePlayer; large?: boolean }) { return <span className={`avatar ${large ? "large" : ""}`} style={{ background: player.color }}>{initials(player.name)}</span>; }
function GameLayout({ children, players, order, activeId, doneCount = 0 }: { children: ReactNode; players: GamePlayer[]; order: string[]; activeId: string; doneCount?: number }) {
  const listRef = useRef<HTMLDivElement>(null);
  // On phones the table is a horizontal strip; keep the active player visible.
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(".player-row.active")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [activeId]);
  return <div className="game-layout"><article className="game-card">{children}</article><aside className="side-card"><h3>At the table</h3><div className="players-list" ref={listRef}>{order.map((id, index) => { const p = players.find(x => x.id === id)!; return <div key={id} className={`player-row ${activeId === id ? "active" : ""} ${index < doneCount ? "done" : ""}`}><Avatar player={p} /><span><b>{p.name}</b><small>{activeId === id ? "Choosing a clue…" : index < doneCount ? "Clue given" : `Position ${index + 1}`}</small></span>{activeId === id && <i className="turn-dot" />}</div>; })}</div></aside></div>; }
function Secret({ kind, title, category, note }: { kind: "hidden" | "danger" | "word"; title: string; category?: string; note: string }) { return <div className={`secret-card ${kind === "hidden" ? "hidden" : ""}`}><span className={`lock ${kind === "danger" ? "danger" : ""}`}>{kind === "danger" ? "◐" : kind === "hidden" ? "⌾" : "◉"}</span><span className="secret-label">{kind === "hidden" ? "Your role is private" : kind === "word" ? "The secret word" : "Your role"}</span><div className={`secret-word ${kind === "danger" ? "danger-text" : ""}`}>{title}</div>{category && <p>Category: <strong>{category}</strong></p>}<small>{note}</small></div>; }
function ClueBoard({ clues, players }: { clues: Clue[]; players: GamePlayer[] }) { if (!clues.length) return <p className="subcopy empty-clues">No clues yet. This player opens the round.</p>; return <div className="clue-board">{clues.map((clue, index) => { const p = players.find(x => x.id === clue.playerId)!; return <div className="clue-chip" key={`${clue.round}-${clue.playerId}-${index}`}><Avatar player={p} /><span className="who">{p.name} · R{clue.round}</span><strong>{clue.word}</strong></div>; })}</div>; }
function BotWaiting({ player, busy, error, onRetry, onFallback }: { player: GamePlayer; busy: boolean; error: string; onRetry: () => void; onFallback: () => void }) { return <div className="waiting"><div><div className="waiting-orb" /><h3>{player.name} is thinking</h3><p>{busy ? "Reviewing every clue…" : "Ready for the next clue."}</p>{error && <div className="error-box"><span>{error}</span><div><button className="secondary-btn compact" onClick={onRetry}>Retry</button><button className="text-btn" onClick={onFallback}>Use fallback clue</button></div></div>}</div></div>; }
function Result({ players, imposterId, word, votes, scores, result, onSetup, onReplay }: { players: GamePlayer[]; imposterId: string; word: string; votes: Record<string, string>; scores: Record<string, number>; result: { caught: boolean; tie: boolean }; onSetup: () => void; onReplay: () => void }) { const imposter = players.find(p => p.id === imposterId)!; const headline = result.caught ? "Imposter caught." : result.tie ? "A perfect tie." : "The imposter escaped."; const copy = result.caught ? "The table saw through the disguise." : result.tie ? "Without a majority, the imposter walks free." : "The wrong player took the blame."; return <div className="result-wrap"><article className="result-card"><div className="result-hero"><div className="result-icon">◐</div><span className="eyebrow">The reveal</span><h2>{headline}</h2><p>{copy}</p><div className="reveal-line"><span>{imposter.name} was the imposter</span><span>•</span><strong>{word}</strong></div></div><div className="result-body"><h3>Scoreboard</h3>{players.map(p => <div className="score-row" key={p.id}><span><Avatar player={p} />{p.name}{p.id === imposterId && <em>Imposter</em>}</span><b>{scores[p.id] || 0}</b></div>)}<p className="vote-summary">Votes: {players.map(p => `${p.name} → ${players.find(x => x.id === votes[p.id])?.name || "—"}`).join(" · ")}</p><div className="result-actions"><button className="secondary-btn" onClick={onSetup}>New setup</button><button className="primary-btn" onClick={onReplay}>Play again</button></div></div></article></div>; }
