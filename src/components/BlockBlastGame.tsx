import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type CellColor = '' | 'violet' | 'blue' | 'cyan' | 'green' | 'amber' | 'rose';
type Board = CellColor[];
type GameMode = 'endless' | 'session';

type ShapeCell = { r: number; c: number };
type BlockPiece = {
  id: string;
  shapeId: string;
  color: Exclude<CellColor, ''>;
  cells: ShapeCell[];
};

type BlockSave = {
  board: Board;
  tray: Array<BlockPiece | null>;
  score: number;
  best: number;
  combo: number;
  bestCombo: number;
  linesCleared: number;
  seconds: number;
  sessionLeft: number;
  mode: GameMode;
  paused: boolean;
  gameOver: boolean;
  dailyLines: number;
};

type BlockStats = {
  gamesPlayed: number;
  bestScore: number;
  bestCombo: number;
  longestSession: number;
  totalLines: number;
  xp: number;
  achievements: string[];
  dailyCompleted: string[];
};

type BlockRow = {
  current_game: unknown;
  stats: unknown;
};

type FloatingScore = {
  id: string;
  text: string;
  x: number;
  y: number;
};

type DragPreview = {
  pieceIndex: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
};

const STORAGE_GAME = 'planify_block_blast_game';
const STORAGE_STATS = 'planify_block_blast_stats';
const SIZE = 8;
const CELL_COUNT = SIZE * SIZE;
const SESSION_SECONDS = 4 * 60;
const COLORS: Array<Exclude<CellColor, ''>> = ['violet', 'blue', 'cyan', 'green', 'amber', 'rose'];

const SHAPES: Array<{ id: string; cells: ShapeCell[] }> = [
  { id: 'single', cells: [{ r: 0, c: 0 }] },
  { id: 'line2h', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }] },
  { id: 'line3h', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] },
  { id: 'line4h', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }] },
  { id: 'line2v', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }] },
  { id: 'line3v', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }] },
  { id: 'square2', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }] },
  { id: 'l3', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }] },
  { id: 'l4', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 2, c: 1 }] },
  { id: 't4', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 1 }] },
  { id: 'z4', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 }] },
  { id: 'corner5', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }] },
];

const ACHIEVEMENTS = [
  { id: 'first-row', title: '🟪 Первый ряд', check: (stats: BlockStats, game: BlockSave) => stats.totalLines + game.linesCleared >= 1 },
  { id: 'combo-master', title: '🔥 Комбо мастер', check: (stats: BlockStats, game: BlockSave) => Math.max(stats.bestCombo, game.bestCombo) >= 5 },
  { id: 'score-10000', title: '🏆 10 000 очков', check: (stats: BlockStats, game: BlockSave) => Math.max(stats.bestScore, game.score) >= 10000 },
  { id: 'fast-game', title: '⚡ Быстрая игра', check: (_stats: BlockStats, game: BlockSave) => game.mode === 'session' && game.score >= 1500 },
];

const emptyStats: BlockStats = {
  gamesPlayed: 0,
  bestScore: 0,
  bestCombo: 0,
  longestSession: 0,
  totalLines: 0,
  xp: 0,
  achievements: [],
  dailyCompleted: [],
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function emptyBoard(): Board {
  return Array<CellColor>(CELL_COUNT).fill('');
}

function randomId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPiece(): BlockPiece {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    id: randomId('piece'),
    shapeId: shape.id,
    color,
    cells: shape.cells,
  };
}

function createTray(): Array<BlockPiece | null> {
  return [createPiece(), createPiece(), createPiece()];
}

function createGame(mode: GameMode, best = 0): BlockSave {
  return {
    board: emptyBoard(),
    tray: createTray(),
    score: 0,
    best,
    combo: 0,
    bestCombo: 0,
    linesCleared: 0,
    seconds: 0,
    sessionLeft: SESSION_SECONDS,
    mode,
    paused: false,
    gameOver: false,
    dailyLines: 0,
  };
}

function normalizeCells(cells: ShapeCell[]) {
  const minR = Math.min(...cells.map(cell => cell.r));
  const minC = Math.min(...cells.map(cell => cell.c));
  return cells.map(cell => ({ r: cell.r - minR, c: cell.c - minC }));
}

