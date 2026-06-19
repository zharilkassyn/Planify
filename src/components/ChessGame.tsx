import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { supabase } from '../lib/supabase';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type Personality = 'teacher' | 'fast' | 'strategist' | 'aggressive';
type GameResult = 'victory' | 'defeat' | 'draw' | null;

type ChessSave = {
  fen: string;
  pgn: string;
  history: string[];
  undone: string[];
  difficulty: Difficulty;
  personality: Personality;
  playerSeconds: number;
  aiSeconds: number;
  playerTimeLeft: number;
  aiTimeLeft: number;
  rotated: boolean;
  paused: boolean;
  result: GameResult;
  lastMove: { from: string; to: string } | null;
  analysis: string;
  capturedWhite: string[];
  capturedBlack: string[];
};

type ChessStats = {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  rating: number;
  gamesPlayed: number;
  bestDifficulty: Difficulty | '';
};

type ChessRow = {
  current_game: unknown;
  stats: unknown;
};

const STORAGE_GAME = 'planify_chess_game';
const STORAGE_STATS = 'planify_chess_stats';
const START_TIME = 10 * 60;

const DIFFICULTIES: Array<{ key: Difficulty; label: string; desc: string; depth: number; delay: number }> = [
  { key: 'easy', label: 'Easy', desc: 'AI thinks fast, makes occasional mistakes, beginner friendly.', depth: 1, delay: 350 },
  { key: 'medium', label: 'Medium', desc: 'Balanced play, tactical ideas, average response time.', depth: 2, delay: 650 },
  { key: 'hard', label: 'Hard', desc: 'Strong positional decisions and multiple move calculation.', depth: 3, delay: 900 },
  { key: 'expert', label: 'Expert', desc: 'Advanced strategic play and high-level gameplay.', depth: 4, delay: 1200 },
];

const PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const emptyStats: ChessStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  rating: 800,
  gamesPlayed: 0,
  bestDifficulty: '',
};

function createSave(difficulty: Difficulty = 'medium', personality: Personality = 'teacher'): ChessSave {
  const chess = new Chess();
  return {
    fen: chess.fen(),
    pgn: chess.pgn(),
    history: [],
    undone: [],
    difficulty,
    personality,
    playerSeconds: 0,
    aiSeconds: 0,
    playerTimeLeft: START_TIME,
    aiTimeLeft: START_TIME,
    rotated: false,
    paused: false,
    result: null,
    lastMove: null,
    analysis: 'Сделай первый ход. ИИ ответит за чёрных.',
    capturedWhite: [],
    capturedBlack: [],
  };
}

function parseStats(raw: string | null): ChessStats {
  if (!raw) return emptyStats;
  try {
    return { ...emptyStats, ...(JSON.parse(raw) as Partial<ChessStats>) };
  } catch {
    return emptyStats;
  }
}

function coerceStats(value: unknown): ChessStats {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

function formatTime(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function rebuildChess(history: string[]) {
  const chess = new Chess();
  history.forEach(san => {
    try { chess.move(san); } catch { /* ignore corrupted moves */ }
  });
  return chess;
}

function materialScore(chess: Chess) {
  return chess.board().flat().reduce((score, piece) => {
    if (!piece) return score;
    const value = PIECE_VALUES[piece.type];
    return score + (piece.color === 'b' ? value : -value);
  }, 0);
}

function centerControlScore(chess: Chess) {
  const centers = new Set(['d4', 'e4', 'd5', 'e5']);
  return chess.moves({ verbose: true }).reduce((score, move) => {
    return score + (centers.has(move.to) ? (chess.turn() === 'b' ? 10 : -10) : 0);
  }, 0);
}

function evaluateBoard(chess: Chess, personality: Personality) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? 999999 : -999999;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  let score = materialScore(chess);
  score += centerControlScore(chess);
  if (chess.inCheck()) score += chess.turn() === 'w' ? 55 : -55;
  if (personality === 'aggressive') score += chess.moves({ verbose: true }).filter(move => move.captured).length * 18;
  if (personality === 'strategist') score += chess.moves({ verbose: true }).length * (chess.turn() === 'b' ? 2 : -2);
  return score;
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean, personality: Personality): number {
  if (depth === 0 || chess.isGameOver()) return evaluateBoard(chess, personality);
  const moves = chess.moves({ verbose: true });
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false, personality));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    chess.move(move);
    best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true, personality));
    chess.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function chooseAiMove(chess: Chess, difficulty: Difficulty, personality: Personality) {
  const config = DIFFICULTIES.find(item => item.key === difficulty) ?? DIFFICULTIES[1];
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  if (difficulty === 'easy' && Math.random() < 0.32) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const scored = moves.map(move => {
    chess.move(move);
    let score = minimax(chess, Math.max(0, config.depth - 1), -Infinity, Infinity, false, personality);
    chess.undo();
    if (move.captured) score += personality === 'aggressive' ? 65 : 35;
    if (move.san.includes('+')) score += 40;
    if (move.san.includes('#')) score += 10000;
    if (move.flags.includes('k') || move.flags.includes('q')) score += 25;
    return { move, score };
  }).sort((a, b) => b.score - a.score);

  const poolSize = difficulty === 'medium' ? 2 : difficulty === 'hard' ? 2 : 1;
  return scored[Math.floor(Math.random() * Math.min(poolSize, scored.length))].move;
}

