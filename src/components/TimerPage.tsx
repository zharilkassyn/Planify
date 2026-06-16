import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Task = { id: string; title: string; completed: boolean };
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

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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

  const [cycles,      setCycles]      = useState(0);
  const [sessionSec,  setSessionSec]  = useState(0);
  const [todaySec,    setTodaySec]    = useState(0);
  const [weekData,    setWeekData]    = useState<number[]>(Array(7).fill(0));
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [showAll,     setShowAll]     = useState(false);
  const [tipIdx]                      = useState(() => Math.floor(Math.random() * TIPS.length));
  const [showSettings, setShowSettings] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track startedAt + totalSec in refs for use inside interval
  const startedAtRef = useRef<number | undefined>(saved?.running ? saved.startedAt : undefined);
  const totalSecRef  = useRef<number | undefined>(saved?.running ? saved.totalSec  : undefined);

  // Load tasks
  useEffect(() => {
    supabase.from('entries').select('id, title, completed').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setTasks(data as Task[]); });
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
          setRunning(false);
          setTimeLeft(0);
          startedAtRef.current = undefined;
          totalSecRef.current  = undefined;
          if (mode === 'focus') {
            setCycles(c => c + 1);
            setTodaySec(s => s + MODES.focus.duration);
            const today = new Date().getDay();
            const idx = today === 0 ? 6 : today - 1;
            setWeekData(w => { const n = [...w]; n[idx] += MODES.focus.duration / 3600; return n; });
          }
          saveTimerState({ mode, running: false, pausedLeft: 0, customMins });
        } else {
          setTimeLeft(left);
          if (mode === 'focus') setSessionSec(s => s + 1);
        }
      }, 500); // 500ms for smoother update
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function startTimer() {
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
    setSessionSec(0);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode: m, running: false, pausedLeft: t, customMins });
  }

  function reset() {
    setRunning(false);
    const t = customMins[mode] * 60;
    setTimeLeft(t);
    setSessionSec(0);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode, running: false, pausedLeft: t, customMins });
  }

  function adjustTime(delta: number) {
    const newMins = Math.max(1, Math.min(60, customMins[mode] + delta));
    const next = { ...customMins, [mode]: newMins };
    setCustomMins(next);
    setTimeLeft(newMins * 60);
    setRunning(false);
    startedAtRef.current = undefined;
    totalSecRef.current  = undefined;
    saveTimerState({ mode, running: false, pausedLeft: newMins * 60, customMins: next });
  }

  function fmtTime(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }
  function fmtHM(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}м`;
    return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
  }

  const total   = customMins[mode] * 60;
  const pct     = (total - timeLeft) / total;
  const R       = 110;
  const CX      = 130;
  const circ    = 2 * Math.PI * R;
  const arc     = circ * pct;
  const mcolor  = MODES[mode].color;

  const doneTasks = tasks.filter(t => t.completed).length;
  const visibleTasks = showAll ? tasks : tasks.slice(0, 5);

  // Focus stats (of total focused time today)
  const focusPct = todaySec > 0 ? 75 : 0;
  const breakPct = todaySec > 0 ? 20 : 0;
  const distrPct = todaySec > 0 ? 5  : 0;
  const totalTime = todaySec + Math.floor(todaySec * 0.25);
  const rD = 50, cD = 2 * Math.PI * rD;

  // Week chart
  const maxH = Math.max(...weekData, 0.5);
  const chartH = 100;
  const chartW = 260;
  const points = weekData.map((h, i) => {
    const x = (i / 6) * (chartW - 20) + 10;
    const y = chartH - (h / maxH) * (chartH - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

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
              style={mode === m ? { background: MODES[m].color } : {}}
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
                <input type="number" min={1} max={60} value={customMins[m]}
                  onChange={e => {
                    const val = Math.max(1, Math.min(60, +e.target.value));
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
                <circle cx={CX} cy={CX} r={R} fill="none" stroke="#DBEAFE" strokeWidth="10"/>
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

        {/* Current task */}
        <div className="current-task-card">
          {currentTask ? (
            <>
              <div className="ct-icon" style={{ background: mcolor + '20', color: mcolor }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className="ct-info">
                <div className="ct-title">{currentTask.title}</div>
                <div className="ct-sub">Фокус: 1 × 25 мин</div>
              </div>
              <button className="ct-change" onClick={() => setCurrentTask(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Изменить задачу
              </button>
            </>
          ) : (
            <div className="ct-empty">
              {tasks.length === 0
                ? 'Задач нет — добавь задачи в Планировщике'
                : 'Выбери задачу из списка справа →'}
            </div>
          )}
        </div>

        {/* Tip */}
        <div className="tip-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mcolor} strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span><b style={{ color: mcolor }}>Совет:</b> {TIPS[tipIdx]}</span>
        </div>

        {/* Session stats */}
        <div className="session-title">Сессия</div>
        <div className="session-stats">
          {[
            { label: 'Фокус сессии',    value: fmtHM(sessionSec) },
            { label: 'Потрачено сегодня', value: fmtHM(todaySec) },
            { label: 'Выполнено задач', value: String(doneTasks) },
            { label: 'Циклов фокуса',   value: `${cycles}/8` },
          ].map(s => (
            <div key={s.label} className="session-card">
              <div className="session-val">{s.value}</div>
              <div className="session-key">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Week chart */}
        <div className="week-chart-card">
          <svg width="100%" height={chartH + 30} viewBox={`0 0 ${chartW} ${chartH + 30}`}>
            {/* Y grid */}
            {[0,2,4,6].map(v => {
              const y = chartH - (v / maxH) * (chartH - 10) - 5;
              return (
                <g key={v}>
                  <line x1="10" y1={y} x2={chartW - 10} y2={y} stroke="#E2E8F0" strokeWidth="1"/>
                  <text x="0" y={y + 4} fontSize="9" fill="#94A3B8">{v}ч</text>
                </g>
              );
            })}
            {/* Line */}
            <polyline points={points} fill="none" stroke={mcolor} strokeWidth="2" strokeLinejoin="round"/>
            {/* Dots */}
            {weekData.map((h, i) => {
              const x = (i / 6) * (chartW - 20) + 10;
              const y = chartH - (h / maxH) * (chartH - 10) - 5;
              return <circle key={i} cx={x} cy={y} r="4" fill={mcolor}/>;
            })}
            {/* X labels */}
            {DAY_LABELS.map((d, i) => {
              const x = (i / 6) * (chartW - 20) + 10;
              return <text key={i} x={x} y={chartH + 20} fontSize="10" fill="#94A3B8" textAnchor="middle">{d}</text>;
            })}
          </svg>
          {weekData.every(v => v === 0) && (
            <div className="chart-empty">Начни сессию фокуса — здесь появится твой прогресс за неделю</div>
          )}
        </div>
      </div>

      {/* ── RIGHT ── */}
      <div className="timer-right">

        {/* Task list */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Список задач</span>
            <span style={{ fontSize: 12, color: mcolor, fontWeight: 600 }}>+ Добавить задачу</span>
          </div>
          <div className="check-list">
            {tasks.length === 0 && (
              <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
                Задач нет. Добавь их в Планировщике!
              </p>
            )}
            {visibleTasks.map(t => (
              <div key={t.id}
                className={`check-row timer-task${t.completed ? ' done' : ''}${currentTask?.id === t.id ? ' active-task' : ''}`}
                onClick={() => setCurrentTask(t.id === currentTask?.id ? null : t)}>
                <div className={`chk${t.completed ? ' chk-done' : ''}`}
                  style={t.completed ? { background: mcolor, borderColor: mcolor } : {}}>
                  {t.completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="check-label">{t.title}</div>
                  <div className="task-focus-hint">Фокус: 1 × 25 мин</div>
                </div>
              </div>
            ))}
          </div>
          {tasks.length > 5 && (
            <button className="show-all-btn" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Скрыть' : 'Показать все'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: showAll ? 'rotate(180deg)' : 'none' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          )}
        </div>

        {/* Focus stats */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Статистика фокуса</span>
          </div>
          {todaySec === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
              Начни первую сессию — здесь появится статистика!
            </p>
          ) : (
            <div className="focus-stats">
              <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
                <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="55" cy="55" r={rD} fill="none" stroke="#DBEAFE" strokeWidth="10"/>
                  <circle cx="55" cy="55" r={rD} fill="none" stroke={mcolor} strokeWidth="10"
                    strokeDasharray={`${cD * focusPct / 100} ${cD}`} strokeLinecap="round"/>
                  <circle cx="55" cy="55" r={rD} fill="none" stroke="#0D9488" strokeWidth="10"
                    strokeDasharray={`${cD * breakPct / 100} ${cD}`}
                    strokeDashoffset={-(cD * focusPct / 100)} strokeLinecap="round"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtHM(totalTime)}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Общее время</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { color: mcolor,    label: 'Фокус',     val: fmtHM(todaySec),                        pct: focusPct },
                  { color: '#0D9488', label: 'Перерывы',  val: fmtHM(Math.floor(todaySec * 0.2)),      pct: breakPct },
                  { color: '#EF4444', label: 'Отвлечения',val: fmtHM(Math.floor(todaySec * 0.05)),     pct: distrPct },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 12, color: '#64748B', flex: 1 }}>{s.label} {s.pct}%</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Motivational */}
        <div className="moti-card" style={{ borderColor: mcolor + '30', background: mcolor + '08' }}>
          <div style={{ fontSize: 18 }}>🎯</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              {cycles === 0 ? 'Готов к работе!' : `Ты молодец! ${cycles} ${cycles === 1 ? 'цикл' : cycles < 5 ? 'цикла' : 'циклов'} завершено`}
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              {cycles === 0
                ? 'Нажми Старт и начни свою первую сессию фокуса.'
                : 'Продолжай в том же духе! Ты на верном пути.'}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
