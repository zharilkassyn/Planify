import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type Board = number[];

type SudokuSave = {
  puzzle: Board;
  solution: Board;
  values: Board;
  fixed: boolean[];
  notes: string[];
  difficulty: Difficulty;
  seconds: number;
  mistakes: number;
  hintsLeft: number;
  completed: boolean;
  dailyKey?: string;
};

type SudokuStats = {
  gamesCompleted: number;
  totalSolved: number;
  totalSeconds: number;
  streak: number;
  lastSolvedDate: string;
  xp: number;
  bestTimes: Record<Difficulty, number | null>;
  achievements: string[];
  dailyCompleted: string[];
};

type SudokuRow = {
  current_game: unknown;
  stats: unknown;
};

type Completion = {
  time: number;
  mistakes: number;
  xp: number;
  achievements: string[];
} | null;

const STORAGE_GAME = 'planify_sudoku_game';
const STORAGE_STATS = 'planify_sudoku_stats';

const DIFFICULTIES: Array<{ key: Difficulty; label: string; clues: number; hints: number; xp: number }> = [
  { key: 'easy', label: 'Easy', clues: 42, hints: 5, xp: 25 },
  { key: 'medium', label: 'Medium', clues: 36, hints: 4, xp: 40 },
  { key: 'hard', label: 'Hard', clues: 30, hints: 3, xp: 65 },
  { key: 'expert', label: 'Expert', clues: 24, hints: 2, xp: 100 },
];

const ACHIEVEMENTS = [
  { id: 'first-victory', title: 'First Victory', check: (stats: SudokuStats, difficulty: Difficulty) => stats.totalSolved >= 1 || difficulty === 'easy' },
  { id: 'five-games', title: '5 Games Completed', check: (stats: SudokuStats) => stats.totalSolved >= 5 },
  { id: 'seven-day-streak', title: '7-Day Streak', check: (stats: SudokuStats) => stats.streak >= 7 },
  { id: 'sudoku-master', title: 'Sudoku Master', check: (stats: SudokuStats) => stats.totalSolved >= 20 },
  { id: 'expert-solver', title: 'Expert Solver', check: (_stats: SudokuStats, difficulty: Difficulty) => difficulty === 'expert' },
];

const emptyStats: SudokuStats = {
  gamesCompleted: 0,
  totalSolved: 0,
  totalSeconds: 0,
  streak: 0,
  lastSolvedDate: '',
  xp: 0,
  bestTimes: { easy: null, medium: null, hard: null, expert: null },
  achievements: [],
  dailyCompleted: [],
};

function shuffle<T>(items: T[], rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function seededRandom(seedText: string) {
  let seed = 2166136261;
  for (const char of seedText) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canPlace(board: Board, index: number, value: number) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;

  for (let i = 0; i < 9; i += 1) {
    if (board[row * 9 + i] === value) return false;
    if (board[i * 9 + col] === value) return false;
  }

  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (board[(boxRow + r) * 9 + boxCol + c] === value) return false;
    }
  }
  return true;
}

function fillBoard(board: Board, rng = Math.random): boolean {
  const index = board.findIndex(cell => cell === 0);
  if (index === -1) return true;

  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
    if (!canPlace(board, index, value)) continue;
    board[index] = value;
    if (fillBoard(board, rng)) return true;
    board[index] = 0;
  }
  return false;
}

