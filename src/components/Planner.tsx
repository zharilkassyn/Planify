import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Task = { id: string; title: string; completed: boolean };
type Habit = { id: string; name: string; color: string };
type HabitLog = { habit_id: string; logged_date: string };
type PEvent = { id: string; title: string; description: string; hour: number; end_hour: number; color: string; event_date: string };

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const EVENT_COLORS = ['#2563EB', '#0284C7', '#6366F1', '#0D9488', '#F59E0B', '#EF4444'];
const HABIT_COLORS = ['#2563EB', '#38BDF8', '#10B981', '#6366F1', '#F59E0B', '#EF4444'];
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
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [habits,  setHabits]  = useState<Habit[]>([]);
  const [logs,    setLogs]    = useState<HabitLog[]>([]);
  const [allEvs,  setAllEvs]  = useState<PEvent[]>([]);

  const [view,    setView]    = useState<View>('day');
  const [dayOff,  setDayOff]  = useState(0);   // day view: days from today
  const [weekOff, setWeekOff] = useState(0);   // week view: weeks from current week
  const [monOff,  setMonOff]  = useState(0);   // month view: months from current month

  const [showEF, setShowEF] = useState(false);
  const [newEv, setNewEv]   = useState({ title: '', desc: '', hour: 9, end: 10, color: '#2563EB', date: todayStr() });

  const [showHF, setShowHF] = useState(false);
  const [newH,  setNewH]    = useState({ name: '', color: '#2563EB' });
  const [newTask, setNewTask] = useState('');

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
  async function loadHabitsAndTasks() {
    const [tr, hr, lr] = await Promise.all([
      supabase.from('entries').select('id, title, completed').order('created_at', { ascending: false }),
      supabase.from('habits').select('id, name, color').order('created_at'),
      supabase.from('habit_logs').select('habit_id, logged_date'),
    ]);
    if (tr.data) setTasks(tr.data as Task[]);
    if (hr.data) setHabits(hr.data);
    if (lr.data) setLogs(lr.data);
  }

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

  useEffect(() => { loadHabitsAndTasks(); }, []);
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

  // ── task CRUD ──
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    const { data } = await supabase.from('entries').insert({ title: newTask.trim() }).select().single();
    if (data) { setTasks(t => [{ id: data.id, title: data.title, completed: false }, ...t]); setNewTask(''); }
  }

  async function toggleTask(id: string, completed: boolean) {
    await supabase.from('entries').update({ completed: !completed }).eq('id', id);
    setTasks(ts => ts.map(t => t.id === id ? { ...t, completed: !completed } : t));
  }

  // ── habit CRUD ──
  async function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!newH.name.trim()) return;
    const { data } = await supabase.from('habits').insert({ name: newH.name.trim(), color: newH.color }).select().single();
    if (data) { setHabits(h => [...h, data]); setNewH({ name: '', color: '#2563EB' }); setShowHF(false); }
  }

  async function deleteHabit(id: string) {
    await supabase.from('habits').delete().eq('id', id);
    setHabits(h => h.filter(x => x.id !== id));
    setLogs(l => l.filter(x => x.habit_id !== id));
  }

  async function toggleLog(habitId: string) {
    const td = todayStr();
    const exists = logs.find(l => l.habit_id === habitId && l.logged_date === td);
    if (exists) {
      await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('logged_date', td);
      setLogs(l => l.filter(x => !(x.habit_id === habitId && x.logged_date === td)));
    } else {
      const { data } = await supabase.from('habit_logs').insert({ habit_id: habitId, logged_date: td }).select().single();
      if (data) setLogs(l => [...l, data]);
    }
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

  const done = tasks.filter(t => t.completed).length;
  const pct  = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  // last 7 days for habit dots
  const last7 = Array.from({ length: 7 }, (_, i) => toStr(addDays(today, i - 6)));

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

      {/* ── RIGHT ── */}
      <div className="planner-right">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Список задач</span>
            <span className="panel-count">{tasks.length} задач</span>
          </div>
          <div className="prog-bar-wrap">
            <div className="prog-bar-track"><div className="prog-bar-fill" style={{ width: `${pct}%` }} /></div>
            <span className="prog-pct">{pct}%</span>
          </div>
          <form onSubmit={addTask} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input className="planner-input" style={{ flex: 1, width: 'auto' }} placeholder="Новая задача…"
              value={newTask} onChange={e => setNewTask(e.target.value)} />
            <button type="submit" className="add-task-btn" style={{ padding: '7px 10px' }}>+</button>
          </form>
          <div className="check-list">
            {tasks.length === 0 && <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>Задач нет. Добавь первую!</p>}
            {tasks.map(t => (
              <div key={t.id} className={`check-row${t.completed ? ' done' : ''}`} onClick={() => toggleTask(t.id, t.completed)}>
                <div className={`chk${t.completed ? ' chk-done' : ''}`}>
                  {t.completed && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>}
                </div>
                <span className="check-label">{t.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Привычки</span>
            <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600 }}
              onClick={() => setShowHF(v => !v)}>+ Добавить</button>
          </div>
          {showHF && (
            <form onSubmit={addHabit} style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <input className="planner-input" style={{ flex: 1, minWidth: 0 }} placeholder="Название привычки"
                value={newH.name} onChange={e => setNewH(v => ({ ...v, name: e.target.value }))} />
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {HABIT_COLORS.map(c => (
                  <button key={c} type="button"
                    style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newH.color === c ? '3px solid #1E293B' : '2px solid transparent', padding: 0, cursor: 'pointer' }}
                    onClick={() => setNewH(v => ({ ...v, color: c }))} />
                ))}
              </div>
              <button type="submit" className="add-task-btn" style={{ padding: '7px 12px' }}>Сохранить</button>
            </form>
          )}
          {habits.length === 0 && !showHF && (
            <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>Привычек нет. Нажми «+ Добавить»!</p>
          )}
          {habits.map(h => {
            const todayLogged = logs.some(l => l.habit_id === h.id && l.logged_date === todayStr());
            const streak = logs.filter(l => l.habit_id === h.id).length;
            return (
              <div key={h.id} className="habit-row">
                <div className="habit-dot-icon" style={{ background: h.color + '20', color: h.color }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div className="habit-body">
                  <div className="habit-name">{h.name}</div>
                  <div className="habit-dots">
                    {last7.map(d => (
                      <div key={d} className="hdot" style={{ background: logs.some(l => l.habit_id === h.id && l.logged_date === d) ? h.color : '#E2E8F0' }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="habit-streak">{streak} дн.</span>
                  <button onClick={() => toggleLog(h.id)}
                    style={{ fontSize: 11, padding: '3px 7px', background: todayLogged ? h.color : 'transparent', color: todayLogged ? '#fff' : h.color, border: `1px solid ${h.color}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                    {todayLogged ? '✓' : '+'}
                  </button>
                  <button onClick={() => deleteHabit(h.id)}
                    style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                    удалить
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="quote-card">
          <div className="quote-mark">"</div>
          <p>План — это мечта с дедлайном.</p>
          <span>— Наполеон Хилл</span>
        </div>
      </div>
    </div>
  );
}
