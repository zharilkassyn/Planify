import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode2048 = 'classic' | 'hard' | 'fast' | 'big' | 'endless';
type Direction = 'up' | 'down' | 'left' | 'right';

type Tile = {
  id: string;
  value: number;
  merged: boolean;
  fresh: boolean;
};

type Cell = Tile | null | 'block';

type Save2048 = {
  mode: Mode2048;
  size: number;
  cells: Cell[];
  score: number;
  best: number;
  moves: number;
  seconds: number;
  timeLeft: number;
  paused: boolean;
  won: boolean;
  gameOver: boolean;
  undo: { cells: Cell[]; score: number; moves: number } | null;
  bestTile: number;
  streak: number;
};

type Stats2048 = {
  gamesPlayed: number;
  totalScore: number;
  bestScore: number;
  bestTile: number;
  longestStreak: number;
  achievements: string[];
};

type Row2048 = {
  current_game: unknown;
  stats: unknown;
};

const STORAGE_GAME = 'planify_2048_game';
const STORAGE_STATS = 'planify_2048_stats';
const FAST_SECONDS = 120;

const MODES: Array<{ key: Mode2048; title: string; desc: string }> = [
  { key: 'classic', title: '🔲 Классика', desc: 'Standard 4×4' },
  { key: 'hard', title: '🧠 Сложный', desc: 'Random obstacles' },
  { key: 'fast', title: '⚡ Быстрый', desc: '2 minute challenge' },
  { key: 'big', title: '⬜ Большое поле', desc: '5×5 board' },
  { key: 'endless', title: '🌌 Бесконечный', desc: 'Unlimited play' },
];

const ACHIEVEMENTS = [
  { id: 'first-merge', title: '🟦 Первое объединение', check: (game: Save2048, _stats: Stats2048) => game.moves > 0 },
  { id: 'move-streak', title: '🔥 Серия ходов', check: (game: Save2048, stats: Stats2048) => Math.max(game.streak, stats.longestStreak) >= 20 },
  { id: 'tile-2048', title: '🏆 Достиг 2048', check: (game: Save2048, stats: Stats2048) => Math.max(game.bestTile, stats.bestTile) >= 2048 },
  { id: 'fast-player', title: '⚡ Быстрый игрок', check: (game: Save2048, _stats: Stats2048) => game.mode === 'fast' && game.score >= 1200 },
];

const emptyStats: Stats2048 = {
  gamesPlayed: 0,
  totalScore: 0,
  bestScore: 0,
  bestTile: 2,
  longestStreak: 0,
  achievements: [],
};

function id() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function createTile(value = Math.random() < 0.9 ? 2 : 4): Tile {
  return { id: id(), value, fresh: true, merged: false };
}

function sizeForMode(mode: Mode2048) {
  return mode === 'big' ? 5 : 4;
}

function createGame(mode: Mode2048, best = 0): Save2048 {
  const size = sizeForMode(mode);
  let cells: Cell[] = Array<Cell>(size * size).fill(null);
  if (mode === 'hard') {
    const blocks = new Set<number>();
    while (blocks.size < 2) blocks.add(Math.floor(Math.random() * cells.length));
    blocks.forEach(index => { cells[index] = 'block'; });
  }
  cells = addRandomTile(addRandomTile(cells));
  return {
    mode,
    size,
    cells,
    score: 0,
    best,
    moves: 0,
    seconds: 0,
    timeLeft: FAST_SECONDS,
    paused: false,
    won: false,
    gameOver: false,
    undo: null,
    bestTile: 2,
    streak: 0,
  };
}

function addRandomTile(cells: Cell[]) {
  const empty = cells.map((cell, index) => cell === null ? index : -1).filter(index => index >= 0);
  if (empty.length === 0) return cells;
  const next = [...cells];
  next[empty[Math.floor(Math.random() * empty.length)]] = createTile();
  return next;
}

function parseGame(raw: string | null): Save2048 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Save2048;
    if (Array.isArray(parsed.cells) && parsed.size) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseStats(raw: string | null): Stats2048 {
  if (!raw) return emptyStats;
  try {
    const parsed = JSON.parse(raw) as Partial<Stats2048>;
    return { ...emptyStats, ...parsed, achievements: parsed.achievements ?? [] };
  } catch {
    return emptyStats;
  }
}