function pieceBounds(piece: BlockPiece) {
  const normalized = normalizeCells(piece.cells);
  return {
    rows: Math.max(...normalized.map(cell => cell.r)) + 1,
    cols: Math.max(...normalized.map(cell => cell.c)) + 1,
  };
}

function canPlace(board: Board, piece: BlockPiece, origin: number) {
  const baseRow = Math.floor(origin / SIZE);
  const baseCol = origin % SIZE;
  return normalizeCells(piece.cells).every(cell => {
    const row = baseRow + cell.r;
    const col = baseCol + cell.c;
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return false;
    return board[row * SIZE + col] === '';
  });
}

function placedIndexes(piece: BlockPiece, origin: number) {
  const baseRow = Math.floor(origin / SIZE);
  const baseCol = origin % SIZE;
  return normalizeCells(piece.cells).map(cell => (baseRow + cell.r) * SIZE + baseCol + cell.c);
}

function findCompletedLines(board: Board) {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < SIZE; r += 1) {
    if (Array.from({ length: SIZE }, (_, c) => board[r * SIZE + c]).every(Boolean)) rows.push(r);
  }
  for (let c = 0; c < SIZE; c += 1) {
    if (Array.from({ length: SIZE }, (_, r) => board[r * SIZE + c]).every(Boolean)) cols.push(c);
  }
  return { rows, cols };
}

function hasMove(board: Board, tray: Array<BlockPiece | null>) {
  return tray.some(piece => {
    if (!piece) return false;
    return board.some((_cell, index) => canPlace(board, piece, index));
  });
}

