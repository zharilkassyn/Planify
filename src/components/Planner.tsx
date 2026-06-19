import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type PEvent = { id: string; title: string; description: string; hour: number; end_hour: number; color: string; event_date: string };

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const EVENT_COLORS = ['#2563EB', '#0284C7', '#6366F1', '#0D9488', '#F59E0B', '#EF4444'];
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

type View = 'day' | 'week' | 'month';

function toStr(d: Date) { return d.toISOString().slice(0, 10); }
function todayStr() { return toStr(new Date()); }

function addDays(base: Date, n: number): Date {
  const d = new Date(base); d.setDate(d.getDate() + n); return d;
}

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getMonthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  let startDow = first.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startDow; i > 0; i--)  cells.push({ date: addDays(first, -i), inMonth: false });
  for (let d = 0; d < last.getDate(); d++) cells.push({ date: addDays(first, d), inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ date: addDays(last, cells.length - last.getDate() - startDow + 1), inMonth: false });
  return cells;
}

export function Planner() {
  const [allEvs,  setAllEvs]  = useState<PEvent[]>([]);

  const [view,    setView]    = useState<View>('day');
  const [dayOff,  setDayOff]  = useState(0);   // day view: days from today
  const [weekOff, setWeekOff] = useState(0);   // week view: weeks from current week
  const [monOff,  setMonOff]  = useState(0);   // month view: months from current month

  const [showEF, setShowEF] = useState(false);
  const [newEv, setNewEv]   = useState({ title: '', desc: '', hour: 9, end: 10, color: '#2563EB', date: todayStr() });

  // ── computed dates ──
  const today    = new Date();
  const dayBase  = addDays(today, dayOff);
  const monday   = addDays(getMondayOf(today), weekOff * 7);
  const weekDays = getWeekDates(monday);
  const monthYear = today.getFullYear();
  const monthIdx  = today.getMonth() + monOff;
  const monthDate = new Date(monthYear, monthIdx, 1);
  const monthCells = getMonthCells(monthDate.getFullYear(), monthDate.getMonth());

  const currentDate = toStr(dayBase);

  // ── label ──
  const dayLabel = dayBase.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const weekLabel = `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${weekDays[6].toLocaleDateString('ru-RU', { month: 'long' })}`;
  const monthLabel = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  // ── load ──
  async function loadEvents() {
    let query = supabase.from('planner_events').select('id, title, description, hour, end_hour, color, event_date');
    if (view === 'day') {
      query = query.eq('event_date', currentDate);
    } else if (view === 'week') {
      query = query.in('event_date', weekDays.map(toStr));
    } else {
      const first = toStr(monthCells[0].date);
      const last  = toStr(monthCells[monthCells.length - 1].date);
      query = query.gte('event_date', first).lte('event_date', last);
    }
    const { data } = await query;
    setAllEvs(data ?? []);
  }

  useEffect(() => { loadEvents(); }, [view, dayOff, weekOff, monOff]);

  // ── event CRUD ──
  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEv.title.trim()) return;
    const { data } = await supabase.from('planner_events').insert({
      title: newEv.title.trim(), description: newEv.desc.trim(),
      hour: newEv.hour, end_hour: newEv.end, color: newEv.color, event_date: newEv.date,
    }).select().single();
    if (data) { setAllEvs(ev => [...ev, data as PEvent]); setNewEv({ title: '', desc: '', hour: 9, end: 10, color: '#2563EB', date: currentDate }); setShowEF(false); }
  }

  async function deleteEvent(id: string) {
    await supabase.from('planner_events').delete().eq('id', id);
    setAllEvs(ev => ev.filter(e => e.id !== id));
  }

  // ── nav ──
  function navPrev() {
    if (view === 'day')   setDayOff(o => o - 1);
    if (view === 'week')  setWeekOff(o => o - 1);
    if (view === 'month') setMonOff(o => o - 1);
  }
  function navNext() {
    if (view === 'day')   setDayOff(o => o + 1);
    if (view === 'week')  setWeekOff(o => o + 1);
    if (view === 'month') setMonOff(o => o + 1);
  }

  // ── renders ──
  function renderDayGrid(date: string, evList: PEvent[], compact = false) {
    const nowH = new Date().getHours();
    return (
      <div className="time-grid">
        {HOURS.map(h => {
          const ev = evList.find(e => e.hour === h && e.event_date === date);
          const isNow = h === nowH && date === todayStr();
          return (
            <div key={h} className={`time-row${isNow ? ' now-row' : ''}`} style={compact ? { minHeight: 40 } : {}}>
              {!compact && <div className="time-label">{String(h).padStart(2,'0')}:00</div>}
              <div className="time-slot">
                {isNow && <div className="now-line" />}
                {ev && (
                  <div className="event-block" style={{ background: ev.color + '18', borderLeft: `3px solid ${ev.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        {!compact && <div className="event-time" style={{ color: ev.color }}>{ev.hour}:00 – {ev.end_hour}:00</div>}
                        <div className="event-title" style={{ color: ev.color, fontSize: compact ? 11 : 13 }}>{ev.title}</div>
                      </div>
                      <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>×</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function WeekView() {
    return (
      <div className="week-grid">
        {/* header */}
        <div className="week-header">
          <div className="week-time-col" />
          {weekDays.map((d, i) => {
            const isToday = toStr(d) === todayStr();
            return (
              <div key={i} className={`week-day-header${isToday ? ' today' : ''}`}>
                <div className="week-day-name">{DAY_NAMES[i]}</div>
                <div className={`week-day-num${isToday ? ' today-num' : ''}`}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        {/* rows */}
        <div className="week-body">
          {HOURS.map(h => (
            <div key={h} className="week-row">
              <div className="week-time-col">{String(h).padStart(2,'0')}:00</div>
              {weekDays.map((d, i) => {
                const dateStr = toStr(d);
                const ev = allEvs.find(e => e.hour === h && e.event_date === dateStr);
                const isNow = h === new Date().getHours() && dateStr === todayStr();
                return (
                  <div key={i} className={`week-cell${isNow ? ' now-cell' : ''}`}>
                    {ev && (
                      <div className="event-block" style={{ background: ev.color + '18', borderLeft: `3px solid ${ev.color}`, padding: '4px 6px' }}>
                        <div className="event-title" style={{ color: ev.color, fontSize: 11 }}>{ev.title}</div>
                        <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function MonthView() {
    return (
      <div className="month-grid">
        {/* day names header */}
        <div className="month-header">
          {DAY_NAMES.map(n => <div key={n} className="month-day-name">{n}</div>)}
        </div>
        {/* cells */}
        <div className="month-body">
          {monthCells.map(({ date, inMonth }, i) => {
            const ds = toStr(date);
            const evCount = allEvs.filter(e => e.event_date === ds).length;
            const evColors = [...new Set(allEvs.filter(e => e.event_date === ds).map(e => e.color))].slice(0, 3);
            const isToday = ds === todayStr();
            return (
              <div
                key={i}
                className={`month-cell${!inMonth ? ' out-month' : ''}${isToday ? ' today-cell' : ''}`}
                onClick={() => { setDayOff(Math.round((date.getTime() - today.getTime()) / 86400000)); setView('day'); }}
              >
                <div className={`month-day-num${isToday ? ' today-num' : ''}`}>{date.getDate()}</div>
                {evCount > 0 && (
                  <div className="month-dots">
                    {evColors.map((c, j) => <div key={j} className="month-dot" style={{ background: c }} />)}
                    {evCount > 3 && <div className="month-dot-more">+{evCount - 3}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const label = view === 'day' ? dayLabel : view === 'week' ? weekLabel : monthLabel;

  return (
    <div className="planner-layout">
      {/* ── LEFT ── */}
      <div className="planner-main">
        <div className="dash-header" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700 }}>Планировщик</h2>
        </div>

        <div className="planner-controls">
          <div className="view-tabs">
            {(['day','week','month'] as View[]).map(v => (
              <button key={v} className={`view-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
                {v === 'day' ? 'День' : v === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
          </div>
          <div className="date-nav">
            <button className="nav-arrow" onClick={navPrev}>←</button>
            <div className="date-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {label}
            </div>
            <button className="nav-arrow" onClick={navNext}>→</button>
          </div>
          <button className="add-task-btn" onClick={() => { setNewEv(v => ({ ...v, date: currentDate })); setShowEF(f => !f); }}>
            + Добавить событие
          </button>
        </div>

        {showEF && (
          <form onSubmit={addEvent} className="event-form">
            <input className="planner-input" style={{ flex: 2 }} placeholder="Название"
              value={newEv.title} onChange={e => setNewEv(v => ({ ...v, title: e.target.value }))} />
            <input className="planner-input" style={{ flex: 2 }} placeholder="Описание"
              value={newEv.desc} onChange={e => setNewEv(v => ({ ...v, desc: e.target.value }))} />
            <input type="date" className="planner-input" value={newEv.date}
              onChange={e => setNewEv(v => ({ ...v, date: e.target.value }))} />
            <select className="planner-input" value={newEv.hour}
              onChange={e => setNewEv(v => ({ ...v, hour: +e.target.value }))}>
              {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
            </select>
            <select className="planner-input" value={newEv.end}
              onChange={e => setNewEv(v => ({ ...v, end: +e.target.value }))}>
              {HOURS.filter(h => h > newEv.hour).map(h => <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {EVENT_COLORS.map(c => (
                <button key={c} type="button"
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newEv.color === c ? '3px solid #1E293B' : '2px solid transparent', padding: 0, cursor: 'pointer' }}
                  onClick={() => setNewEv(v => ({ ...v, color: c }))} />
              ))}
            </div>
            <button type="submit" className="add-task-btn">Сохранить</button>
            <button type="button" className="nav-arrow" onClick={() => setShowEF(false)}>✕</button>
          </form>
        )}

        {view === 'day'   && renderDayGrid(currentDate, allEvs)}
        {view === 'week'  && <WeekView />}
        {view === 'month' && <MonthView />}
      </div>
    </div>
  );
}