function coerceGame(value: unknown): Save2048 | null {
  if (!value) return null;
  return parseGame(JSON.stringify(value));
}

function coerceStats(value: unknown): Stats2048 {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

function cloneCells(cells: Cell[]): Cell[] {
  return cells.map(cell => cell && cell !== 'block' ? { ...cell, fresh: false, merged: false } : cell);
}

function isTile(cell: Cell): cell is Tile {
  return typeof cell === 'object' && cell !== null;
}

function lineIndexes(size: number, direction: Direction, line: number) {
  const indexes: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (direction === 'left') indexes.push(line * size + i);
    if (direction === 'right') indexes.push(line * size + (size - 1 - i));
    if (direction === 'up') indexes.push(i * size + line);
    if (direction === 'down') indexes.push((size - 1 - i) * size + line);
  }
  return indexes;
}

function moveCells(cells: Cell[], size: number, direction: Direction) {
  const next = cloneCells(cells);
  let gained = 0;
  let moved = false;
  let maxTile = 2;

  for (let line = 0; line < size; line += 1) {
    const indexes = lineIndexes(size, direction, line);
    const segments: number[][] = [[]];
    indexes.forEach(index => {
      if (next[index] === 'block') segments.push([]);
      else segments[segments.length - 1].push(index);
    });

    segments.forEach(segment => {
      const tiles = segment.map(index => next[index]).filter(isTile);
      const merged: Tile[] = [];
      for (let i = 0; i < tiles.length; i += 1) {
        const current = tiles[i];
        const following = tiles[i + 1];
        if (following && current.value === following.value) {
          const value = current.value * 2;
          merged.push({ id: id(), value, merged: true, fresh: false });
          gained += value;
          maxTile = Math.max(maxTile, value);
          i += 1;
        } else {
          merged.push({ ...current, merged: false, fresh: false });
          maxTile = Math.max(maxTile, current.value);
        }
      }
      segment.forEach((index, i) => {
        const value = merged[i] ?? null;
        if (JSON.stringify(next[index]) !== JSON.stringify(value)) moved = true;
        next[index] = value;
      });
    });
  }
  return { cells: next, gained, moved, maxTile };
}

function canMove(cells: Cell[], size: number) {
  if (cells.some(cell => cell === null)) return true;
  return (['up', 'down', 'left', 'right'] as Direction[]).some(direction => moveCells(cells, size, direction).moved);
}

