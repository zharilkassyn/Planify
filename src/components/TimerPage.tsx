import { useEffect, useState, useRef } from 'react';
import { requestPermission, notifyTimerDone } from '../lib/notifications';
import { addTodayFocusSeconds, formatSecondsHMS } from '../lib/timerStats';

type Mode = 'focus' | 'short' | 'long';

const TIMER_KEY = 'planify_timer_state';

interface TimerState {
  mode: Mode;
  running: boolean;
  startedAt?: number;   // Date.now() when timer started
  totalSec?: number;    // total seconds of the current run
  pausedLeft?: number;  // seconds left when paused
  customMins: { focus: number; short: number; long: number };
}

const MODES: Record<Mode, { label: string; duration: number; color: string }> = {
  focus: { label: 'Фокус',             duration: 25 * 60, color: '#2563EB' },
  short: { label: 'Короткий перерыв',  duration:  5 * 60, color: '#0D9488' },
  long:  { label: 'Длинный перерыв',   duration: 15 * 60, color: '#6366F1' },
};

const TIPS = [
  'Делай короткие перерывы, чтобы сохранять концентрацию и эффективность.',
  'Убери телефон во время фокус-сессии для лучшей концентрации.',
  'Стакан воды перед началом работы помогает мозгу лучше работать.',
  'Разбей большую задачу на маленькие шаги — так легче начать.',
];

const MAX_TIMER_MINUTES = 5 * 60;

