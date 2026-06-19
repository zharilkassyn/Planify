import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { supabase } from '../lib/supabase';

type TennisMode = 'quick' | 'tournament' | 'arcade' | 'training';
type TennisDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
type TennisResult = 'victory' | 'defeat' | null;

type TennisSave = {
  mode: TennisMode;
  difficulty: TennisDifficulty;
  playerScore: number;
  aiScore: number;
  playerGames: number;
  aiGames: number;
  playerSets: number;
  aiSets: number;
  seconds: number;
  shots: number;
  hits: number;
  paused: boolean;
  dayNight: 'day' | 'night';
  sound: boolean;
  result: TennisResult;
};

type TennisStats = {
  wins: number;
  losses: number;
  longestRally: number;
  totalShots: number;
  gamesPlayed: number;
  streak: number;
  achievements: string[];
};

type TennisRow = {
  current_game: unknown;
  stats: unknown;
};

type Keys = Record<string, boolean>;
type RacketSwing = {
  x: number;
  z: number;
  speed: number;
  powerBoost: number;
  updatedAt: number;
};

const STORAGE_GAME = 'planify_tennis_game';
const STORAGE_STATS = 'planify_tennis_stats';
const COURT_W = 12;
const COURT_L = 25;
const PLAYER_Z = 9;
const AI_Z = -9;
const SCORE_LABELS = ['0', '15', '30', '40'];
const SWING_TIMEOUT_MS = 280;

const DIFFICULTIES: Array<{ key: TennisDifficulty; label: string; speed: number; error: number; reaction: number; missChance: number }> = [
  { key: 'easy', label: 'Easy', speed: 0.065, error: 1.8, reaction: 0.68, missChance: 0.24 },
  { key: 'medium', label: 'Medium', speed: 0.095, error: 1.1, reaction: 0.9, missChance: 0.13 },
  { key: 'hard', label: 'Hard', speed: 0.13, error: 0.58, reaction: 1.08, missChance: 0.06 },
  { key: 'expert', label: 'Expert', speed: 0.165, error: 0.28, reaction: 1.25, missChance: 0.025 },
];

const ACHIEVEMENTS = [
  { id: 'first-win', title: '🏅 Первая победа', check: (stats: TennisStats) => stats.wins >= 1 },
  { id: 'win-streak', title: '🔥 Серия побед', check: (stats: TennisStats) => stats.streak >= 3 },
  { id: 'fast-match', title: '⚡ Быстрый матч', check: (_stats: TennisStats, game: TennisSave) => game.mode === 'arcade' && game.seconds < 180 },
];

const emptyStats: TennisStats = {
  wins: 0,
  losses: 0,
  longestRally: 0,
  totalShots: 0,
  gamesPlayed: 0,
  streak: 0,
  achievements: [],
};

function createSave(mode: TennisMode = 'quick', difficulty: TennisDifficulty = 'medium'): TennisSave {
  return {
    mode,
    difficulty,
    playerScore: 0,
    aiScore: 0,
    playerGames: 0,
    aiGames: 0,
    playerSets: 0,
    aiSets: 0,
    seconds: 0,
    shots: 0,
    hits: 0,
    paused: false,
    dayNight: 'day',
    sound: true,
    result: null,
  };
}

function parseGame(raw: string | null): TennisSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TennisSave;
    if (parsed.mode && parsed.difficulty) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseStats(raw: string | null): TennisStats {
  if (!raw) return emptyStats;
  try {
    const parsed = JSON.parse(raw) as Partial<TennisStats>;
    return { ...emptyStats, ...parsed, achievements: parsed.achievements ?? [] };
  } catch {
    return emptyStats;
  }
}

function coerceGame(value: unknown): TennisSave | null {
  if (!value) return null;
  return parseGame(JSON.stringify(value));
}