function countSolutions(board: Board, limit = 2): number {
  const index = board.findIndex(cell => cell === 0);
  if (index === -1) return 1;

  let count = 0;
  for (let value = 1; value <= 9; value += 1) {
    if (!canPlace(board, index, value)) continue;
    board[index] = value;
    count += countSolutions(board, limit);
    board[index] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function generateSudoku(difficulty: Difficulty, seed?: string): SudokuSave {
  const config = DIFFICULTIES.find(item => item.key === difficulty) ?? DIFFICULTIES[0];
  const rng = seed ? seededRandom(seed) : Math.random;
  const solution = Array<number>(81).fill(0);
  fillBoard(solution, rng);

  const puzzle = [...solution];
  const positions = shuffle(Array.from({ length: 81 }, (_, index) => index), rng);
  let removed = 0;
  const targetRemoved = 81 - config.clues;

  for (const index of positions) {
    if (removed >= targetRemoved) break;
    const oldValue = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions([...puzzle]) === 1) {
      removed += 1;
    } else {
      puzzle[index] = oldValue;
    }
  }

  return {
    puzzle,
    solution,
    values: [...puzzle],
    fixed: puzzle.map(Boolean),
    notes: Array<string>(81).fill(''),
    difficulty,
    seconds: 0,
    mistakes: 0,
    hintsLeft: config.hints,
    completed: false,
    dailyKey: seed,
  };
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isBoardComplete(values: Board, solution: Board) {
  return values.every((value, index) => value === solution[index]);
}

function parseGame(raw: string | null): SudokuSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SudokuSave;
    if (Array.isArray(parsed.values) && parsed.values.length === 81 && Array.isArray(parsed.solution) && parsed.solution.length === 81) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function parseStats(raw: string | null): SudokuStats {
  if (!raw) return emptyStats;
  try {
    const parsed = JSON.parse(raw) as Partial<SudokuStats>;
    return {
      ...emptyStats,
      ...parsed,
      bestTimes: { ...emptyStats.bestTimes, ...(parsed.bestTimes ?? {}) },
      achievements: parsed.achievements ?? [],
      dailyCompleted: parsed.dailyCompleted ?? [],
    };
  } catch {
    return emptyStats;
  }
}

function coerceGame(value: unknown): SudokuSave | null {
  if (!value) return null;
  return parseGame(JSON.stringify(value));
}

function coerceStats(value: unknown): SudokuStats {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

export function SudokuGame({ onBack }: { onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [game, setGame] = useState<SudokuSave>(() => parseGame(localStorage.getItem(STORAGE_GAME)) ?? generateSudoku('easy'));
  const [stats, setStats] = useState<SudokuStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [warning, setWarning] = useState(false);
  const [completion, setCompletion] = useState<Completion>(null);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const lastSyncRef = useRef(0);

  const selectedValue = selected === null ? 0 : game.values[selected];
  const usedNumbers = useMemo(() => {
    return Array.from({ length: 10 }, (_, number) => game.values.filter(value => value === number).length);
  }, [game.values]);

  const conflicts = useMemo(() => {
    const result = new Set<number>();
    game.values.forEach((value, index) => {
      if (value !== 0 && value !== game.solution[index]) result.add(index);
    });
    return result;
  }, [game.solution, game.values]);

  const gameStopped = !started || paused || game.completed;

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('sudoku_progress')
      .select('current_game, stats')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return;
    const row = data as SudokuRow;
    const cloudGame = coerceGame(row.current_game);
    const cloudStats = coerceStats(row.stats);
    if (cloudGame && !cloudGame.completed) {
      setGame(cloudGame);
      setDifficulty(cloudGame.difficulty);
    }
    setStats(cloudStats);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextGame: SudokuSave, nextStats: SudokuStats, force = false) => {
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
    const { error } = await supabase.from('sudoku_progress').upsert({
      user_id: userId,
      current_game: nextGame,
      stats: nextStats,
      updated_at: new Date().toISOString(),
    });
    setSyncState(error ? 'offline' : 'saved');
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_GAME, JSON.stringify(game));
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
    saveCloud(game, stats);
  }, [game, saveCloud, stats]);

  useEffect(() => {
    if (gameStopped) return undefined;
    const id = window.setInterval(() => {
      setGame(current => ({ ...current, seconds: current.seconds + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameStopped]);

  function startNew(nextDifficulty = difficulty, daily = false, startNow = false) {
    const seed = daily ? `planify-sudoku-${todayKey()}` : undefined;
    const next = generateSudoku(nextDifficulty, seed);
    setDifficulty(nextDifficulty);
    setGame(next);
    setSelected(null);
    setStarted(startNow);
    setPaused(false);
    setCompletion(null);
    void saveCloud(next, stats, true);
  }

  function restart() {
    const next = {
      ...game,
      values: [...game.puzzle],
      notes: Array<string>(81).fill(''),
      seconds: 0,
      mistakes: 0,
      completed: false,
      hintsLeft: DIFFICULTIES.find(item => item.key === game.difficulty)?.hints ?? 3,
    };
    setGame(next);
    setStarted(true);
    setPaused(false);
    setCompletion(null);
  }

  function finishGame(nextGame: SudokuSave) {
    const date = todayKey();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const baseXp = DIFFICULTIES.find(item => item.key === nextGame.difficulty)?.xp ?? 25;
    const dailyBonus = nextGame.dailyKey && !stats.dailyCompleted.includes(date) ? 25 : 0;
    const best = stats.bestTimes[nextGame.difficulty];
    const updatedStats: SudokuStats = {
      ...stats,
      gamesCompleted: stats.gamesCompleted + 1,
      totalSolved: stats.totalSolved + 1,
      totalSeconds: stats.totalSeconds + nextGame.seconds,
      streak: stats.lastSolvedDate === date ? stats.streak : stats.lastSolvedDate === yesterday ? stats.streak + 1 : 1,
      lastSolvedDate: date,
      xp: stats.xp + baseXp + dailyBonus,
      bestTimes: {
        ...stats.bestTimes,
        [nextGame.difficulty]: best === null ? nextGame.seconds : Math.min(best, nextGame.seconds),
      },
      dailyCompleted: nextGame.dailyKey && !stats.dailyCompleted.includes(date)
        ? [...stats.dailyCompleted, date]
        : stats.dailyCompleted,
      achievements: stats.achievements,
    };
    const unlocked = ACHIEVEMENTS
      .filter(item => !updatedStats.achievements.includes(item.id) && item.check(updatedStats, nextGame.difficulty))
      .map(item => item.id);
    updatedStats.achievements = [...updatedStats.achievements, ...unlocked];
    setStats(updatedStats);
    setCompletion({ time: nextGame.seconds, mistakes: nextGame.mistakes, xp: baseXp + dailyBonus, achievements: unlocked });
    void saveCloud(nextGame, updatedStats, true);
  }

  function placeNumber(number: number) {
    if (selected === null || game.fixed[selected] || gameStopped) return;

    setGame(current => {
      if (notesMode && number !== 0) {
        const nextNotes = [...current.notes];
        const note = String(number);
        nextNotes[selected] = nextNotes[selected].includes(note)
          ? nextNotes[selected].replace(note, '')
          : [...nextNotes[selected], note].sort().join('');
        return { ...current, notes: nextNotes };
      }

      const nextValues = [...current.values];
      const nextNotes = [...current.notes];
      let mistakes = current.mistakes;
      nextValues[selected] = number;
      nextNotes[selected] = '';

      if (number !== 0 && number !== current.solution[selected]) {
        mistakes += 1;
        setWarning(true);
        window.setTimeout(() => setWarning(false), 450);
      }

      const nextGame = { ...current, values: nextValues, notes: nextNotes, mistakes };
      if (mistakes >= 3) {
        return { ...nextGame, completed: true };
      }
      if (isBoardComplete(nextValues, current.solution)) {
        const completedGame = { ...nextGame, completed: true };
        window.setTimeout(() => finishGame(completedGame), 50);
        return completedGame;
      }
      return nextGame;
    });
  }

  function hint() {
    if (game.hintsLeft <= 0 || gameStopped) return;
    const candidates = game.values
      .map((value, index) => ({ value, index }))
      .filter(item => item.value !== game.solution[item.index]);
    const target = selected !== null && !game.fixed[selected] && game.values[selected] !== game.solution[selected]
      ? selected
      : candidates[Math.floor(Math.random() * candidates.length)]?.index;
    if (target === undefined) return;
    setGame(current => {
      const nextValues = [...current.values];
      const nextNotes = [...current.notes];
      nextValues[target] = current.solution[target];
      nextNotes[target] = '';
      const nextGame = { ...current, values: nextValues, notes: nextNotes, hintsLeft: current.hintsLeft - 1 };
      if (isBoardComplete(nextValues, current.solution)) {
        const completedGame = { ...nextGame, completed: true };
        window.setTimeout(() => finishGame(completedGame), 50);
        return completedGame;
      }
      return nextGame;
    });
    setSelected(target);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started) return;
      if (event.key >= '1' && event.key <= '9') placeNumber(Number(event.key));
      if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') placeNumber(0);
      if (event.key.toLowerCase() === 'n') setNotesMode(value => !value);
      if (event.key.toLowerCase() === 'h') hint();
      if (selected === null) return;
      const row = Math.floor(selected / 9);
      const col = selected % 9;
      if (event.key === 'ArrowUp') setSelected(Math.max(0, row - 1) * 9 + col);
      if (event.key === 'ArrowDown') setSelected(Math.min(8, row + 1) * 9 + col);
      if (event.key === 'ArrowLeft') setSelected(row * 9 + Math.max(0, col - 1));
      if (event.key === 'ArrowRight') setSelected(row * 9 + Math.min(8, col + 1));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const avgTime = stats.totalSolved > 0 ? Math.round(stats.totalSeconds / stats.totalSolved) : 0;

  return (
    <div className="sudoku-page">
      <header className="sudoku-header">
        <button type="button" className="sudoku-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>Судоку</h2>
          <p>Профессиональная головоломка для тренировки логики и фокуса.</p>
        </div>
        <div className="sudoku-sync">{syncState === 'saving' ? 'Сохраняю…' : syncState === 'saved' ? 'Сохранено' : 'Локально'}</div>
      </header>

      <section className="sudoku-toolbar">
        <div className="sudoku-difficulties" aria-label="Difficulty">
          {DIFFICULTIES.map(item => (
            <button
              key={item.key}
              type="button"
              className={difficulty === item.key ? 'active' : ''}
              onClick={() => startNew(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => startNew(difficulty)}>New Game</button>
        <button type="button" className="ghost" onClick={restart}>Restart</button>
      </section>

      <main className="sudoku-layout">
        <section className={`sudoku-board-card${warning ? ' warning' : ''}`}>
          <div className="sudoku-topline">
            <div><span>Timer</span><strong>{formatTime(game.seconds)}</strong></div>
            <div><span>Mistakes</span><strong>{game.mistakes}/3</strong></div>
            <div><span>Hints</span><strong>{game.hintsLeft}</strong></div>
          </div>

          <div className={`sudoku-board${!started || paused ? ' is-muted' : ''}`} role="grid" aria-label="Sudoku board">
            {game.values.map((value, index) => {
              const row = Math.floor(index / 9);
              const col = index % 9;
              const selectedRow = selected === null ? -1 : Math.floor(selected / 9);
              const selectedCol = selected === null ? -1 : selected % 9;
              const related = selected !== null && (row === selectedRow || col === selectedCol);
              const sameNumber = selectedValue !== 0 && value === selectedValue;
              return (
                <button
                  key={index}
                  type="button"
                  role="gridcell"
                  aria-label={`Cell ${row + 1}-${col + 1}${value ? ` value ${value}` : ''}`}
                  className={[
                    'sudoku-cell',
                    game.fixed[index] ? 'fixed' : '',
                    selected === index ? 'selected' : '',
                    related ? 'related' : '',
                    sameNumber ? 'same-number' : '',
                    conflicts.has(index) ? 'conflict' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (!gameStopped) setSelected(index);
                  }}
                >
                  {value !== 0 ? value : (
                    <span className="sudoku-notes">
                      {Array.from({ length: 9 }, (_, noteIndex) => {
                        const note = String(noteIndex + 1);
                        return <i key={note}>{game.notes[index].includes(note) ? note : ''}</i>;
                      })}
                    </span>
                  )}
                </button>
              );
            })}
            {started && !game.completed && (
              <button
                type="button"
                className="sudoku-pause-button"
                aria-label={paused ? 'Продолжить' : 'Пауза'}
                onClick={() => setPaused(value => !value)}
              >
                <span />
                <span />
              </button>
            )}
            {!started && !game.completed && (
              <div className="sudoku-start-overlay">
                <button
                  type="button"
                  onClick={() => {
                    setStarted(true);
                    setPaused(false);
                  }}
                >
                  Играть
                </button>
              </div>
            )}
            {started && paused && !game.completed && (
              <div className="sudoku-start-overlay">
                <div className="sudoku-pause-menu">
                  <button type="button" onClick={() => setPaused(false)}>Продолжить</button>
                  <button type="button" onClick={restart}>Начать сначала</button>
                  <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                </div>
              </div>
            )}
          </div>

          <div className="sudoku-number-panel">
            {Array.from({ length: 9 }, (_, index) => index + 1).map(number => (
              <button key={number} type="button" disabled={usedNumbers[number] >= 9} onClick={() => placeNumber(number)}>
                <strong>{number}</strong>
                <span>{9 - usedNumbers[number]}</span>
              </button>
            ))}
          </div>

          <div className="sudoku-actions">
            <button type="button" className="ghost" onClick={() => placeNumber(0)}>Erase</button>
            <button type="button" className={notesMode ? 'active' : 'ghost'} onClick={() => setNotesMode(value => !value)}>Notes {notesMode ? 'ON' : 'OFF'}</button>
            <button type="button" onClick={hint} disabled={game.hintsLeft <= 0}>Hint</button>
          </div>
        </section>

        <aside className="sudoku-side">
          <section className="sudoku-stats">
            <h3>Statistics</h3>
            <div><span>Games completed</span><strong>{stats.gamesCompleted}</strong></div>
            <div><span>Average solve time</span><strong>{avgTime ? formatTime(avgTime) : '—'}</strong></div>
            <div><span>Win streak</span><strong>{stats.streak}</strong></div>
            <div><span>Total puzzles solved</span><strong>{stats.totalSolved}</strong></div>
          </section>

          <section className="sudoku-records">
            <h3>Best Times</h3>
            {DIFFICULTIES.map(item => (
              <div key={item.key}><span>{item.label}</span><strong>{stats.bestTimes[item.key] ? formatTime(stats.bestTimes[item.key] ?? 0) : '—'}</strong></div>
            ))}
          </section>
        </aside>
      </main>

      {completion && (
        <div className="sudoku-complete">
          <div className="sudoku-confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => <span key={index} />)}
          </div>
          <div className="sudoku-complete-card">
            <span className="sudoku-complete-icon">✓</span>
            <h3>Головоломка решена!</h3>
            <p>Время: {formatTime(completion.time)} · Ошибки: {completion.mistakes}/3</p>
            <button type="button" onClick={() => startNew(difficulty)}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