function parseGame(raw: string | null): BlockSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BlockSave;
    if (Array.isArray(parsed.board) && parsed.board.length === CELL_COUNT && Array.isArray(parsed.tray)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseStats(raw: string | null): BlockStats {
  if (!raw) return emptyStats;
  try {
    const parsed = JSON.parse(raw) as Partial<BlockStats>;
    return {
      ...emptyStats,
      ...parsed,
      achievements: parsed.achievements ?? [],
      dailyCompleted: parsed.dailyCompleted ?? [],
    };
  } catch {
    return emptyStats;
  }
}

function coerceGame(value: unknown): BlockSave | null {
  if (!value) return null;
  return parseGame(JSON.stringify(value));
}

function coerceStats(value: unknown): BlockStats {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

function PiecePreview({ piece, compact = false }: { piece: BlockPiece; compact?: boolean }) {
  const bounds = pieceBounds(piece);
  const cells = normalizeCells(piece.cells);
  return (
    <div
      className={`bb-piece-shape${compact ? ' compact' : ''}`}
      style={{ gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`, gridTemplateRows: `repeat(${bounds.rows}, 1fr)` }}
    >
      {Array.from({ length: bounds.rows * bounds.cols }, (_, index) => {
        const row = Math.floor(index / bounds.cols);
        const col = index % bounds.cols;
        const filled = cells.some(cell => cell.r === row && cell.c === col);
        return (
          <span
            key={index}
            className={filled ? `filled ${piece.color}` : ''}
            data-shape-cell={filled ? 'true' : undefined}
            data-shape-row={filled ? row : undefined}
            data-shape-col={filled ? col : undefined}
          />
        );
      })}
    </div>
  );
}

export function BlockBlastGame({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<BlockStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [game, setGame] = useState<BlockSave>(() => parseGame(localStorage.getItem(STORAGE_GAME)) ?? createGame('endless'));
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [preview, setPreview] = useState<number[]>([]);
  const [invalid, setInvalid] = useState(false);
  const [cleared, setCleared] = useState<number[]>([]);
  const [floating, setFloating] = useState<FloatingScore[]>([]);
  const [completion, setCompletion] = useState(false);
  const [started, setStarted] = useState(false);
  const lastSyncRef = useRef(0);

  const activePieceIndex = dragPreview?.pieceIndex ?? selectedPiece;
  const activePiece = activePieceIndex === null ? null : game.tray[activePieceIndex];
  const dailyDone = stats.dailyCompleted.includes(todayKey());
  const gameStopped = !started || game.paused || game.gameOver;

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from('block_blast_progress')
      .select('current_game, stats')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as BlockRow;
    const cloudStats = coerceStats(row.stats);
    const cloudGame = coerceGame(row.current_game);
    setStats(cloudStats);
    if (cloudGame && !cloudGame.gameOver) setGame(cloudGame);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextGame: BlockSave, nextStats: BlockStats, force = false) => {
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 10000) return;
    lastSyncRef.current = now;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { error } = await supabase.from('block_blast_progress').upsert({
      user_id: userId,
      current_game: nextGame,
      stats: nextStats,
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn('Block Blast progress save failed', error);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_GAME, JSON.stringify(game));
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
    void saveCloud(game, stats);
  }, [game, saveCloud, stats]);

  function updateStatsForGameOver(finalGame: BlockSave) {
    const today = todayKey();
    const xp = Math.floor(finalGame.score / 120) + finalGame.linesCleared * 4 + (finalGame.dailyLines >= 5 && !dailyDone ? 40 : 0);
    const baseStats: BlockStats = {
      ...stats,
      gamesPlayed: stats.gamesPlayed + 1,
      bestScore: Math.max(stats.bestScore, finalGame.score),
      bestCombo: Math.max(stats.bestCombo, finalGame.bestCombo),
      longestSession: Math.max(stats.longestSession, finalGame.seconds),
      totalLines: stats.totalLines + finalGame.linesCleared,
      xp: stats.xp + xp,
      dailyCompleted: finalGame.dailyLines >= 5 && !stats.dailyCompleted.includes(today)
        ? [...stats.dailyCompleted, today]
        : stats.dailyCompleted,
    };
    const unlocked = ACHIEVEMENTS
      .filter(item => !baseStats.achievements.includes(item.id) && item.check(baseStats, finalGame))
      .map(item => item.id);
    const nextStats = { ...baseStats, achievements: [...baseStats.achievements, ...unlocked] };
    setStats(nextStats);
    void saveCloud(finalGame, nextStats, true);
  }

  useEffect(() => {
    if (gameStopped) return undefined;
    const id = window.setInterval(() => {
      setGame(current => {
        const sessionLeft = current.mode === 'session' ? Math.max(0, current.sessionLeft - 1) : current.sessionLeft;
        const next = { ...current, seconds: current.seconds + 1, sessionLeft };
        if (current.mode === 'session' && sessionLeft === 0) {
          const over = { ...next, gameOver: true };
          window.setTimeout(() => {
            setCompletion(true);
            updateStatsForGameOver(over);
          }, 40);
          return over;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameStopped]);

  function startGame(mode: GameMode = game.mode, startNow = false) {
    const next = createGame(mode, stats.bestScore);
    setStarted(startNow);
    setGame(next);
    setCompletion(false);
    setPreview([]);
    setSelectedPiece(null);
    void saveCloud(next, stats, true);
  }

  function continueGame() {
    setStarted(true);
    setGame(current => ({ ...current, paused: false, gameOver: false }));
    setCompletion(false);
  }

  function showInvalid() {
    setInvalid(true);
    if ('vibrate' in navigator) navigator.vibrate(24);
    window.setTimeout(() => setInvalid(false), 360);
  }

  function addFloating(text: string) {
    setFloating(current => [...current, { id: randomId('score'), text, x: 50 + Math.random() * 20, y: 34 + Math.random() * 20 }]);
    window.setTimeout(() => {
      setFloating(current => current.slice(1));
    }, 900);
  }

  function placePiece(pieceIndex: number, origin: number) {
    const piece = game.tray[pieceIndex];
    if (!piece || gameStopped) return;
    if (!canPlace(game.board, piece, origin)) {
      showInvalid();
      return;
    }

    const indexes = placedIndexes(piece, origin);
    const nextBoard = [...game.board];
    indexes.forEach(index => { nextBoard[index] = piece.color; });
    const lines = findCompletedLines(nextBoard);
    const clearSet = new Set<number>();
    lines.rows.forEach(row => {
      for (let col = 0; col < SIZE; col += 1) clearSet.add(row * SIZE + col);
    });
    lines.cols.forEach(col => {
      for (let row = 0; row < SIZE; row += 1) clearSet.add(row * SIZE + col);
    });

    const lineCount = lines.rows.length + lines.cols.length;
    if (lineCount > 0) {
      clearSet.forEach(index => { nextBoard[index] = ''; });
      setCleared([...clearSet]);
      window.setTimeout(() => setCleared([]), 520);
    }

    const nextTray = [...game.tray];
    nextTray[pieceIndex] = null;
    const refilledTray = nextTray.every(item => item === null) ? createTray() : nextTray;
    const combo = lineCount > 0 ? game.combo + 1 : 0;
    const gained = indexes.length * 10 + lineCount * 140 * Math.max(1, combo);
    const nextScore = game.score + gained;
    const nextGame: BlockSave = {
      ...game,
      board: nextBoard,
      tray: refilledTray,
      score: nextScore,
      best: Math.max(game.best, nextScore, stats.bestScore),
      combo,
      bestCombo: Math.max(game.bestCombo, combo),
      linesCleared: game.linesCleared + lineCount,
      dailyLines: Math.min(5, game.dailyLines + lineCount),
    };
    const over = !hasMove(nextBoard, refilledTray);
    const finalGame = over ? { ...nextGame, gameOver: true } : nextGame;
    setGame(finalGame);
    setPreview([]);
    setSelectedPiece(null);
    if (gained > 0) addFloating(`+${gained}`);
    if (over) {
      setCompletion(true);
      updateStatsForGameOver(finalGame);
    }
  }

  function handleCellEnter(index: number) {
    if (!activePiece || gameStopped) return;
    setPreview(canPlace(game.board, activePiece, index) ? placedIndexes(activePiece, index) : []);
  }

  function handleCellClick(index: number) {
    if (selectedPiece === null || gameStopped) return;
    placePiece(selectedPiece, index);
  }

  function boardIndexFromPoint(x: number, y: number) {
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = target?.closest('.block-cell') as HTMLElement | null;
    const index = Number(cell?.dataset.boardIndex);
    return Number.isFinite(index) ? index : null;
  }

  function centeredOrigin(piece: BlockPiece, boardIndex: number) {
    const bounds = pieceBounds(piece);
    const row = Math.floor(boardIndex / SIZE) - Math.round((bounds.rows - 1) / 2);
    const col = (boardIndex % SIZE) - Math.round((bounds.cols - 1) / 2);
    return row * SIZE + col;
  }

  function updateDragPreview(piece: BlockPiece, x: number, y: number) {
    const boardIndex = boardIndexFromPoint(x, y);
    if (boardIndex === null) {
      setPreview([]);
      return null;
    }
    const origin = centeredOrigin(piece, boardIndex);
    setPreview(canPlace(game.board, piece, origin) ? placedIndexes(piece, origin) : []);
    return origin;
  }

  function startPieceDrag(event: PointerEvent<HTMLButtonElement>, pieceIndex: number, piece: BlockPiece) {
    if (gameStopped) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedPiece(null);
    setDragPreview({ pieceIndex, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    updateDragPreview(piece, event.clientX, event.clientY);
  }

  function movePieceDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragPreview) return;
    const piece = game.tray[dragPreview.pieceIndex];
    if (!piece) return;
    event.preventDefault();
    setDragPreview(current => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    updateDragPreview(piece, event.clientX, event.clientY);
  }

  function finishPieceDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragPreview) return;
    const piece = game.tray[dragPreview.pieceIndex];
    const distance = Math.hypot(event.clientX - dragPreview.startX, event.clientY - dragPreview.startY);
    if (!piece) {
      setDragPreview(null);
      setPreview([]);
      return;
    }
    if (distance < 8) {
      setSelectedPiece(current => current === dragPreview.pieceIndex ? null : dragPreview.pieceIndex);
      setDragPreview(null);
      setPreview([]);
      return;
    }
    const origin = updateDragPreview(piece, event.clientX, event.clientY);
    if (origin !== null) placePiece(dragPreview.pieceIndex, origin);
    else showInvalid();
    setDragPreview(null);
    setPreview([]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!started) return;
      if (event.key >= '1' && event.key <= '3') {
        const index = Number(event.key) - 1;
        if (game.tray[index]) setSelectedPiece(index);
      }
      if (event.key.toLowerCase() === 'p') setGame(current => ({ ...current, paused: !current.paused }));
      if (event.key === 'Escape') setSelectedPiece(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.tray, started]);

  return (
    <div className="block-page">
      <header className="block-header">
        <button type="button" className="block-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>Block Blast</h2>
          <p>Сделай перерыв и очисти поле</p>
        </div>
      </header>

      <section className="block-topbar">
        <div><span>⭐ Очки</span><strong>{game.score}</strong></div>
        <div><span>🔥 Комбо</span><strong>×{game.combo || 1}</strong></div>
        <div><span>🏆 Рекорд</span><strong>{Math.max(game.best, stats.bestScore)}</strong></div>
        <div><span>⏱ Время</span><strong>{formatTime(game.mode === 'session' ? game.sessionLeft : game.seconds)}</strong></div>
      </section>

      <main className="block-layout">
        <section className={`block-game-card${invalid ? ' invalid' : ''}`}>
          <div className="block-mode-switch">
            <button type="button" className={game.mode === 'endless' ? 'active' : ''} onClick={() => startGame('endless')}>Endless</button>
            <button type="button" className={game.mode === 'session' ? 'active' : ''} onClick={() => startGame('session')}>Session 4:00</button>
          </div>

          <div className="block-board-wrap">
            <div className={`block-board-game${!started || game.paused ? ' is-muted' : ''}`} onDragLeave={() => setPreview([])}>
              {game.board.map((cell, index) => (
                <button
                  key={index}
                  type="button"
                  className={[
                    'block-cell',
                    cell ? `filled ${cell}` : '',
                    preview.includes(index) ? `preview ${activePiece?.color ?? ''}` : '',
                    cleared.includes(index) ? 'cleared' : '',
                  ].filter(Boolean).join(' ')}
                  data-board-index={index}
                  onMouseEnter={() => handleCellEnter(index)}
                  onClick={() => handleCellClick(index)}
                  aria-label={`Block cell ${index + 1}`}
                />
              ))}
              {floating.map(item => (
                <span key={item.id} className="block-floating-score" style={{ left: `${item.x}%`, top: `${item.y}%` }}>{item.text}</span>
              ))}
              {started && !game.gameOver && (
                <button
                  type="button"
                  className="block-pause-button"
                  aria-label={game.paused ? 'Продолжить' : 'Пауза'}
                  onClick={() => setGame(current => ({ ...current, paused: !current.paused }))}
                >
                  <span />
                  <span />
                </button>
              )}
              {!started && !game.gameOver && (
                <div className="block-start-overlay">
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
                <div className="block-start-overlay">
                  <div className="block-pause-menu">
                    <button type="button" onClick={continueGame}>Продолжить</button>
                    <button type="button" onClick={() => startGame(game.mode, true)}>Начать сначала</button>
                    <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="block-tray" aria-label="Available blocks">
            {game.tray.map((piece, index) => (
              <button
                key={piece?.id ?? `empty-${index}`}
                type="button"
                className={`block-piece-slot${selectedPiece === index ? ' selected' : ''}`}
                onPointerDown={event => piece && startPieceDrag(event, index, piece)}
                onPointerMove={movePieceDrag}
                onPointerUp={finishPieceDrag}
                onPointerCancel={() => {
                  setDragPreview(null);
                  setPreview([]);
                }}
                disabled={!piece}
              >
                {piece ? <PiecePreview piece={piece} /> : <span className="block-empty-piece" />}
              </button>
            ))}
          </div>
          {dragPreview && game.tray[dragPreview.pieceIndex] && (
            <div className="block-drag-ghost" style={{ left: dragPreview.x, top: dragPreview.y }}>
              <PiecePreview piece={game.tray[dragPreview.pieceIndex] as BlockPiece} />
            </div>
          )}
        </section>
      </main>

      {completion && (
        <div className="block-over">
          <div className="block-over-card">
            <h3>Отличная попытка ✨</h3>
            <p>Final score: <strong>{game.score}</strong></p>
            <p>Lines cleared: <strong>{game.linesCleared}</strong></p>
            <p>Best combo: <strong>×{game.bestCombo}</strong></p>
            <div className="block-over-actions">
              <button type="button" onClick={() => startGame(game.mode)}>Играть снова</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
