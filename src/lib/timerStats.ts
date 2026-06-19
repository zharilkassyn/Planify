const TIMER_STATS_KEY = 'planify_timer_focus_stats';

export const TIMER_STATS_EVENT = 'planify_timer_stats_updated';

type TimerStats = Record<string, number>;

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function loadStats(): TimerStats {
  try {
    const raw = localStorage.getItem(TIMER_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'number' && Number.isFinite(entry[1])
      )
    );
  } catch {
    return {};
  }
}

function saveStats(stats: TimerStats) {
  const entries = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b)).slice(-60);
  localStorage.setItem(TIMER_STATS_KEY, JSON.stringify(Object.fromEntries(entries)));
  window.dispatchEvent(new Event(TIMER_STATS_EVENT));
}

export function getTodayFocusSeconds() {
  return loadStats()[localDateKey()] ?? 0;
}

export function addTodayFocusSeconds(seconds: number) {
  const today = localDateKey();
  const stats = loadStats();
  stats[today] = (stats[today] ?? 0) + Math.max(0, Math.floor(seconds));
  saveStats(stats);
  return stats[today];
}

export function getWeekFocusHours() {
  const stats = loadStats();
  const today = new Date();
  const monday = new Date(today);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return (stats[localDateKey(d)] ?? 0) / 3600;
  });
}

export function formatSecondsHMS(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
