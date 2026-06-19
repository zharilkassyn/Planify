import { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { supabase } from '../lib/supabase';

type CupMode = 'classic' | 'time' | 'hard' | 'endless';

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
const GLASS_FILL_PARTICLES = 68;
const WIN_FILL = 0.82;

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

function waterLimitForLevel(level: number) {
  return Math.max(80, 94 - Math.floor(Math.min(MAX_LEVELS, level) / 4));
}

type LevelObstacle =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; angle: number; color: string; label: string }
  | { kind: 'circle'; x: number; y: number; r: number; color: string; label: string };

function levelObstacles(level: number): LevelObstacle[] {
  const safeLevel = Math.max(1, Math.min(MAX_LEVELS, level));
  const pattern = (safeLevel - 1) % 10;
  const tier = Math.floor((safeLevel - 1) / 10);
  const direction = pattern % 2 === 0 ? 1 : -1;
  const obstacles: LevelObstacle[] = [
    {
      kind: 'rect',
      x: 330 + pattern * 18,
      y: 210 + (pattern % 4) * 24 + tier * 8,
      w: 126 + (pattern % 3) * 24,
      h: 12,
      angle: direction * (0.18 + (pattern % 4) * 0.08),
      color: 'rgba(124,58,237,0.28)',
      label: 'level-ramp',
    },
  ];

  if (safeLevel >= 2) {
    obstacles.push({
      kind: 'rect',
      x: 494 - pattern * 10,
      y: 330 - (pattern % 5) * 16,
      w: 92 + tier * 10,
      h: 10,
      angle: -direction * (0.24 + (pattern % 3) * 0.1),
      color: 'rgba(14,165,233,0.24)',
      label: 'level-catcher',
    });
  }

  if (safeLevel >= 4) {
    obstacles.push({
      kind: 'circle',
      x: 438 + (pattern % 5) * 26,
      y: 156 + (pattern % 4) * 28,
      r: 20 + (pattern % 3) * 5 + tier,
      color: 'rgba(15,23,42,0.08)',
      label: 'level-bumper',
    });
  }

  if (safeLevel >= 9) {
    obstacles.push({
      kind: 'rect',
      x: 282 + (pattern % 6) * 22,
      y: 386 - (pattern % 5) * 18,
      w: 86 + (pattern % 4) * 12,
      h: 10,
      angle: direction * (0.44 + (pattern % 2) * 0.18),
      color: 'rgba(245,158,11,0.22)',
      label: 'level-narrow',
    });
  }

  if (safeLevel >= 16) {
    obstacles.push({
      kind: 'circle',
      x: 560 - (pattern % 5) * 18,
      y: 260 + (pattern % 4) * 22,
      r: 18 + (pattern % 4) * 4 + tier,
      color: 'rgba(37,99,235,0.12)',
      label: 'level-bumper-hard',
    });
  }

  if (safeLevel >= 28) {
    obstacles.push({
      kind: 'rect',
      x: 218 + (pattern % 4) * 16,
      y: 160 + (pattern % 3) * 18,
      w: 82 + (pattern % 3) * 16,
      h: 10,
      angle: direction * 0.48,
      color: 'rgba(16,185,129,0.22)',
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

function pushWaterPair(bodyA: Matter.Body, bodyB: Matter.Body) {
  if (bodyA.label !== 'water' || bodyB.label !== 'water') return;
  const dx = bodyB.position.x - bodyA.position.x;
  const dy = bodyB.position.y - bodyA.position.y;
  const length = Math.hypot(dx, dy) || 1;
  const force = 0.000018;
  const x = (dx / length) * force;
  const y = (dy / length) * force;
  Matter.Body.applyForce(bodyA, bodyA.position, { x: -x, y: -y });
  Matter.Body.applyForce(bodyB, bodyB.position, { x, y });
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
  const spawnedWaterRef = useRef(0);
  const lastWaterSpawnAtRef = useRef(0);
  const failTimerRef = useRef<number | null>(null);

  const [save, setSave] = useState<CupSave>(() => createSave());
  const [stats, setStats] = useState<CupStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [fill, setFill] = useState(0);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const [flowing, setFlowing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waterUsed, setWaterUsed] = useState(0);
  const [splashes, setSplashes] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline'>('saved');

  const limit = lineLimit(save.level);
  const usedLength = totalLength(save.lines);
  const movesLimit = movesLimitForLevel(save.level);
  const waterLimit = waterLimitForLevel(save.level);
  const waterLeft = Math.max(0, waterLimit - waterUsed);

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
    const cloudStats = coerceStats(row.stats);
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
    Matter.Events.on(engine, 'collisionActive', event => {
      event.pairs.forEach(pair => pushWaterPair(pair.bodyA, pair.bodyB));
    });
    engineRef.current = engine;
    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);
    rebuildLines(engine, lines);
  }

  useEffect(() => {
    setupWorld(save.level, save.lines);
    return () => {
      if (failTimerRef.current) {
        window.clearTimeout(failTimerRef.current);
        failTimerRef.current = null;
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (runnerRef.current && engineRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
    };
  }, [save.level]);

  useEffect(() => {
    if (engineRef.current) rebuildLines(engineRef.current, save.lines);
  }, [save.lines]);

  useEffect(() => {
    if (!started || save.paused || won || failed) return undefined;
    const id = window.setInterval(() => {
      setSave(current => ({ ...current, seconds: current.seconds + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [failed, save.paused, started, won]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!engineRef.current || !started || !flowing || save.paused || won || failed) return;
      if (spawnedWaterRef.current >= waterLimit) return;
      const particle = Matter.Bodies.circle(SOURCE.x + 28 + Math.random() * 14 - 7, SOURCE.y + 18, 6, {
        restitution: 0.38,
        friction: 0.03,
        frictionAir: 0.0012,
        density: 0.0024,
        slop: 0.01,
        label: 'water',
        render: { fillStyle: '#38BDF8' },
      });
      Matter.Body.setVelocity(particle, { x: 1.2 + Math.random() * 1.4, y: 0.2 + Math.random() * 0.4 });
      waterRef.current.push({ body: particle, bornAt: Date.now() });
      spawnedWaterRef.current += 1;
      lastWaterSpawnAtRef.current = Date.now();
      setWaterUsed(spawnedWaterRef.current);
      Matter.Composite.add(engineRef.current.world, particle);
    }, waterDelayForLevel(save.level));
    return () => window.clearInterval(id);
  }, [failed, flowing, save.level, save.paused, started, waterLimit, won]);

  function completeLevel(currentFill: number) {
    if (currentFill < WIN_FILL || won) return;
    if (failTimerRef.current) {
      window.clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
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

  function restartAfterMiss() {
    if (failTimerRef.current || won) return;
    setFailed(true);
    setFlowing(false);
    failTimerRef.current = window.setTimeout(() => {
      failTimerRef.current = null;
      reset(save.level, save.mode, true);
    }, 900);
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

    const faucetGradient = ctx.createLinearGradient(SOURCE.x - 76, SOURCE.y - 56, SOURCE.x + 28, SOURCE.y + 12);
    faucetGradient.addColorStop(0, '#E0F2FE');
    faucetGradient.addColorStop(0.48, '#60A5FA');
    faucetGradient.addColorStop(1, '#1D4ED8');
    ctx.shadowColor = 'rgba(37,99,235,0.22)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = faucetGradient;
    ctx.beginPath();
    ctx.roundRect(SOURCE.x - 86, SOURCE.y - 54, 20, 72, 9);
    ctx.roundRect(SOURCE.x - 76, SOURCE.y - 46, 88, 18, 9);
    ctx.roundRect(SOURCE.x - 4, SOURCE.y - 46, 22, 48, 9);
    ctx.roundRect(SOURCE.x + 4, SOURCE.y - 4, 34, 18, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15,23,42,0.12)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(SOURCE.x - 64, SOURCE.y - 37);
    ctx.lineTo(SOURCE.x + 3, SOURCE.y - 37);
    ctx.moveTo(SOURCE.x + 9, SOURCE.y - 26);
    ctx.lineTo(SOURCE.x + 9, SOURCE.y - 6);
    ctx.stroke();
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.roundRect(SOURCE.x - 32, SOURCE.y - 70, 52, 10, 5);
    ctx.roundRect(SOURCE.x - 12, SOURCE.y - 84, 12, 26, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(56,189,248,0.32)';
    ctx.beginPath();
    ctx.arc(SOURCE.x + 28, SOURCE.y + 18, 7, 0, Math.PI * 2);
    ctx.fill();

    save.lines.forEach(line => {
      ctx.strokeStyle = '#2563EB';
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
    const nextFill = Math.min(1, inGlass / GLASS_FILL_PARTICLES);
    setFill(nextFill);
    completeLevel(nextFill);

    if (
      flowing &&
      !won &&
      !failed &&
      spawnedWaterRef.current >= waterLimit &&
      lastWaterSpawnAtRef.current > 0 &&
      Date.now() - lastWaterSpawnAtRef.current > 3600 &&
      nextFill < WIN_FILL
    ) {
      restartAfterMiss();
    }

    ctx.fillStyle = 'rgba(56,189,248,0.92)';
    waterRef.current.forEach(item => {
      const { x, y } = item.body.position;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
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
    if (!started || save.paused || won || flowing || failed) return;
    const point = pointFromEvent(event);
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
    spawnedWaterRef.current = 0;
    lastWaterSpawnAtRef.current = 0;
    setWaterUsed(0);
    setSave(current => ({ ...current, lines: [...current.lines, finished], undone: [] }));
    setFlowing(true);
    if ('vibrate' in navigator) navigator.vibrate(12);
  }

  function reset(level = save.level, mode = save.mode, nextStarted = started) {
    if (failTimerRef.current) {
      window.clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    if (engineRef.current) {
      Matter.Composite.remove(engineRef.current.world, waterRef.current.map(item => item.body));
      waterRef.current = [];
    }
    spawnedWaterRef.current = 0;
    lastWaterSpawnAtRef.current = 0;
    setWaterUsed(0);
    setFill(0);
    setWon(false);
    setFailed(false);
    setStarted(nextStarted);
    setFlowing(false);
    setSplashes([]);
    setSave(current => ({ ...createSave(mode, level), completed: current.completed, dailyDone: current.dailyDone, sound: current.sound, paused: false }));
  }

  function nextLevel() {
    reset(Math.min(MAX_LEVELS, save.level + 1), save.mode, true);
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
        <div><span>💧 Вода</span><strong>{waterLeft}/{waterLimit}</strong></div>
        <div><span>✏️ Линии</span><strong>{save.lines.length}/{movesLimit}</strong></div>
        <div><span>⏱ Timer</span><strong>{formatTime(save.seconds)}</strong></div>
      </section>

      <main className="cup-layout">
        <section className="cup-game-card">
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
            {failed && !won && <div className="cup-fail-note">Воды не хватило</div>}
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
              <button type="button" className="ghost" onClick={() => reset(save.level, save.mode, true)}>Играть снова</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