function explainMove(move: Move | null, personality: Personality) {
  if (!move) return 'ИИ оценивает позицию.';
  if (move.san.includes('#')) return 'ИИ нашёл матовую атаку.';
  if (move.san.includes('+')) return 'ИИ дал шах и усилил давление.';
  if (move.captured) return `ИИ забрал фигуру на ${move.to}.`;
  if (['d4', 'd5', 'e4', 'e5'].includes(move.to)) return 'ИИ захватил центр.';
  if (move.flags.includes('k') || move.flags.includes('q')) return 'ИИ сделал рокировку и спрятал короля.';
  if (personality === 'teacher') return 'ИИ улучшил позицию фигуры и сохранил баланс.';
  if (personality === 'strategist') return 'ИИ строит долгосрочный план.';
  if (personality === 'aggressive') return 'ИИ готовит атаку на короля.';
  return 'ИИ сделал быстрый практичный ход.';
}

function capturedFromHistory(chess: Chess) {
  const history = chess.history({ verbose: true });
  const capturedWhite: string[] = [];
  const capturedBlack: string[] = [];
  history.forEach(move => {
    if (!move.captured) return;
    const piece = PIECES[move.color === 'w' ? 'b' : 'w'][move.captured];
    if (move.color === 'w') capturedBlack.push(piece);
    else capturedWhite.push(piece);
  });
  return { capturedWhite, capturedBlack };
}

function resultFromChess(chess: Chess): GameResult {
  if (chess.isCheckmate()) return chess.turn() === 'b' ? 'victory' : 'defeat';
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) return 'draw';
  return null;
}

