import { useEffect, useState, useRef } from 'react';
import { addTodayFocusSeconds } from '../lib/timerStats';

const TIMER_KEY = 'planify_timer_state';

const MODE_COLORS: Record<string, string> = {
  short: '#0D9488',
  long:  '#6366F1',
};
const MODE_LABELS: Record<string, string> = {
  focus: 'Фокус',
  short: 'Перерыв',
  long:  'Длинный',
};

export function FloatingTimer({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [timeLeft,   setTimeLeft]   = useState(0);
  const [total,      setTotal]      = useState(25 * 60);
  const [mode,       setMode]       = useState('focus');
  const [running,    setRunning]    = useState(false);
  const [hidden,     setHidden]     = useState(false);
  const [startedAt,  setStartedAt]  = useState<number | null>(null);
  const [pos,        setPos]        = useState({ x: window.innerWidth - 240, y: 18 });
  const [wSize,      setWSize]      = useState(210);
  const [themeColor, setThemeColor] = useState(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB'
  );

  const dragging        = useRef(false);
  const dragOffset      = useRef({ x: 0, y: 0 });
  const resizing        = useRef(false);
  const resizeStartX    = useRef(0);
  const resizeStartW    = useRef(0);
  // stores the startedAt value that was active when user pressed X
  // widget only re-appears when a NEW startedAt is detected
  const hiddenAtStartedAt = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setThemeColor(getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB');
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      try {
        const raw = localStorage.getItem(TIMER_KEY);
        if (!raw) { setRunning(false); return; }
        const s = JSON.parse(raw);
        if (!s.running || !s.startedAt || !s.totalSec) { setRunning(false); return; }
        const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
        const left = s.totalSec - elapsed;
        if (left <= 0) {
          if ((s.mode ?? 'focus') === 'focus') addTodayFocusSeconds(s.totalSec);
          localStorage.setItem(TIMER_KEY, JSON.stringify({ ...s, running: false, pausedLeft: 0 }));
          setRunning(false);
          return;
        }

        setRunning(true);
        setMode(s.mode ?? 'focus');
        setTotal(s.totalSec);
        setTimeLeft(left);
        setStartedAt(s.startedAt);

        // Re-show only when a brand-new timer session starts
        if (hiddenAtStartedAt.current !== null && s.startedAt !== hiddenAtStartedAt.current) {
          hiddenAtStartedAt.current = null;
          setHidden(false);
        }
      } catch { setRunning(false); }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizing.current) {
        const newW = Math.max(160, Math.min(420, resizeStartW.current + (e.clientX - resizeStartX.current)));
        setWSize(newW);
        return;
      }
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - (ref.current?.offsetWidth  ?? 210), e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - (ref.current?.offsetHeight ?? 80),  e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  if (!running || hidden) return null;

  const color = mode === 'focus' ? themeColor : (MODE_COLORS[mode] || themeColor);
  const label = MODE_LABELS[mode] || 'Фокус';
  const mins  = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs  = String(timeLeft % 60).padStart(2, '0');
  const pct   = total > 0 ? (total - timeLeft) / total : 0;

  // Scale ring and font with widget width
  const ringSize    = Math.round(Math.max(52, Math.min(110, wSize * 0.37)));
  const R           = ringSize * 0.41;
  const CX          = ringSize / 2;
  const circ        = 2 * Math.PI * R;
  const arc         = circ * pct;
  const iconSize    = Math.round(ringSize * 0.28);
  const timeFontSz  = Math.round(Math.max(18, Math.min(40, wSize * 0.135)));

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top:  pos.y,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'white',
        border: `2px solid ${color}35`,
        borderRadius: 20,
        padding: '10px 16px 10px 12px',
        boxShadow: `0 6px 28px ${color}30, 0 2px 10px rgba(0,0,0,0.10)`,
        userSelect: 'none',
        cursor: 'grab',
        width: wSize,
        boxSizing: 'border-box',
        minWidth: 160,
      }}
      onMouseDown={e => {
        if ((e.target as HTMLElement).closest('.ft-close,.ft-resize')) return;
        dragging.current = true;
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      }}
    >
      {/* Ring */}
      <div
        style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0, cursor: 'pointer' }}
        onClick={() => onNavigate('Таймер')}
      >
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={CX} cy={CX} r={R} fill="none" stroke={color + '25'} strokeWidth="5"/>
          <circle cx={CX} cy={CX} r={R} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s' }}/>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
            <circle cx="12" cy="13" r="8"/>
            <path d="M7 3A2 2 0 0110 1"/><path d="M14 1A2 2 0 0117 3"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="13" x2="15" y2="16"/>
          </svg>
        </div>
      </div>

      {/* Time + label */}
      <div style={{ flex: 1, cursor: 'pointer', minWidth: 0, overflow: 'hidden' }} onClick={() => onNavigate('Таймер')}>
        <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500, marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: timeFontSz, fontWeight: 800, color: '#1E293B', letterSpacing: '-1px', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {mins}:{secs}
        </div>
      </div>

      {/* Close — hides widget permanently until a new timer session starts */}
      <button
        className="ft-close"
        onClick={e => {
          e.stopPropagation();
          hiddenAtStartedAt.current = startedAt;
          setHidden(true);
        }}
        style={{
          position: 'absolute', top: 6, right: 8,
          width: 22, height: 22, borderRadius: '50%',
          border: 'none', background: '#F1F5F9', color: '#94A3B8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0, flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="1" y1="1" x2="11" y2="11"/>
          <line x1="11" y1="1" x2="1" y2="11"/>
        </svg>
      </button>

      {/* Resize grip — bottom-right corner */}
      <div
        className="ft-resize"
        style={{
          position: 'absolute', bottom: 5, right: 6,
          width: 14, height: 14, cursor: 'se-resize', opacity: 0.35,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        }}
        onMouseDown={e => {
          e.stopPropagation();
          resizing.current = true;
          resizeStartX.current = e.clientX;
          resizeStartW.current = wSize;
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round">
          <line x1="9" y1="3" x2="3" y2="9"/>
          <line x1="9" y1="6" x2="6" y2="9"/>
        </svg>
      </div>
    </div>
  );
}