function coerceStats(value: unknown): TennisStats {
  if (!value) return emptyStats;
  return parseStats(JSON.stringify(value));
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createShotVelocity(ball: THREE.Vector3, swing: RacketSwing, fallbackSide: number, power: number, lob: boolean, spin: number) {
  const swingIsFresh = Date.now() - swing.updatedAt < SWING_TIMEOUT_MS && swing.speed > 0.006;
  const sideFromSwing = swingIsFresh ? clamp(swing.x / swing.speed, -1, 1) : fallbackSide;
  const forwardSwing = swingIsFresh ? clamp(-swing.z / 0.12, -0.35, 1) : 0;
  const side = clamp(sideFromSwing + spin * 0.22, -1, 1);
  const lift = swingIsFresh ? clamp(swing.z / 0.12, -0.35, 0.7) : 0;
  const speedBoost = swingIsFresh ? swing.powerBoost + Math.max(0, forwardSwing) * 0.22 : 0;
  const targetX = clamp(side * (COURT_W / 2 - 1.35), -COURT_W / 2 + 1.1, COURT_W / 2 - 1.1);
  const xVelocity = swingIsFresh || spin !== 0
    ? clamp((targetX - ball.x) * 0.02 + side * 0.028, -0.16, 0.16)
    : 0;
  const yVelocity = lob
    ? 0.09 + Math.max(0, lift) * 0.018
    : clamp(0.056 + lift * 0.024, 0.045, 0.085);
  const zVelocity = -0.22 * power * (1 + speedBoost);
  return new THREE.Vector3(xVelocity, yVelocity, zVelocity);
}

function createRacket(color: number, ai = false) {
  const racket = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.2 });
  const stringMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.38, metalness: 0.08 });
  const gripMat = new THREE.MeshStandardMaterial({ color: ai ? 0x111827 : 0x1e293b, roughness: 0.62 });

  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.024, 16, 56), frameMat);
  frame.scale.set(0.78, 1.2, 0.14);
  frame.position.y = 0.16;
  frame.castShadow = true;
  racket.add(frame);

  [-0.18, -0.09, 0, 0.09, 0.18].forEach((x) => {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.62, 6), stringMat);
    string.position.set(x, 0.16, 0);
    string.castShadow = true;
    racket.add(string);
  });

  [-0.08, 0.05, 0.18, 0.31].forEach((y) => {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.44, 6), stringMat);
    string.rotation.z = Math.PI / 2;
    string.position.set(0, y, 0);
    string.castShadow = true;
    racket.add(string);
  });

  const throatLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10), frameMat);
  throatLeft.position.set(-0.085, -0.2, 0);
  throatLeft.rotation.z = -0.28;
  throatLeft.castShadow = true;
  racket.add(throatLeft);

  const throatRight = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10), frameMat);
  throatRight.position.set(0.085, -0.2, 0);
  throatRight.rotation.z = 0.28;
  throatRight.castShadow = true;
  racket.add(throatRight);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.56, 14), gripMat);
  grip.position.y = -0.56;
  grip.castShadow = true;
  racket.add(grip);

  const gripCap = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14), gripMat);
  gripCap.position.y = -0.86;
  gripCap.castShadow = true;
  racket.add(gripCap);

  racket.position.set(0, 1.18, 0.04);
  racket.rotation.set(0.06, ai ? -0.16 : 0.16, ai ? 0.18 : -0.18);
  racket.scale.setScalar(1.45);
  return racket;
}

function createPlayer(color: number, ai = false) {
  const group = new THREE.Group();
  const racket = createRacket(ai ? 0x7c3aed : color, ai);
  group.add(racket);
  return { group, racket };
}

function addCourt(scene: THREE.Scene) {
  const court = new THREE.Mesh(
    new THREE.BoxGeometry(COURT_W, 0.08, COURT_L),
    new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.64, metalness: 0.02 }),
  );
  court.position.y = -0.04;
  court.receiveShadow = true;
  scene.add(court);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addLine = (x: number, z: number, w: number, l: number) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, l), lineMat);
    line.position.set(x, 0.015, z);
    scene.add(line);
  };
  addLine(0, COURT_L / 2 - 0.25, COURT_W, 0.08);
  addLine(0, -COURT_L / 2 + 0.25, COURT_W, 0.08);
  addLine(-COURT_W / 2 + 0.25, 0, 0.08, COURT_L);
  addLine(COURT_W / 2 - 0.25, 0, 0.08, COURT_L);
  addLine(0, 0, COURT_W, 0.08);
  addLine(0, 0, 0.08, COURT_L - 4);
  addLine(0, 4.2, COURT_W - 2, 0.06);
  addLine(0, -4.2, COURT_W - 2, 0.06);

  const net = new THREE.Mesh(new THREE.BoxGeometry(COURT_W + 0.6, 0.72, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.52 }));
  net.position.set(0, 0.4, 0);
  net.castShadow = true;
  scene.add(net);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 42), new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  floor.receiveShadow = true;
  scene.add(floor);

  for (let i = 0; i < 18; i += 1) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.38), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xc4b5fd : 0xdbeafe }));
    seat.position.set(-10 + (i % 9) * 2.4, 0.25, i < 9 ? -15.5 : 15.5);
    seat.castShadow = true;
    scene.add(seat);
  }
}