function loadTimerState(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveTimerState(s: TimerState) {
  localStorage.setItem(TIMER_KEY, JSON.stringify(s));
}

export function TimerPage() {
  const saved = loadTimerState();

  const [mode,        setMode]        = useState<Mode>(saved?.mode ?? 'focus');
  const [customMins, setCustomMins]   = useState(saved?.customMins ?? { focus: 25, short: 5, long: 15 });

  // Compute initial timeLeft from saved state
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    if (!saved) return MODES.focus.duration;
    if (saved.running && saved.startedAt && saved.totalSec) {
      const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
      const left = saved.totalSec - elapsed;
      return left > 0 ? left : 0;
    }
    return saved.pausedLeft ?? (saved.customMins?.[saved.mode] ?? 25) * 60;
  });
  const [running, setRunning] = useState<boolean>(() => {
    if (!saved?.running || !saved.startedAt || !saved.totalSec) return false;
    const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
    return saved.totalSec - elapsed > 0;
  });

  const [themeColor, setThemeColor] = useState(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB'
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setThemeColor(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB');
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  const [tipIdx]                      = useState(() => Math.floor(Math.random() * TIPS.length));
  const [showSettings, setShowSettings] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track startedAt + totalSec in refs for use inside interval
  const startedAtRef = useRef<number | undefined>(saved?.running ? saved.startedAt : undefined);
  const totalSecRef  = useRef<number | undefined>(saved?.running ? saved.totalSec  : undefined);

  useEffect(() => {
    const next = loadTimerState();
    if (!next?.running || !next.startedAt || !next.totalSec) return;
    setMode(next.mode);
    setCustomMins(next.customMins);
    startedAtRef.current = next.startedAt;
    totalSecRef.current = next.totalSec;
    const elapsed = Math.floor((Date.now() - next.startedAt) / 1000);
    setTimeLeft(Math.max(0, next.totalSec - elapsed));
    setRunning(next.totalSec - elapsed > 0);
  }, []);

  // Timer tick — compute from real timestamp so background tabs stay accurate
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        if (!startedAtRef.current || !totalSecRef.current) return;
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        const left = totalSecRef.current - elapsed;
        if (left <= 0) {
          clearInterval(intervalRef.current!);
          notifyTimerDone(mode);
          const completedSec = totalSecRef.current ?? 0;
          setRunning(false);
          setTimeLeft(0);
          startedAtRef.current = undefined;
          totalSecRef.current  = undefined;
          if (mode === 'focus') {
            addTodayFocusSeconds(completedSec);
          }
          saveTimerState({ mode, running: false, pausedLeft: 0, customMins });
        } else {
          setTimeLeft(left);
        }
      }, 500); // 500ms for smoother update
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function startTimer() {
    requestPermission();
    const total = customMins[mode] * 60;
    // If resuming from pause use current timeLeft, else full duration
    const remaining = timeLeft > 0 ? timeLeft : total;
    const now = Date.now();
    startedAtRef.current = now - (total - remaining) * 1000;
    totalSecRef.current  = total;
    saveTimerState({ mode, running: true, startedAt: startedAtRef.current, totalSec: total, customMins });
    setRunning(true);
  }

  function pauseTimer() {
    setRunning(false);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode, running: false, pausedLeft: timeLeft, customMins });
  }

  function switchMode(m: Mode) {
    setMode(m);
    setRunning(false);
    const t = customMins[m] * 60;
    setTimeLeft(t);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode: m, running: false, pausedLeft: t, customMins });
  }

  function reset() {
    setRunning(false);
    const t = customMins[mode] * 60;
    setTimeLeft(t);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode, running: false, pausedLeft: t, customMins });
  }

  function adjustTime(delta: number) {
    const newMins = Math.max(1, Math.min(MAX_TIMER_MINUTES, customMins[mode] + delta));
    const next = { ...customMins, [mode]: newMins };
    setCustomMins(next);
    setTimeLeft(newMins * 60);
    setRunning(false);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode, running: false, pausedLeft: newMins * 60, customMins: next });
  }

  function fmtTime(s: number) {
    return formatSecondsHMS(s);
  }

  const total   = customMins[mode] * 60;
  const pct     = (total - timeLeft) / total;
  const R       = 110;
  const CX      = 130;
  const circ    = 2 * Math.PI * R;
  const arc     = circ * pct;
  const getModeColor = (m: Mode) => m === 'focus' ? themeColor : MODES[m].color;
  const mcolor  = getModeColor(mode);

  return (
    <div className="timer-layout">
      {/* ── LEFT ── */}
      <div className="timer-main">
        <div className="dash-header" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700 }}>Таймер</h2>
        </div>

        {/* Mode tabs */}
        <div className="timer-tabs">
          {(['focus','short','long'] as Mode[]).map(m => (
            <button key={m} className={`timer-tab${mode === m ? ' active' : ''}`}
              style={mode === m ? { background: getModeColor(m) } : {}}
              onClick={() => switchMode(m)}>
              {MODES[m].label}
            </button>
          ))}
          <button className={`timer-tab settings-tab${showSettings ? ' active-settings' : ''}`}
            onClick={() => setShowSettings(v => !v)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Настройки
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="settings-panel">
            {(['focus','short','long'] as Mode[]).map(m => (
              <label key={m} className="settings-row">
                <span>{MODES[m].label}</span>
                <input type="number" min={1} max={MAX_TIMER_MINUTES} value={customMins[m]}
                  onChange={e => {
                    const val = Math.max(1, Math.min(MAX_TIMER_MINUTES, +e.target.value));
                    const next = { ...customMins, [m]: val };
                    setCustomMins(next);
                    if (mode === m) {
                      setTimeLeft(val * 60);
                      setRunning(false);
                      saveTimerState({ mode, running: false, pausedLeft: val * 60, customMins: next });
                    }
                  }} />
                <span>мин</span>
              </label>
            ))}
          </div>
        )}

        {/* Circle timer */}
        <div className="timer-circle-wrap">
          <div className="timer-circle-label">{MODES[mode].label}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <button className="timer-adj-btn" style={{ background: mcolor + '15', color: mcolor, borderColor: mcolor + '40' }} onClick={() => adjustTime(1)}>+</button>
            <div style={{ position: 'relative', width: 260, height: 260 }}>
              <svg width="260" height="260" viewBox="0 0 260 260" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={CX} cy={CX} r={R} fill="none" stroke={mcolor + '25'} strokeWidth="10"/>
                <circle cx={CX} cy={CX} r={R} fill="none" stroke={mcolor} strokeWidth="10"
                  strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.5s' }}/>
              </svg>
              <div className="timer-big-time">{fmtTime(timeLeft)}</div>
            </div>
            <button className="timer-adj-btn" style={{ background: mcolor + '15', color: mcolor, borderColor: mcolor + '40' }} onClick={() => adjustTime(-1)}>−</button>
          </div>
          <div className="timer-controls">
            <button className="timer-play-btn" style={{ background: mcolor }}
              onClick={() => running ? pauseTimer() : startTimer()}>
              {running
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
            </button>
            <button className="timer-reset-btn" onClick={reset}
              style={{ background: mcolor + '22', border: `2px solid ${mcolor}60`, color: mcolor }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Tip */}
        <div className="tip-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mcolor} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="7" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span><b style={{ color: mcolor }}>Совет:</b> {TIPS[tipIdx]}</span>
        </div>
      </div>
    </div>
  );
}