export function ChessGame({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<ChessStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [save, setSave] = useState<ChessSave>(() => createSave());
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [started, setStarted] = useState(false);
  const lastSyncRef = useRef(0);

  const chess = useMemo(() => {
    const next = new Chess();
    try { next.load(save.fen); } catch { return new Chess(); }
    return next;
  }, [save.fen]);

  const board = useMemo(() => {
    const rows = chess.board();
    return save.rotated ? [...rows].reverse().map(row => [...row].reverse()) : rows;
  }, [chess, save.rotated]);

  const legalSquares = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map(move => move.to));
  }, [chess, selected]);

  const gameStopped = !started || save.paused || Boolean(save.result);

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error } = await supabase.from('chess_progress').select('current_game, stats').eq('user_id', userId).maybeSingle();
    if (error || !data) return;
    const row = data as ChessRow;
    const cloudStats = coerceStats(row.stats);
    setStats(cloudStats);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextSave: ChessSave, nextStats: ChessStats, force = false) => {
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 10000) return;
    lastSyncRef.current = now;
    setSyncState('saving');
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSyncState('offline');
      return;
    }
    const { error } = await supabase.from('chess_progress').upsert({
      user_id: userId,
      current_game: nextSave,
      stats: nextStats,
      updated_at: new Date().toISOString(),
    });
    setSyncState(error ? 'offline' : 'saved');
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_GAME, JSON.stringify(save));
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
    void saveCloud(save, stats);
  }, [save, saveCloud, stats]);

  function updateStats(result: GameResult, nextSave: ChessSave) {
    if (!result) return;
    const ratingDelta = result === 'victory' ? 18 : result === 'defeat' ? -12 : 4;
    const nextStats: ChessStats = {
      ...stats,
      wins: stats.wins + (result === 'victory' ? 1 : 0),
      losses: stats.losses + (result === 'defeat' ? 1 : 0),
      draws: stats.draws + (result === 'draw' ? 1 : 0),
      streak: result === 'victory' ? stats.streak + 1 : 0,
      rating: Math.max(100, stats.rating + ratingDelta),
      gamesPlayed: stats.gamesPlayed + 1,
      bestDifficulty: result === 'victory' ? nextSave.difficulty : stats.bestDifficulty,
    };
    setStats(nextStats);
    void saveCloud(nextSave, nextStats, true);
  }

  function applyHistory(history: string[], patch: Partial<ChessSave> = {}) {
    const nextChess = rebuildChess(history);
    const captures = capturedFromHistory(nextChess);
    const result = resultFromChess(nextChess);
    const nextSave: ChessSave = {
      ...save,
      ...patch,
      fen: nextChess.fen(),
      pgn: nextChess.pgn(),
      history,
      result,
      ...captures,
    };
    setSave(nextSave);
    if (result && !save.result) updateStats(result, nextSave);
    return nextSave;
  }

  function makePlayerMove(from: Square, to: Square) {
    if (thinking || gameStopped || chess.turn() !== 'w') return false;
    const test = new Chess(save.fen);
    const move = test.move({ from, to, promotion: 'q' });
    if (!move) return false;
    const history = [...save.history, move.san];
    applyHistory(history, { undone: [], lastMove: { from, to }, analysis: 'Ход принят. ИИ думает…' });
    setSelected(null);
    return true;
  }

  const runAi = useCallback(() => {
    const live = rebuildChess([...save.history]);
    if (!started || live.turn() !== 'b' || live.isGameOver() || save.paused || save.result) return;
    const config = DIFFICULTIES.find(item => item.key === save.difficulty) ?? DIFFICULTIES[1];
    const delay = save.personality === 'fast' ? 180 : config.delay;
    setThinking(true);
    window.setTimeout(() => {
      const move = chooseAiMove(live, save.difficulty, save.personality);
      if (!move) {
        setThinking(false);
        return;
      }
      live.move(move);
      const history = live.history();
      const captures = capturedFromHistory(live);
      const result = resultFromChess(live);
      const nextSave: ChessSave = {
        ...save,
        fen: live.fen(),
        pgn: live.pgn(),
        history,
        undone: [],
        result,
        lastMove: { from: move.from, to: move.to },
        analysis: explainMove(move, save.personality),
        ...captures,
      };
      setSave(nextSave);
      if (result && !save.result) updateStats(result, nextSave);
      window.setTimeout(() => setThinking(false), 250);
    }, delay);
  }, [save, started]);

  useEffect(() => {
    if (chess.turn() === 'b' && !thinking && !gameStopped) runAi();
  }, [chess, gameStopped, runAi, thinking]);

  useEffect(() => {
    if (gameStopped) return undefined;
    const id = window.setInterval(() => {
      setSave(current => {
        const whiteTurn = new Chess(current.fen).turn() === 'w';
        const next = {
          ...current,
          playerSeconds: current.playerSeconds + (whiteTurn ? 1 : 0),
          aiSeconds: current.aiSeconds + (!whiteTurn ? 1 : 0),
          playerTimeLeft: current.playerTimeLeft - (whiteTurn ? 1 : 0),
          aiTimeLeft: current.aiTimeLeft - (!whiteTurn ? 1 : 0),
        };
        if (next.playerTimeLeft <= 0 || next.aiTimeLeft <= 0) {
          const result: GameResult = next.playerTimeLeft <= 0 ? 'defeat' : 'victory';
          const ended = { ...next, result };
          updateStats(result, ended);
          return ended;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameStopped]);

  function onSquareClick(square: Square) {
    if (gameStopped) return;
    const piece = chess.get(square);
    if (selected) {
      if (makePlayerMove(selected, square)) return;
      setSelected(null);
    }
    if (piece?.color === 'w') setSelected(square);
  }

  function undo() {
    if (save.history.length < 2 || thinking) return;
    const undone = save.history.slice(-2);
    applyHistory(save.history.slice(0, -2), { undone: [...undone, ...save.undone], result: null, analysis: 'Последняя пара ходов отменена.' });
  }

  function redo() {
    if (save.undone.length < 2 || thinking) return;
    const redoMoves = save.undone.slice(0, 2);
    applyHistory([...save.history, ...redoMoves], { undone: save.undone.slice(2), analysis: 'Ходы повторены.' });
  }

  function newGame(difficulty = save.difficulty, personality = save.personality, startNow = false) {
    setStarted(startNow);
    setSave(createSave(difficulty, personality));
    setSelected(null);
    setThinking(false);
  }

  function resign() {
    const ended = { ...save, result: 'defeat' as GameResult, analysis: 'Партия завершена сдачей.' };
    setSave(ended);
    updateStats('defeat', ended);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started) return;
      if (event.key.toLowerCase() === 'u') undo();
      if (event.key.toLowerCase() === 'r') redo();
      if (event.key.toLowerCase() === 'n') newGame();
      if (event.key.toLowerCase() === 'p') setSave(current => ({ ...current, paused: !current.paused }));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="chess-page">
      <header className="chess-header">
        <button type="button" className="chess-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>Шахматы с ИИ</h2>
          <p>Тренируй стратегическое мышление</p>
        </div>
        <span className="chess-sync">{syncState === 'saving' ? 'Сохраняю…' : syncState === 'saved' ? 'Сохранено' : 'Локально'}</span>
      </header>

      <section className="chess-topbar">
        <div><span>⏱ 10:00</span><strong>{formatTime(save.playerTimeLeft)}</strong></div>
        <div><span>🙂 Игрок</span><strong>{chess.turn() === 'w' ? 'Ходит' : 'Ждёт'}</strong></div>
        <div><span>🤖 ИИ</span><strong>{thinking ? 'Думает' : chess.turn() === 'b' ? 'Ходит' : 'Ждёт'}</strong></div>
        <div><span>🏆 Победы</span><strong>{stats.wins}</strong></div>
        <div><span>🔥 Серия</span><strong>{stats.streak}</strong></div>
      </section>

      <main className="chess-layout">
        <section className="chess-board-card">
          <div className="chess-controls">
            <button type="button" onClick={undo}>↩️ Отменить ход</button>
            <button type="button" onClick={redo}>↪️ Повторить</button>
            <button type="button" onClick={() => newGame()}>🔄 Новая партия</button>
            <button type="button" onClick={resign}>🚩 Сдаться</button>
            <button type="button" className="ghost" onClick={() => setSave(current => ({ ...current, rotated: !current.rotated }))}>Rotate</button>
          </div>

          <div className="chess-board-wrap">
            <div className={`chess-board${!started || save.paused ? ' is-muted' : ''}`}>
              {board.map((row, viewRow) => row.map((piece, viewCol) => {
                const realRow = save.rotated ? 7 - viewRow : viewRow;
                const realCol = save.rotated ? 7 - viewCol : viewCol;
                const square = `${'abcdefgh'[realCol]}${8 - realRow}` as Square;
                const dark = (realRow + realCol) % 2 === 1;
                const last = save.lastMove && (save.lastMove.from === square || save.lastMove.to === square);
                return (
                  <button
                    key={square}
                    type="button"
                    className={[
                      'chess-square',
                      dark ? 'dark' : 'light',
                      selected === square ? 'selected' : '',
                      legalSquares.has(square) ? 'legal' : '',
                      last ? 'last' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onSquareClick(square)}
                    aria-label={square}
                  >
                    {piece && <span className={`chess-piece ${piece.color}`}>{PIECES[piece.color][piece.type]}</span>}
                  </button>
                );
              }))}
              {started && !save.result && (
                <button
                  type="button"
                  className="chess-pause-button"
                  aria-label={save.paused ? 'Продолжить' : 'Пауза'}
                  onClick={() => setSave(current => ({ ...current, paused: !current.paused }))}
                >
                  <span />
                  <span />
                </button>
              )}
              {!started && !save.result && (
                <div className="chess-start-overlay">
                  <button
                    type="button"
                    onClick={() => {
                      setStarted(true);
                      setSave(current => ({ ...current, paused: false }));
                    }}
                  >
                    Играть
                  </button>
                </div>
              )}
              {started && save.paused && !save.result && (
                <div className="chess-start-overlay">
                  <div className="chess-pause-menu">
                    <button type="button" onClick={() => setSave(current => ({ ...current, paused: false }))}>Продолжить</button>
                    <button type="button" onClick={() => newGame(save.difficulty, save.personality, true)}>Начать сначала</button>
                    <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="chess-captures">
            <div><span>Captured by AI</span><strong>{save.capturedWhite.join(' ') || '—'}</strong></div>
            <div><span>Captured by player</span><strong>{save.capturedBlack.join(' ') || '—'}</strong></div>
          </div>
        </section>

        <aside className="chess-sidebar">
          <section className="chess-ai-card">
            <h3>AI Settings</h3>
            <div className="chess-difficulty-list">
              {DIFFICULTIES.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={save.difficulty === item.key ? 'active' : ''}
                  onClick={() => newGame(item.key, save.personality)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.desc}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      {save.result && (
        <div className="chess-end">
          <div className="chess-end-card">
            <h3>{save.result === 'victory' ? 'Отличная партия 🎉' : save.result === 'defeat' ? 'Попробуй ещё раз' : 'Ничья'}</h3>
            <p>Moves: <strong>{save.history.length}</strong></p>
            <p>Accuracy: <strong>{save.result === 'victory' ? '91%' : save.result === 'draw' ? '82%' : '74%'}</strong></p>
            <p>Time: <strong>{formatTime(save.playerSeconds)}</strong></p>
            <p>Difficulty: <strong>{save.difficulty}</strong></p>
            <div className="chess-end-actions">
              <button type="button" onClick={() => newGame()}>Реванш</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