export function Tennis3DGame({ onBack }: { onBack: () => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    player: THREE.Group;
    playerRacket: THREE.Group;
    ai: THREE.Group;
    aiRacket: THREE.Group;
    ball: THREE.Mesh;
    trail: THREE.Mesh[];
    particles: THREE.Mesh[];
  } | null>(null);
  const keysRef = useRef<Keys>({});
  const ballRef = useRef({ pos: new THREE.Vector3(0, 1, 3), vel: new THREE.Vector3(0.045, 0.035, -0.17), rally: 0 });
  const joystickRef = useRef({ active: false, x: 0, y: 0 });
  const pointerMoveRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const pointerTargetRef = useRef({ active: false, x: 0, z: PLAYER_Z });
  const racketSwingRef = useRef<RacketSwing>({ x: 0, z: 0, speed: 0, powerBoost: 0, updatedAt: 0 });
  const aiAttemptRallyRef = useRef(-1);
  const animationRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const lastSyncRef = useRef(0);

  const [save, setSave] = useState<TennisSave>(() => parseGame(localStorage.getItem(STORAGE_GAME)) ?? createSave());
  const [stats, setStats] = useState<TennisStats>(() => parseStats(localStorage.getItem(STORAGE_STATS)));
  const [thinking, setThinking] = useState(false);
  const [thinkingProgress, setThinkingProgress] = useState(0);
  const [, setAnalysis] = useState('ИИ готов к быстрому матчу.');
  const [cameraMode] = useState<'follow' | 'cinematic'>('follow');
  const [joystickVisual, setJoystickVisual] = useState({ x: 0, y: 0 });
  const [started, setStarted] = useState(false);

  const difficulty = DIFFICULTIES.find(item => item.key === save.difficulty) ?? DIFFICULTIES[1];
  const gameStopped = !started || save.paused || Boolean(save.result);

  const loadCloud = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data, error } = await supabase.from('tennis_progress').select('current_game, stats').eq('user_id', userId).maybeSingle();
    if (error || !data) return;
    const row = data as TennisRow;
    const cloudGame = coerceGame(row.current_game);
    const cloudStats = coerceStats(row.stats);
    if (cloudGame && !cloudGame.result) setSave(cloudGame);
    setStats(cloudStats);
  }, []);

  useEffect(() => { loadCloud(); }, [loadCloud]);

  const saveCloud = useCallback(async (nextSave: TennisSave, nextStats: TennisStats, force = false) => {
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 10000) return;
    lastSyncRef.current = now;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { error } = await supabase.from('tennis_progress').upsert({
      user_id: userId,
      current_game: nextSave,
      stats: nextStats,
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn('Tennis progress save failed', error);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_GAME, JSON.stringify(save));
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
    void saveCloud(save, stats);
  }, [save, saveCloud, stats]);

  function finish(result: TennisResult) {
    if (!result) return;
    const base: TennisStats = {
      ...stats,
      wins: stats.wins + (result === 'victory' ? 1 : 0),
      losses: stats.losses + (result === 'defeat' ? 1 : 0),
      longestRally: Math.max(stats.longestRally, ballRef.current.rally),
      totalShots: stats.totalShots + save.shots,
      gamesPlayed: stats.gamesPlayed + 1,
      streak: result === 'victory' ? stats.streak + 1 : 0,
    };
    const unlocked = ACHIEVEMENTS.filter(item => !base.achievements.includes(item.id) && item.check(base, save)).map(item => item.id);
    const nextStats = { ...base, achievements: [...base.achievements, ...unlocked] };
    const nextSave = { ...save, result };
    setStats(nextStats);
    setSave(nextSave);
    void saveCloud(nextSave, nextStats, true);
  }

  function reset(mode = save.mode, difficultyKey = save.difficulty, startNow = false) {
    const next = createSave(mode, difficultyKey);
    setStarted(startNow);
    setSave(next);
    setAnalysis('Новая подача. Двигайся WASD или стрелками.');
    aiAttemptRallyRef.current = -1;
    ballRef.current = { pos: new THREE.Vector3(0, 1, 3), vel: new THREE.Vector3(0.045, 0.035, -0.17), rally: 0 };
  }

  function addPoint(player: 'player' | 'ai') {
    setSave(current => {
      let playerScore = current.playerScore;
      let aiScore = current.aiScore;
      let playerGames = current.playerGames;
      let aiGames = current.aiGames;
      if (player === 'player') playerScore += 1;
      else aiScore += 1;
      if (playerScore >= 4) {
        playerGames += 1;
        playerScore = 0;
        aiScore = 0;
      }
      if (aiScore >= 4) {
        aiGames += 1;
        playerScore = 0;
        aiScore = 0;
      }
      const result: TennisResult = playerGames >= 3 ? 'victory' : aiGames >= 3 ? 'defeat' : null;
      const next = { ...current, playerScore, aiScore, playerGames, aiGames, result };
      if (result) window.setTimeout(() => finish(result), 80);
      return next;
    });
    ballRef.current = {
      pos: new THREE.Vector3(0, 1, player === 'player' ? 4 : -4),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.04, player === 'player' ? -0.16 : 0.16),
      rally: 0,
    };
    aiAttemptRallyRef.current = -1;
  }

  function hitBall(power = 1, lob = false, spin = 0) {
    const refs = sceneRef.current;
    if (!refs || gameStopped) return;
    const ball = ballRef.current;
    const dist = refs.player.position.distanceTo(ball.pos);
    if (dist > 1.8 || ball.pos.z < 0) return;
    ball.vel.copy(createShotVelocity(ball.pos, racketSwingRef.current, 0, power, lob, spin));
    ball.rally += 1;
    setSave(current => ({ ...current, shots: current.shots + 1, hits: current.hits + 1 }));
    setAnalysis(lob ? 'Ты отправил высокий lob.' : power > 1.2 ? 'Сильный удар по выбранному направлению.' : 'Удар полетел туда, куда ты направил.');
    if ('vibrate' in navigator) navigator.vibrate(18);
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(save.dayNight === 'night' ? 0x0f172a : 0xf8fbff);
    scene.fog = new THREE.Fog(scene.background, 24, 58);
    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 100);
    camera.position.set(0, 7.5, 17);
    camera.lookAt(0, 0.8, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x93c5fd, save.dayNight === 'night' ? 1.2 : 1.8);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, save.dayNight === 'night' ? 2.2 : 2.7);
    key.position.set(8, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const rim = new THREE.PointLight(0x8b5cf6, 1.4, 32);
    rim.position.set(-8, 7, -9);
    scene.add(rim);

    addCourt(scene);
    const { group: player, racket: playerRacket } = createPlayer(0x2563eb);
    player.position.set(0, 0, PLAYER_Z);
    scene.add(player);
    const { group: ai, racket: aiRacket } = createPlayer(0x7c3aed, true);
    ai.position.set(0, 0, AI_Z);
    ai.rotation.y = Math.PI;
    scene.add(ai);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 24), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 0.18 }));
    ball.castShadow = true;
    scene.add(ball);
    const trail = Array.from({ length: 9 }, (_, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08 * (1 - index * 0.06), 12, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.28 - index * 0.022 }));
      scene.add(mesh);
      return mesh;
    });
    const particles: THREE.Mesh[] = [];
    sceneRef.current = { renderer, scene, camera, player, playerRacket, ai, aiRacket, ball, trail, particles };

    function resize() {
      if (!mount) return;
      camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material?.dispose?.();
      });
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.scene.background = new THREE.Color(save.dayNight === 'night' ? 0x0f172a : 0xf8fbff);
      sceneRef.current.scene.fog = new THREE.Fog(sceneRef.current.scene.background as THREE.Color, 24, 58);
    }
  }, [save.dayNight]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
      }
      keysRef.current[key] = true;
      if (event.key === ' ') hitBall(1.15);
      if (key === 'l') hitBall(0.85, true);
      if (key === 'q') hitBall(1, false, -1.8);
      if (key === 'e') hitBall(1, false, 1.8);
      if (key === 'p' && started) setSave(current => ({ ...current, paused: !current.paused }));
    }
    function keyUp(event: KeyboardEvent) {
      keysRef.current[event.key.toLowerCase()] = false;
    }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  });

  useEffect(() => {
    if (gameStopped) return undefined;
    const id = window.setInterval(() => setSave(current => ({ ...current, seconds: current.seconds + 1 })), 1000);
    return () => window.clearInterval(id);
  }, [gameStopped]);

  useEffect(() => {
    const loop = (time: number) => {
      const refs = sceneRef.current;
      if (!refs) {
        animationRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.032, (time - lastRef.current) / 1000 || 0.016);
      lastRef.current = time;
      if (!gameStopped) {
        const keys = keysRef.current;
        const pointerTarget = pointerTargetRef.current;
        const playerMove = new THREE.Vector3(
          (keys.a || keys.arrowleft ? -1 : 0) + (keys.d || keys.arrowright ? 1 : 0) + joystickRef.current.x,
          0,
          (keys.w || keys.arrowup ? -1 : 0) + (keys.s || keys.arrowdown ? 1 : 0) + joystickRef.current.y,
        );
        const previousX = refs.player.position.x;
        const previousZ = refs.player.position.z;
        if (playerMove.length() > 0.01) {
          playerMove.normalize().multiplyScalar(8.4 * dt);
          pointerTarget.active = false;
          refs.player.position.x = clamp(refs.player.position.x + playerMove.x, -COURT_W / 2 + 0.8, COURT_W / 2 - 0.8);
          refs.player.position.z = clamp(refs.player.position.z + playerMove.z, 1.2, COURT_L / 2 - 1.2);
        } else if (pointerTarget.active) {
          const follow = 1 - Math.pow(0.0008, dt);
          refs.player.position.x = THREE.MathUtils.lerp(refs.player.position.x, pointerTarget.x, follow);
          refs.player.position.z = THREE.MathUtils.lerp(refs.player.position.z, pointerTarget.z, follow);
        }
        const movedX = refs.player.position.x - previousX;
        const movedZ = refs.player.position.z - previousZ;
        const swingSpeed = Math.hypot(movedX, movedZ);
        if (swingSpeed > 0.003) {
          racketSwingRef.current = {
            x: movedX,
            z: movedZ,
            speed: swingSpeed,
            powerBoost: clamp(swingSpeed / 0.18, 0, 0.32),
            updatedAt: Date.now(),
          };
        }
        refs.player.rotation.y = THREE.MathUtils.lerp(refs.player.rotation.y, movedX * -4.2, 0.12);

        const ball = ballRef.current;
        ball.vel.y -= 0.22 * dt;
        ball.pos.addScaledVector(ball.vel, dt * 60);
        if (ball.pos.y < 0.24) {
          ball.pos.y = 0.24;
          ball.vel.y = Math.abs(ball.vel.y) * 0.72;
          if (Math.abs(ball.vel.y) < 0.018) ball.vel.y = 0.045;
        }
        const playerRacketHit =
          ball.vel.z > 0 &&
          ball.pos.z > 0 &&
          Math.abs(ball.pos.z - refs.player.position.z) < 1.05 &&
          Math.abs(ball.pos.x - refs.player.position.x) < 1.18 &&
          ball.pos.y > 0.25 &&
          ball.pos.y < 2.4;
        if (playerRacketHit) {
          const power = save.mode === 'arcade' ? 1.22 : 1.08;
          ball.pos.z = refs.player.position.z - 0.72;
          ball.vel.copy(createShotVelocity(ball.pos, racketSwingRef.current, 0, power, false, 0));
          ball.rally += 1;
          refs.playerRacket.rotation.z = -0.42;
          setSave(current => ({ ...current, shots: current.shots + 1, hits: current.hits + 1 }));
          setAnalysis('Мяч полетел туда, куда двигалась ракетка.');
          if ('vibrate' in navigator) navigator.vibrate(12);
        }
        if (Math.abs(ball.pos.x) > COURT_W / 2 + 1.5) addPoint(ball.pos.z < 0 ? 'player' : 'ai');
        if (ball.pos.z > COURT_L / 2 + 1.4) addPoint('ai');
        if (ball.pos.z < -COURT_L / 2 - 1.4) addPoint('player');

        const predictX = clamp(ball.pos.x + ball.vel.x * 18 * difficulty.reaction + (Math.random() - 0.5) * difficulty.error, -COURT_W / 2 + 0.8, COURT_W / 2 - 0.8);
        refs.ai.position.x = THREE.MathUtils.lerp(refs.ai.position.x, predictX, difficulty.speed);
        refs.ai.position.z = THREE.MathUtils.lerp(refs.ai.position.z, AI_Z + clamp(ball.pos.z + 9, -1.3, 1.5), 0.025);
        refs.ai.rotation.y = Math.PI + (predictX - refs.ai.position.x) * 0.08;
        if (ball.pos.z < 0 && refs.ai.position.distanceTo(ball.pos) < 1.6 && ball.vel.z < 0 && aiAttemptRallyRef.current !== ball.rally) {
          aiAttemptRallyRef.current = ball.rally;
          if (Math.random() < difficulty.missChance) {
            refs.aiRacket.rotation.z = 0.58;
            setAnalysis('ИИ не успел к мячу и ошибся.');
            setSave(current => ({ ...current, shots: current.shots + 1 }));
            window.setTimeout(() => {
              refs.aiRacket.rotation.z = 0.18;
            }, 260);
          } else {
            setThinking(true);
            setThinkingProgress(30 + Math.random() * 45);
            const power = save.mode === 'arcade' ? 1.18 : 0.92 + difficulty.reaction * 0.1;
            const targetX = clamp(refs.player.position.x + (Math.random() - 0.5) * (2.2 + difficulty.error), -4.8, 4.8);
            ball.vel.set((targetX - ball.pos.x) * 0.016, 0.048 + Math.random() * 0.022, 0.18 * power);
            ball.rally += 1;
            setAnalysis(Math.random() > 0.5 ? 'ИИ предсказал направление и вернул мяч глубоко.' : 'ИИ защищает сложный удар и держит розыгрыш.');
            setSave(current => ({ ...current, shots: current.shots + 1 }));
            window.setTimeout(() => {
              setThinking(false);
              setThinkingProgress(0);
            }, 420);
          }
        }
        refs.ball.position.copy(ball.pos);
        refs.trail.forEach((mesh, index) => {
          mesh.position.lerp(index === 0 ? ball.pos : refs.trail[index - 1].position, 0.32);
        });
        refs.playerRacket.rotation.y = Math.sin(time * 0.012) * 0.08 + 0.35;
        refs.playerRacket.rotation.z = THREE.MathUtils.lerp(refs.playerRacket.rotation.z, -0.18, 0.12);
        refs.aiRacket.rotation.y = Math.sin(time * 0.01) * 0.08 - 0.35;
        refs.aiRacket.rotation.z = THREE.MathUtils.lerp(refs.aiRacket.rotation.z, 0.18, 0.12);
      }
      const cameraTarget = cameraMode === 'follow'
        ? new THREE.Vector3(refs.player.position.x * 0.35, 6.8, refs.player.position.z + 8.5)
        : new THREE.Vector3(10, 9, 16);
      refs.camera.position.lerp(cameraTarget, 0.06);
      refs.camera.lookAt(0, 0.8, 0);
      refs.renderer.render(refs.scene, refs.camera);
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [cameraMode, difficulty.error, difficulty.reaction, difficulty.speed, gameStopped, save.mode]);

  function pointerFromJoy(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    const next = { active: true, x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    joystickRef.current = next;
    setJoystickVisual({ x: next.x, y: next.y });
  }

  function stopJoystick() {
    joystickRef.current = { active: false, x: 0, y: 0 };
    setJoystickVisual({ x: 0, y: 0 });
  }

  function movePlayerFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (gameStopped) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const normalizedY = (event.clientY - rect.top) / Math.max(1, rect.height);
    const targetX = (normalizedX - 0.5) * (COURT_W - 1.6);
    const targetZ = 1.2 + normalizedY * (COURT_L / 2 - 2.4);
    pointerTargetRef.current = {
      active: true,
      x: clamp(targetX, -COURT_W / 2 + 0.8, COURT_W / 2 - 0.8),
      z: clamp(targetZ, 1.2, COURT_L / 2 - 1.2),
    };
  }

  const scoreText = `${SCORE_LABELS[save.playerScore] ?? 'AD'} — ${SCORE_LABELS[save.aiScore] ?? 'AD'}`;
  const accuracy = save.shots > 0 ? Math.round((save.hits / save.shots) * 100) : 0;

  return (
    <div className="tennis-page">
      <header className="tennis-header">
        <button type="button" className="tennis-back" onClick={onBack}>← Игры</button>
        <div>
          <h2>Теннис с ИИ</h2>
          <p>Сделай перерыв и сыграй быстрый матч</p>
        </div>
      </header>

      <section className="tennis-topbar">
        <div><span>Score</span><strong>{scoreText}</strong></div>
        <div><span>Game</span><strong>{save.playerGames} / {save.aiGames}</strong></div>
        <div><span>Sets</span><strong>{save.playerSets}–{save.aiSets}</strong></div>
        <div><span>⏱ Timer</span><strong>{formatTime(save.seconds)}</strong></div>
      </section>

      <main className="tennis-layout">
        <section className="tennis-game-card">
          <div className="tennis-canvas-wrap">
            <div
              ref={mountRef}
              className={`tennis-canvas ${!started || save.paused ? 'is-muted' : ''}`}
              onPointerDown={(event) => {
                pointerMoveRef.current = { active: true, lastX: event.clientX, lastY: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
                movePlayerFromPointer(event);
                hitBall(1.1);
              }}
              onPointerMove={(event) => {
                if (pointerMoveRef.current.active) movePlayerFromPointer(event);
              }}
              onPointerUp={(event) => {
                pointerMoveRef.current.active = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                pointerMoveRef.current.active = false;
              }}
            />
            {started && !save.result && (
              <button
                type="button"
                className="tennis-pause-button"
                aria-label={save.paused ? 'Продолжить' : 'Пауза'}
                onClick={() => setSave(current => ({ ...current, paused: !current.paused }))}
              >
                <span />
                <span />
              </button>
            )}
            {!started && !save.result && (
              <div className="tennis-start-overlay">
                <button
                  type="button"
                  onClick={() => {
                    setStarted(true);
                    setSave(current => ({ ...current, paused: false }));
                  }}
                >
                  Начать
                </button>
              </div>
            )}
            {started && save.paused && !save.result && (
              <div className="tennis-start-overlay">
                <div className="tennis-pause-menu">
                  <button type="button" onClick={() => setSave(current => ({ ...current, paused: false }))}>Продолжить</button>
                  <button type="button" onClick={() => reset(save.mode, save.difficulty, true)}>Начать сначала</button>
                  <button type="button" className="ghost" onClick={onBack}>Выйти</button>
                </div>
              </div>
            )}
            <div className="tennis-hud">
              <span>{thinking ? '🤖 ИИ думает…' : 'Тяни по корту или WASD / стрелки'}</span>
              <i style={{ width: `${thinking ? thinkingProgress : 0}%` }} />
            </div>
            <div
              className="tennis-joystick"
              onPointerDown={pointerFromJoy}
              onPointerMove={event => joystickRef.current.active && pointerFromJoy(event)}
              onPointerUp={stopJoystick}
              onPointerCancel={stopJoystick}
            >
              <span style={{ transform: `translate(${joystickVisual.x * 22}px, ${joystickVisual.y * 22}px)` }} />
            </div>
          </div>
        </section>

        <aside className="tennis-sidebar">
          <section>
            <h3>AI Difficulty</h3>
            <div className="tennis-difficulty">
              {DIFFICULTIES.map(item => (
                <button key={item.key} type="button" className={save.difficulty === item.key ? 'active' : ''} onClick={() => reset(save.mode, item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      {save.result && (
        <div className="tennis-end">
          <div className="tennis-end-card">
            <h3>Матч завершён 🎉</h3>
            <p>Score: <strong>{save.playerGames} — {save.aiGames}</strong></p>
            <p>Shots: <strong>{save.shots}</strong></p>
            <p>Accuracy: <strong>{accuracy}%</strong></p>
            <p>Difficulty: <strong>{save.difficulty}</strong></p>
            <div className="tennis-end-actions">
              <button type="button" onClick={() => reset()}>Реванш</button>
              <button type="button" onClick={() => reset()}>Играть снова</button>
              <button type="button" className="ghost" onClick={onBack}>Вернуться в игры</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