export function Game2048({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats2048>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [game, setGame] = useState<Save2048>(() => parseGame(localStorage.getItem(STORAGE_GAME)) ?? createGame('classic'));
  const [floating, setFloating] = useState<Array<{ id: string; text: string }>>([]);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [started, setStarted] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lastSyncRef = useRef(0);

  const averageScore = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
  const gameStopped = !started || game.paused || game.gameOver;

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error } = await supabase.from('game_2048_progress').select('current_game, stats').eq('user_id', userId).maybeSingle();
    if (error || !data) return;
    const row = data as Row2048;
    const cloudGame = coerceGame(row.current_game);
    const cloudStats = coerceStats(row.stats);
    if (cloudGame && !cloudGame.gameOver) setGame(cloudGame);
    setStats(cloudStats);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextGame: Save2048, nextStats: Stats2048, force = false) => {
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
    const { error } = await supabase.from('game_2048_progress').upsert({
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
    void saveCloud(game, stats);
  }, [game, saveCloud, stats]);

  function updateStats(finalGame: Save2048) {
    const base: Stats2048 = {
      ...stats,
      gamesPlayed: stats.gamesPlayed + 1,
      totalScore: stats.totalScore + finalGame.score,
      bestScore: Math.max(stats.bestScore, finalGame.score),
      bestTile: Math.max(stats.bestTile, finalGame.bestTile),
      longestStreak: Math.max(stats.longestStreak, finalGame.streak),
    };
    const unlocked = ACHIEVEMENTS
      .filter(item => !base.achievements.includes(item.id) && item.check(finalGame, base))
      .map(item => item.id);
    const nextStats = { ...base, achievements: [...base.achievements, ...unlocked] };
    setStats(nextStats);
    void saveCloud(finalGame, nextStats, true);
  }

  function start(mode: Mode2048 = game.mode, startNow = false) {
    setStarted(startNow);
    setGame(createGame(mode, stats.bestScore));
    setFloating([]);
  }

  function move(direction: Direction) {
    if (gameStopped) return;
    const result = moveCells(game.cells, game.size, direction);
    if (!result.moved) return;
    const withNewTile = addRandomTile(result.cells);
    const nextScore = game.score + result.gained;
    const bestTile = Math.max(game.bestTile, result.maxTile, ...withNewTile.map(cell => cell && cell !== 'block' ? cell.value : 0));
    const next: Save2048 = {
      ...game,
      cells: withNewTile,
      score: nextScore,
      best: Math.max(game.best, stats.bestScore, nextScore),
      moves: game.moves + 1,
      undo: { cells: cloneCells(game.cells), score: game.score, moves: game.moves },
      won: game.won || bestTile >= 2048,
      gameOver: !canMove(withNewTile, game.size),
      bestTile,
      streak: result.gained > 0 ? game.streak + 1 : 0,
    };
    if (result.gained > 0) {
      setFloating(items => [...items, { id: id(), text: `+${result.gained}` }]);
      window.setTimeout(() => setFloating(items => items.slice(1)), 800);
      if ('vibrate' in navigator) navigator.vibrate(14);
    }
    setGame(next);
    if (next.gameOver) updateStats(next);
  }

  useEffect(() => {
    if (gameStopped) return undefined;
    const idTimer = window.setInterval(() => {
      setGame(current => {
        const timeLeft = current.mode === 'fast' ? Math.max(0, current.timeLeft - 1) : current.timeLeft;
        const next = { ...current, seconds: current.seconds + 1, timeLeft };
        if (current.mode === 'fast' && timeLeft === 0) {
          const over = { ...next, gameOver: true };
          updateStats(over);
          return over;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(idTimer);
  }, [gameStopped]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
      }
      if (event.key === 'ArrowUp' || key === 'w') move('up');
      if (event.key === 'ArrowDown' || key === 's') move('down');
      if (event.key === 'ArrowLeft' || key === 'a') move('left');
      if (event.key === 'ArrowRight' || key === 'd') move('right');
      if (key === 'p' && started) setGame(current => ({ ...current, paused: !current.paused }));
      if (event.key.toLowerCase() === 'n') start();
      if (event.key.toLowerCase() === 'u') undo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function undo() {
    if (!game.undo) return;
    setGame(current => ({
      ...current,
      cells: current.undo?.cells ?? current.cells,
      score: current.undo?.score ?? current.score,
      moves: current.undo?.moves ?? current.moves,
      undo: null,
      gameOver: false,
    }));
  }

  function swipe(dx: number, dy: number) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }

  function touchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    swipe(touch.clientX - touchStart.current.x, touch.clientY - touchStart.current.y);
    touchStart.current = null;
  }

  function pointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    swipe(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
    pointerStart.current = null;
  }

  function isOverlayTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest('.g2048-start-overlay, .g2048-pause-button'));
  }

  const boardStyle = { gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))` };
  const wonOverlay = game.won && !game.gameOver && game.bestTile >= 2048;

  return (
    <div className="g2048-page">
      <header className="g2048-header">
        <button type="button" className="g2048-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>2048</h2>
          <p>Объединяй числа и перезагружай мозг</p>
        </div>
        <span className="g2048-sync">{syncState === 'saving' ? 'Сохраняю…' : syncState === 'saved' ? 'Сохранено' : 'Локально'}</span>
      </header>

      <section className="g2048-topbar">
        <div><span>⭐ Очки</span><strong>{game.score}</strong></div>
        <div><span>🏆 Рекорд</span><strong>{Math.max(game.best, stats.bestScore)}</strong></div>
        <div><span>🔄 Ходы</span><strong>{game.moves}</strong></div>
        <div><span>⏱ Время</span><strong>{formatTime(game.mode === 'fast' ? game.timeLeft : game.seconds)}</strong></div>
        <button type="button" onClick={undo}>↩️ Отменить</button>
        <button type="button" onClick={() => start()}>🔄 Новая игра</button>
      </section>

      <main className="g2048-layout">
        <section className="g2048-game-card">
          <div
            className={`g2048-board size-${game.size}${!started || game.paused ? ' is-muted' : ''}`}
            style={boardStyle}
            onTouchStart={event => {
              if (isOverlayTarget(event.target)) return;
              touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }}
            onTouchEnd={touchEnd}
            onPointerDown={event => {
              if (isOverlayTarget(event.target)) return;
              if (event.pointerType === 'touch') return;
              pointerStart.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={pointerEnd}
            onPointerCancel={() => { pointerStart.current = null; }}
            aria-label="2048 board"
          >
            {game.cells.map((cell, index) => (
              <div key={cell && cell !== 'block' ? cell.id : `cell-${index}`} className={`g2048-tile ${cell === 'block' ? 'block' : cell ? `tile-${cell.value}${cell.fresh ? ' fresh' : ''}${cell.merged ? ' merged' : ''}` : 'empty'}`}>
                {cell && cell !== 'block' ? cell.value : cell === 'block' ? '✦' : ''}
              </div>
            ))}
            {floating.map(item => <span key={item.id} className="g2048-float">{item.text}</span>)}
            {started && !game.gameOver && (
              <button
                type="button"
                className="g2048-pause-button"
                aria-label={game.paused ? 'Продолжить' : 'Пауза'}
                onClick={() => setGame(current => ({ ...current, paused: !current.paused }))}
              >
                <span />
                <span />
              </button>
            )}
            {!started && !game.gameOver && (
              <div
                className="g2048-start-overlay"
                onPointerDown={event => event.stopPropagation()}
                onTouchStart={event => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setStarted(true);
                    setGame(current => ({ ...current, paused: false }));
                  }}
                >
                  Начать
                </button>
              </div>
            )}
            {started && game.paused && !game.gameOver && (
              <div
                className="g2048-start-overlay"
                onPointerDown={event => event.stopPropagation()}
                onTouchStart={event => event.stopPropagation()}
              >
                <div className="g2048-pause-menu">
                  <button type="button" onClick={() => setGame(current => ({ ...current, paused: false }))}>Продолжить</button>
                  <button type="button" onClick={() => start(game.mode, true)}>Начать сначала</button>
                  <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="g2048-sidebar">
          <section>
            <h3>Game modes</h3>
            <div className="g2048-modes">
              {MODES.map(mode => (
                <button key={mode.key} type="button" className={game.mode === mode.key ? 'active' : ''} onClick={() => start(mode.key)}>
                  <strong>{mode.title}</strong>
                  <span>{mode.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Statistics</h3>
            <div className="g2048-stat"><span>Games played</span><strong>{stats.gamesPlayed}</strong></div>
            <div className="g2048-stat"><span>Average score</span><strong>{averageScore}</strong></div>
            <div className="g2048-stat"><span>Longest streak</span><strong>{stats.longestStreak}</strong></div>
          </section>
        </aside>
      </main>

      {wonOverlay && (
        <div className="g2048-modal">
          <div className="g2048-modal-card">
            <h3>Ты достиг 2048 🎉</h3>
            <p>Final score: <strong>{game.score}</strong></p>
            <p>Moves: <strong>{game.moves}</strong></p>
            <p>Time: <strong>{formatTime(game.seconds)}</strong></p>
            <p>Best combo: <strong>{game.streak}</strong></p>
            <div className="g2048-modal-actions">
              <button type="button" onClick={() => setGame(current => ({ ...current, won: false }))}>Продолжить</button>
              <button type="button" className="ghost" onClick={() => start()}>Играть снова</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}

      {game.gameOver && (
        <div className="g2048-modal">
          <div className="g2048-modal-card">
            <h3>Поле заполнено</h3>
            <p>Final score: <strong>{game.score}</strong></p>
            <div className="g2048-modal-actions">
              <button type="button" onClick={() => start()}>Попробовать снова</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
