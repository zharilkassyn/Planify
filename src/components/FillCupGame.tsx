import { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { supabase } from '../lib/supabase';

type CupMode = 'classic' | 'time' | 'hard' | 'endless';
type Tool = 'draw' | 'erase';

type DrawLine = {
  id: string;
  points: Array<{ x: number; y: number }>;
};

type CupSave = {
  level: number;
  mode: CupMode;
  seconds: number;
  lines: DrawLine[];
  undone: DrawLine[];
  completed: number;
  dailyDone: string[];
  sound: boolean;
  paused: boolean;
  stars: number;
};

type CupStats = {
  completed: number;
  bestTime: number | null;
  xp: number;
  streak: number;
  themes: string[];
  cups: string[];
  effects: string[];
};

type CupRow = {
  current_game: unknown;
  stats: unknown;
};

type WaterParticle = {
  body: Matter.Body;
  bornAt: number;
};

const STORAGE_GAME = 'planify_fill_cup_game';
const STORAGE_STATS = 'planify_fill_cup_stats';
const MAX_LEVELS = 50;
const SCENE_W = 860;
const SCENE_H = 560;
const GLASS = { x: 600, y: 380, w: 120, h: 142 };
const SOURCE = { x: 216, y: 86 };

const emptyStats: CupStats = {
  completed: 0,
  bestTime: null,
  xp: 0,
  streak: 0,
  themes: ['Cloud Blue'],
  cups: ['Classic Glass'],
  effects: ['Soft Splash'],
};

function createSave(mode: CupMode = 'classic', level = 1): CupSave {
  return {
    level,
    mode,
    seconds: 0,
    lines: [],
    undone: [],
    completed: 0,
    dailyDone: [],
    sound: true,
    paused: false,
    stars: 3,
  };
}

function parseGame(raw: string | null): CupSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CupSave;
    if (typeof parsed.level === 'number' && Array.isArray(parsed.lines)) {
      const level = Math.max(1, Math.min(MAX_LEVELS, parsed.level));
      const completed = Math.max(0, Math.min(MAX_LEVELS, parsed.completed ?? 0));
      return {
        ...createSave('classic', level),
        ...parsed,
        level,
        mode: 'classic',
        completed,
        paused: false,
        undone: Array.isArray(parsed.undone) ? parsed.undone : [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseStats(raw: string | null): CupStats {
  if (!raw) return emptyStats;
  try {
    const parsed = JSON.parse(raw) as Partial<CupStats>;
    return {
      ...emptyStats,
      ...parsed,
      themes: parsed.themes ?? emptyStats.themes,
      cups: parsed.cups ?? emptyStats.cups,
      effects: parsed.effects ?? emptyStats.effects,
    };
  } catch {
    return emptyStats;
  }
}

function coerceGame(value: unknown): CupSave | null {
  if (!value) return null;
  return parseGame(JSON.stringify(value));
}

function coerceStats(value: unknown): CupStats {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lineLength(line: DrawLine) {
  return line.points.reduce((sum, point, index) => {
    if (index === 0) return sum;
    return sum + distance(line.points[index - 1], point);
  }, 0);
}

function totalLength(lines: DrawLine[]) {
  return lines.reduce((sum, line) => sum + lineLength(line), 0);
}

function lineLimit(level: number) {
  return Math.max(460, 780 - Math.min(MAX_LEVELS, level) * 6);
}

function movesLimitForLevel(level: number) {
  if (level > 35) return 3;
  if (level > 15) return 4;
  return 5;
}

function waterDelayForLevel(level: number) {
  return Math.max(74, 128 - Math.floor(Math.min(MAX_LEVELS, level) * 1.1));
}

type LevelObstacle =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; angle: number; color: string; label: string }
  | { kind: 'circle'; x: number; y: number; r: number; color: string; label: string };

function levelObstacles(level: number): LevelObstacle[] {
  const safeLevel = Math.max(1, Math.min(MAX_LEVELS, level));
  const drift = (safeLevel % 6) - 3;
  const obstacles: LevelObstacle[] = [
    {
      kind: 'rect',
      x: 396 + drift * 9,
      y: 248 + Math.floor(safeLevel / 12) * 8,
      w: 140,
      h: 12,
      angle: 0.16 + (safeLevel % 5) * 0.035,
      color: 'rgba(124,58,237,0.28)',
      label: 'level-ramp',
    },
  ];

  if (safeLevel >= 5) {
    obstacles.push({
      kind: 'circle',
      x: 476 + (safeLevel % 4) * 12,
      y: 178 + (safeLevel % 5) * 7,
      r: 24 + Math.min(8, Math.floor(safeLevel / 10)),
      color: 'rgba(15,23,42,0.08)',
      label: 'level-bumper',
    });
  }

  if (safeLevel >= 10) {
    obstacles.push({
      kind: 'rect',
      x: 324 + (safeLevel % 5) * 10,
      y: 360 - (safeLevel % 4) * 8,
      w: 100,
      h: 10,
      angle: -0.32 - (safeLevel % 4) * 0.045,
      color: 'rgba(14,165,233,0.24)',
      label: 'level-narrow',
    });
  }

  if (safeLevel >= 22) {
    obstacles.push({
      kind: 'circle',
      x: 540 - (safeLevel % 5) * 9,
      y: 280 + (safeLevel % 4) * 8,
      r: 20 + Math.min(7, Math.floor(safeLevel / 12)),
      color: 'rgba(37,99,235,0.12)',
      label: 'level-bumper-hard',
    });
  }

  if (safeLevel >= 36) {
    obstacles.push({
      kind: 'rect',
      x: 214 + (safeLevel % 3) * 12,
      y: 186,
      w: 88,
      h: 10,
      angle: 0.42,
      color: 'rgba(245,158,11,0.22)',
      label: 'level-start-ramp',
    });
  }

  return obstacles;
}

function createLineBody(a: { x: number; y: number }, b: { x: number; y: number }) {
  const len = Math.max(4, distance(a, b));
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return Matter.Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len, 10, {
    isStatic: true,
    angle,
    chamfer: { radius: 5 },
    friction: 0.04,
    restitution: 0.08,
    label: 'drawn-line',
  });
}

export function FillCupGame({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const waterRef = useRef<WaterParticle[]>([]);
  const lineBodiesRef = useRef<Matter.Body[]>([]);
  const animationRef = useRef<number | null>(null);
  const drawingRef = useRef(false);
  const currentLineRef = useRef<DrawLine | null>(null);
  const lastSyncRef = useRef(0);

  const [save, setSave] = useState<CupSave>(() => parseGame(localStorage.getItem(STORAGE_GAME)) ?? createSave());
  const [stats, setStats] = useState<CupStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [tool, setTool] = useState<Tool>('draw');
  const [fill, setFill] = useState(0);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [flowing, setFlowing] = useState(false);
  const [splashes, setSplashes] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline'>('saved');

  const limit = lineLimit(save.level);
  const usedLength = totalLength(save.lines);
  const movesLimit = movesLimitForLevel(save.level);

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from('fill_cup_progress')
      .select('current_game, stats')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as CupRow;
    const cloudGame = coerceGame(row.current_game);
    const cloudStats = coerceStats(row.stats);
    if (cloudGame) setSave(cloudGame);
    setStats(cloudStats);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextSave: CupSave, nextStats: CupStats, force = false) => {
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
    const { error } = await supabase.from('fill_cup_progress').upsert({
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

  function rebuildLines(engine: Matter.Engine, lines: DrawLine[]) {
    Matter.Composite.remove(engine.world, lineBodiesRef.current);
    const bodies: Matter.Body[] = [];
    lines.forEach(line => {
      for (let i = 1; i < line.points.length; i += 1) {
        bodies.push(createLineBody(line.points[i - 1], line.points[i]));
      }
    });
    lineBodiesRef.current = bodies;
    Matter.Composite.add(engine.world, bodies);
  }

  function setupWorld(level: number, lines: DrawLine[]) {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.0011 } });
    const ground = Matter.Bodies.rectangle(SCENE_W / 2, SCENE_H + 24, SCENE_W, 48, { isStatic: true, label: 'ground' });
    const leftWall = Matter.Bodies.rectangle(-24, SCENE_H / 2, 48, SCENE_H, { isStatic: true });
    const rightWall = Matter.Bodies.rectangle(SCENE_W + 24, SCENE_H / 2, 48, SCENE_H, { isStatic: true });
    const cupLeft = Matter.Bodies.rectangle(GLASS.x - GLASS.w / 2, GLASS.y, 10, GLASS.h, { isStatic: true, angle: -0.06, label: 'cup' });
    const cupRight = Matter.Bodies.rectangle(GLASS.x + GLASS.w / 2, GLASS.y, 10, GLASS.h, { isStatic: true, angle: 0.06, label: 'cup' });
    const cupBottom = Matter.Bodies.rectangle(GLASS.x, GLASS.y + GLASS.h / 2, GLASS.w, 10, { isStatic: true, label: 'cup' });
    const obstacles = levelObstacles(level).map(obstacle => (
      obstacle.kind === 'rect'
        ? Matter.Bodies.rectangle(obstacle.x, obstacle.y, obstacle.w, obstacle.h, { isStatic: true, angle: obstacle.angle, label: obstacle.label })
        : Matter.Bodies.circle(obstacle.x, obstacle.y, obstacle.r, { isStatic: true, label: obstacle.label })
    ));
    waterRef.current = [];
    lineBodiesRef.current = [];
    Matter.Composite.add(engine.world, [ground, leftWall, rightWall, cupLeft, cupRight, cupBottom, ...obstacles]);
    engineRef.current = engine;
    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);
    rebuildLines(engine, lines);
  }

  useEffect(() => {
    setupWorld(save.level, save.lines);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
    };
  }, [save.level]);

  useEffect(() => {
    if (engineRef.current) rebuildLines(engineRef.current, save.lines);
  }, [save.lines]);

  useEffect(() => {
    if (!started || save.paused || won) return undefined;
    const id = window.setInterval(() => {
      setSave(current => ({ ...current, seconds: current.seconds + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [save.paused, started, won]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!engineRef.current || !started || !flowing || save.paused || won) return;
      const particle = Matter.Bodies.circle(SOURCE.x + Math.random() * 16 - 8, SOURCE.y, 5, {
        restitution: 0.18,
        friction: 0.01,
        frictionAir: 0.002,
        label: 'water',
        render: { fillStyle: '#38BDF8' },
      });
      Matter.Body.setVelocity(particle, { x: 1.8 + Math.random() * 1.2, y: 0.4 });
      waterRef.current.push({ body: particle, bornAt: Date.now() });
      Matter.Composite.add(engineRef.current.world, particle);
    }, waterDelayForLevel(save.level));
    return () => window.clearInterval(id);
  }, [flowing, save.level, save.paused, started, won]);

  function completeLevel(currentFill: number) {
    if (currentFill < 0.82 || won) return;
    setWon(true);
    const today = todayKey();
    const stars = save.seconds < 50 ? 3 : save.seconds < 90 ? 2 : 1;
    const dailyReward = !save.dailyDone.includes(today) && save.lines.length <= 1 ? 30 : 0;
    const nextStats: CupStats = {
      ...stats,
      completed: stats.completed + 1,
      bestTime: stats.bestTime === null ? save.seconds : Math.min(stats.bestTime, save.seconds),
      xp: stats.xp + 20 + stars * 10 + dailyReward,
      streak: stats.streak + 1,
      themes: stats.completed + 1 >= 5 && !stats.themes.includes('Aurora') ? [...stats.themes, 'Aurora'] : stats.themes,
      cups: stats.completed + 1 >= 10 && !stats.cups.includes('Crystal Cup') ? [...stats.cups, 'Crystal Cup'] : stats.cups,
      effects: stats.completed + 1 >= 15 && !stats.effects.includes('Sparkle Water') ? [...stats.effects, 'Sparkle Water'] : stats.effects,
    };
    const nextSave = {
      ...save,
      completed: Math.min(MAX_LEVELS, save.completed + 1),
      stars,
      dailyDone: dailyReward > 0 ? [...save.dailyDone, today] : save.dailyDone,
    };
    setStats(nextStats);
    setSave(nextSave);
    setSplashes(Array.from({ length: 16 }, (_, index) => ({ id: `confetti-${Date.now()}-${index}`, x: 50 + Math.random() * 90, y: 70 + Math.random() * 40 })));
    void saveCloud(nextSave, nextStats, true);
  }

  function drawScene() {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);

    const gradient = ctx.createLinearGradient(0, 0, SCENE_W, SCENE_H);
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(1, '#EFF6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);

    ctx.fillStyle = 'rgba(124, 58, 237, 0.09)';
    ctx.beginPath();
    ctx.arc(710, 88, 86, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7C3AED';
    ctx.globalAlpha = 0.2;
    ctx.fillRect(682, 184, 78, 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#A78BFA';
    ctx.beginPath();
    ctx.arc(760, 190, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7DD3FC';
    ctx.shadowColor = 'rgba(56,189,248,0.28)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(SOURCE.x - 28, SOURCE.y - 28, 56, 36, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText('water', SOURCE.x - 18, SOURCE.y - 7);

    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(SOURCE.x, SOURCE.y + 8);
    ctx.bezierCurveTo(SOURCE.x + 18, SOURCE.y + 30, SOURCE.x + 28, SOURCE.y + 52, SOURCE.x + 42, SOURCE.y + 70);
    ctx.stroke();

    save.lines.forEach(line => {
      ctx.strokeStyle = tool === 'erase' ? 'rgba(239,68,68,0.75)' : '#2563EB';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      line.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });

    if (currentLineRef.current) {
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      currentLineRef.current.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    levelObstacles(save.level).forEach(obstacle => {
      ctx.fillStyle = obstacle.color;
      if (obstacle.kind === 'rect') {
        ctx.save();
        ctx.translate(obstacle.x, obstacle.y);
        ctx.rotate(obstacle.angle);
        ctx.beginPath();
        ctx.roundRect(-obstacle.w / 2, -obstacle.h / 2, obstacle.w, obstacle.h, obstacle.h / 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
      ctx.fill();
    });

    waterRef.current = waterRef.current.filter(item => {
      const { y } = item.body.position;
      const alive = Date.now() - item.bornAt < 12000 && y < SCENE_H + 120;
      if (!alive) Matter.Composite.remove(engine.world, item.body);
      return alive;
    });

    const inGlass = waterRef.current.filter(item => {
      const { x, y } = item.body.position;
      return x > GLASS.x - GLASS.w / 2 + 8 && x < GLASS.x + GLASS.w / 2 - 8 && y > GLASS.y - GLASS.h / 2 && y < GLASS.y + GLASS.h / 2;
    }).length;
    const nextFill = Math.min(1, inGlass / 68);
    setFill(nextFill);
    completeLevel(nextFill);

    ctx.fillStyle = 'rgba(56,189,248,0.92)';
    waterRef.current.forEach(item => {
      const { x, y } = item.body.position;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(37,99,235,0.42)';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(GLASS.x - GLASS.w / 2, GLASS.y - GLASS.h / 2);
    ctx.lineTo(GLASS.x - GLASS.w / 2 + 14, GLASS.y + GLASS.h / 2);
    ctx.lineTo(GLASS.x + GLASS.w / 2 - 14, GLASS.y + GLASS.h / 2);
    ctx.lineTo(GLASS.x + GLASS.w / 2, GLASS.y - GLASS.h / 2);
    ctx.stroke();

    const waterHeight = (GLASS.h - 18) * nextFill;
    ctx.fillStyle = 'rgba(56,189,248,0.38)';
    ctx.beginPath();
    ctx.roundRect(GLASS.x - GLASS.w / 2 + 16, GLASS.y + GLASS.h / 2 - waterHeight - 6, GLASS.w - 32, waterHeight, 18);
    ctx.fill();

    animationRef.current = requestAnimationFrame(drawScene);
  }

  useEffect(() => {
    animationRef.current = requestAnimationFrame(drawScene);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  });

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * SCENE_W,
      y: ((event.clientY - rect.top) / rect.height) * SCENE_H,
    };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!started || save.paused || won || flowing) return;
    const point = pointFromEvent(event);
    if (tool === 'erase') {
      const target = save.lines.find(line => line.points.some(p => distance(p, point) < 24));
      if (target) setSave(current => ({ ...current, lines: current.lines.filter(line => line.id !== target.id) }));
      return;
    }
    if (save.lines.length >= movesLimit || usedLength >= limit) return;
    drawingRef.current = true;
    currentLineRef.current = { id: `line-${Date.now()}`, points: [point] };
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !currentLineRef.current) return;
    const point = pointFromEvent(event);
    const points = currentLineRef.current.points;
    if (distance(points[points.length - 1], point) < 8) return;
    const nextLine = { ...currentLineRef.current, points: [...points, point] };
    if (usedLength + lineLength(nextLine) > limit) return;
    currentLineRef.current = nextLine;
  }

  function endDraw() {
    if (!drawingRef.current || !currentLineRef.current) return;
    const finished = currentLineRef.current;
    drawingRef.current = false;
    currentLineRef.current = null;
    if (finished.points.length < 2) return;
    setSave(current => ({ ...current, lines: [...current.lines, finished], undone: [] }));
    if ('vibrate' in navigator) navigator.vibrate(12);
  }

  function undo() {
    setSave(current => {
      const last = current.lines[current.lines.length - 1];
      if (!last) return current;
      return { ...current, lines: current.lines.slice(0, -1), undone: [last, ...current.undone] };
    });
  }

  function redo() {
    setSave(current => {
      const next = current.undone[0];
      if (!next) return current;
      return { ...current, lines: [...current.lines, next], undone: current.undone.slice(1) };
    });
  }

  function reset(level = save.level, mode = save.mode, nextStarted = started) {
    if (engineRef.current) {
      Matter.Composite.remove(engineRef.current.world, waterRef.current.map(item => item.body));
      waterRef.current = [];
    }
    setFill(0);
    setWon(false);
    setStarted(nextStarted);
    setFlowing(false);
    setSplashes([]);
    setSave(current => ({ ...createSave(mode, level), completed: current.completed, dailyDone: current.dailyDone, sound: current.sound, paused: false }));
  }

  function nextLevel() {
    reset(Math.min(MAX_LEVELS, save.level + 1), save.mode, false);
  }

  function playGame() {
    setStarted(true);
    setFlowing(false);
    setSave(current => ({ ...current, paused: false }));
  }

  return (
    <div className="cup-page">
      <header className="cup-header">
        <button type="button" className="cup-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>Наполни стакан</h2>
          <p>Сделай короткий перерыв и реши головоломку</p>
        </div>
        <span className="cup-sync">{syncState === 'saving' ? 'Сохраняю…' : syncState === 'saved' ? 'Сохранено' : 'Локально'}</span>
      </header>

      <section className="cup-topbar">
        <div><span>⭐ Уровень</span><strong>{save.level}/{MAX_LEVELS}</strong></div>
        <div><span>Stars</span><strong>{'⭐'.repeat(save.stars)}</strong></div>
        <div><span>✏️ Линии</span><strong>{save.lines.length}/{movesLimit}</strong></div>
        <div><span>⏱ Timer</span><strong>{formatTime(save.seconds)}</strong></div>
      </section>

      <main className="cup-layout">
        <section className="cup-game-card">
          <div className="cup-tools">
            <button type="button" className={tool === 'draw' ? 'active' : ''} onClick={() => setTool('draw')} disabled={!started || flowing}>✏️ Карандаш</button>
            <button type="button" className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')} disabled={!started || flowing}>🧽 Ластик</button>
            <button type="button" onClick={undo} disabled={!started || flowing}>↩️ Отменить</button>
            <button type="button" onClick={redo} disabled={!started || flowing}>↪️ Повторить</button>
            <button type="button" onClick={() => reset()}>🔄 Сброс</button>
            <button type="button" className={save.sound ? 'active' : ''} onClick={() => setSave(current => ({ ...current, sound: !current.sound }))}>Sound</button>
          </div>

          <div className="cup-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={SCENE_W}
              height={SCENE_H}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              aria-label="Fill the Cup puzzle area"
            />
            <div className="cup-fill-meter">
              <span style={{ height: `${Math.round(fill * 100)}%` }} />
            </div>
            <div className="cup-length">
              <span>Drawing limit</span>
              <strong>{Math.round(Math.max(0, limit - usedLength))} px</strong>
            </div>
            {started && !won && (
              <button type="button" className="cup-pause-button" onClick={() => setSave(current => ({ ...current, paused: true }))} aria-label="Пауза">
                <span />
                <span />
              </button>
            )}
            {!started && !won && (
              <div className="cup-start-overlay">
                <button type="button" onClick={playGame}>Играть</button>
              </div>
            )}
            {started && !flowing && !save.paused && !won && save.lines.length > 0 && (
              <button type="button" className="cup-run-button" onClick={() => setFlowing(true)}>Пустить воду</button>
            )}
            {save.paused && !won && (
              <div className="cup-start-overlay">
                <div className="cup-pause-menu">
                  <strong>Пауза</strong>
                  <button type="button" onClick={() => setSave(current => ({ ...current, paused: false }))}>Продолжить</button>
                  <button type="button" onClick={() => reset(save.level, save.mode, true)}>Начать сначала</button>
                  <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                </div>
              </div>
            )}
            {splashes.map(splash => <i key={splash.id} className="cup-splash" style={{ left: `${splash.x}%`, top: `${splash.y}%` }} />)}
          </div>
        </section>
      </main>

      {won && (
        <div className="cup-win">
          <div className="cup-win-card">
            <h3>Стакан заполнен 🎉</h3>
            <p>Level completed: <strong>{save.level}</strong></p>
            <p>Stars earned: <strong>{'⭐'.repeat(save.stars)}</strong></p>
            <p>Time spent: <strong>{formatTime(save.seconds)}</strong></p>
            <div className="cup-win-actions">
              <button type="button" onClick={nextLevel}>Следующий уровень</button>
              <button type="button" className="ghost" onClick={() => reset()}>Играть снова</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
