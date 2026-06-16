import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Task  = { id: string; completed: boolean; created_at: string };
type Habit = { id: string; name: string; color: string };
type Log   = { habit_id: string; logged_date: string };
type Tab   = 'overview' | 'subjects' | 'weeks' | 'months';

const COLORS = ['#2563EB','#38BDF8','#10B981','#F59E0B','#EF4444','#6366F1'];
const DAY_LABELS  = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function toStr(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getMondayOf(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}
function monthKey(dateStr: string) { return dateStr.slice(0, 7); }
function weekKey(dateStr: string)  { return toStr(getMondayOf(new Date(dateStr))); }

const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
  <div className="prog-empty-chart">
    <div className="prog-empty-icon">{icon}</div>
    <div className="prog-empty-text">{text}</div>
  </div>
);

export function ProgressPage() {
  const [tab,    setTab]    = useState<Tab>('overview');
  const [tasks,  setTasks]  = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs,   setLogs]   = useState<Log[]>([]);

  const today     = new Date();
  const weekStart = addDays(today, -6);
  const last7     = Array.from({ length: 7 }, (_, i) => toStr(addDays(today, i - 6)));
  const weekLabel = `${weekStart.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})} – ${today.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}`;

  useEffect(() => {
    Promise.all([
      supabase.from('entries').select('id, completed, created_at').order('created_at'),
      supabase.from('habits').select('id, name, color').order('created_at'),
      supabase.from('habit_logs').select('habit_id, logged_date'),
    ]).then(([tr, hr, lr]) => {
      if (tr.data) setTasks(tr.data as Task[]);
      if (hr.data) setHabits(hr.data);
      if (lr.data) setLogs(lr.data);
    });
  }, []);

  /* ── derived ── */
  const total    = tasks.length;
  const done     = tasks.filter(t => t.completed).length;
  const inProg   = Math.max(0, total - done - Math.floor(total * 0.2));
  const remaining = total - done - inProg;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
  const maxStreak = habits.length > 0 ? Math.max(...habits.map(h => logs.filter(l => l.habit_id === h.id).length)) : 0;
  const habitRate = habits.length > 0 ? Math.round((logs.filter(l => l.logged_date === toStr(today)).length / habits.length) * 100) : 0;

  /* week counts */
  const weekCounts = last7.map(d => tasks.filter(t => t.completed && t.created_at.slice(0,10) === d).length);
  const maxCount   = Math.max(...weekCounts, 1);

  /* ── По неделям ── */
  const allWeekKeys = [...new Set([
    ...tasks.map(t => weekKey(t.created_at.slice(0,10))),
    ...logs.map(l => weekKey(l.logged_date)),
  ])].sort().reverse();

  const weekRows = allWeekKeys.map(wk => {
    const wEnd      = addDays(new Date(wk), 6);
    const wDates    = Array.from({ length: 7 }, (_, i) => toStr(addDays(new Date(wk), i)));
    const wTasks    = tasks.filter(t => t.created_at.slice(0,10) >= wk && t.created_at.slice(0,10) <= toStr(wEnd));
    const wDone     = wTasks.filter(t => t.completed).length;
    const wLogs     = logs.filter(l => l.logged_date >= wk && l.logged_date <= toStr(wEnd));
    const wHabitDays = [...new Set(wLogs.map(l => l.logged_date))].length;
    const label     = `${new Date(wk).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} – ${wEnd.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`;
    return { wk, label, wDates, total: wTasks.length, done: wDone, habitDays: wHabitDays };
  });

  /* ── По месяцам ── */
  const allMonthKeys = [...new Set([
    ...tasks.map(t => monthKey(t.created_at.slice(0,10))),
    ...logs.map(l => monthKey(l.logged_date)),
  ])].sort().reverse();

  const monthRows = allMonthKeys.map(mk => {
    const [y, m]    = mk.split('-').map(Number);
    const mDays     = new Date(y, m, 0).getDate();
    const mStart    = `${mk}-01`;
    const mEnd      = `${mk}-${String(mDays).padStart(2,'0')}`;
    const mTasks    = tasks.filter(t => t.created_at.slice(0,7) === mk);
    const mDone     = mTasks.filter(t => t.completed).length;
    const mLogs     = logs.filter(l => l.logged_date >= mStart && l.logged_date <= mEnd);
    const mLogDays  = [...new Set(mLogs.map(l => l.logged_date))].length;
    const mHabitPct = habits.length > 0 ? Math.round((mLogDays / (habits.length * mDays)) * 100) : 0;
    return { mk, label: `${MONTH_NAMES[m-1]} ${y}`, total: mTasks.length, done: mDone, habitPct: mHabitPct };
  });

  /* ── доnut ── */
  const R = 60; const C = 2 * Math.PI * R;
  const donePct   = total > 0 ? done / total : 0;
  const inProgPct = total > 0 ? inProg / total : 0;

  const achievements = [
    { icon:'🎯', title:'Первый шаг',          desc:'Добавь первую задачу',              unlocked: total >= 1 },
    { icon:'✅', title:'Решатель задач',       desc:'Выполни 5 задач',                  unlocked: done >= 5 },
    { icon:'🔥', title:'На волне',             desc:'Выполни 10 задач',                 unlocked: done >= 10 },
    { icon:'📅', title:'Привычка',             desc:'Создай первую привычку',           unlocked: habits.length >= 1 },
    { icon:'⚡', title:'Неделя продуктивности',desc:'Отметь привычку 7 дней подряд',   unlocked: maxStreak >= 7 },
    { icon:'🏆', title:'Мастер фокуса',        desc:'Выполни 25 задач',                 unlocked: done >= 25 },
  ];
  const unlocked = achievements.filter(a => a.unlocked);
  const isEmpty  = total === 0 && habits.length === 0;

  /* ── header shared ── */
  const Header = () => (
    <>
      <div className="dash-header" style={{ marginBottom: 20, gridColumn: '1 / -1' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700 }}>Прогресс</h2>
      </div>
      <div className="prog-controls" style={{ gridColumn: '1 / -1' }}>
        <div className="view-tabs">
          {([['overview','Обзор'],['subjects','По предметам'],['weeks','По неделям'],['months','По месяцам']] as [Tab,string][]).map(([v,l]) => (
            <button key={v} className={`view-tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div className="date-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {weekLabel}
          </div>
        </div>
      </div>
    </>
  );

  /* ══ TAB: По предметам ══ */
  if (tab === 'subjects') {
    return (
      <div className="progress-layout">
        <Header />
        <div className="prog-main" style={{ gridColumn: '1 / -1' }}>
          {habits.length === 0 ? (
            <div className="panel" style={{ padding: 32 }}>
              <EmptyState icon="📚" text="Предметов нет. Добавь привычки в Планировщике — они станут твоими предметами для отслеживания." />
            </div>
          ) : (
            <>
              {/* Subject cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:16 }}>
                {habits.map((h, i) => {
                  const hLogs    = logs.filter(l => l.habit_id === h.id);
                  const streak   = hLogs.length;
                  const todayDone = hLogs.some(l => l.logged_date === toStr(today));
                  const weekDone  = last7.filter(d => hLogs.some(l => l.logged_date === d)).length;
                  const pctVal    = Math.min(100, Math.round((streak / 30) * 100));
                  const col       = COLORS[i % COLORS.length];
                  return (
                    <div key={h.id} className="panel" style={{ padding:20 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                        <div style={{ width:40, height:40, borderRadius:12, background: col+'20', color: col, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📖</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15 }}>{h.name}</div>
                          <div style={{ fontSize:12, color:'#94A3B8' }}>{streak} дней всего</div>
                        </div>
                        {todayDone && <span style={{ marginLeft:'auto', fontSize:11, background: col+'20', color: col, padding:'3px 8px', borderRadius:99, fontWeight:600 }}>Сегодня ✓</span>}
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748B', marginBottom:4 }}>
                          <span>Прогресс (30 дней)</span>
                          <span style={{ fontWeight:700, color: col }}>{pctVal}%</span>
                        </div>
                        <div className="prog-bar-track">
                          <div className="prog-bar-fill" style={{ width:`${pctVal}%`, background: col }}/>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:4 }}>
                        {last7.map(d => {
                          const active = hLogs.some(l => l.logged_date === d);
                          return <div key={d} style={{ flex:1, height:28, borderRadius:6, background: active ? col : '#F1F5F9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color: active ? '#fff' : '#94A3B8' }}>
                            {new Date(d).toLocaleDateString('ru-RU',{weekday:'narrow'})}
                          </div>;
                        })}
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:12, fontSize:12 }}>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color: col }}>{weekDone}/7</div>
                          <div style={{ color:'#94A3B8' }}>Эта неделя</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color: col }}>{streak}</div>
                          <div style={{ color:'#94A3B8' }}>Всего дней</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color: col }}>{pctVal}%</div>
                          <div style={{ color:'#94A3B8' }}>Рейтинг</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary table */}
              <div className="panel" style={{ padding:20 }}>
                <div className="panel-title" style={{ marginBottom:16 }}>Сводная таблица</div>
                <table className="prog-table">
                  <thead>
                    <tr>
                      <th>Предмет / Привычка</th>
                      <th>Прогресс</th>
                      <th>Эта неделя</th>
                      <th>Всего дней</th>
                      <th>Сегодня</th>
                    </tr>
                  </thead>
                  <tbody>
                    {habits.map((h, i) => {
                      const hLogs = logs.filter(l => l.habit_id === h.id);
                      const streak = hLogs.length;
                      const weekDone = last7.filter(d => hLogs.some(l => l.logged_date === d)).length;
                      const todayDone = hLogs.some(l => l.logged_date === toStr(today));
                      const pctVal = Math.min(100, Math.round((streak / 30) * 100));
                      const col = COLORS[i % COLORS.length];
                      return (
                        <tr key={h.id}>
                          <td><div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:10, height:10, borderRadius:'50%', background: col }}/>
                            {h.name}
                          </div></td>
                          <td style={{ minWidth:140 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div className="prog-bar-track" style={{ flex:1 }}>
                                <div className="prog-bar-fill" style={{ width:`${pctVal}%`, background: col }}/>
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color: col }}>{pctVal}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign:'center', fontWeight:600 }}>{weekDone}/7</td>
                          <td style={{ textAlign:'center', fontWeight:600 }}>{streak}</td>
                          <td style={{ textAlign:'center' }}>
                            {todayDone ? <span style={{ color:'#10B981', fontWeight:700 }}>✓</span> : <span style={{ color:'#CBD5E1' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══ TAB: По неделям ══ */
  if (tab === 'weeks') {
    return (
      <div className="progress-layout">
        <Header />
        <div className="prog-main" style={{ gridColumn: '1 / -1' }}>
          {weekRows.length === 0 ? (
            <div className="panel" style={{ padding:32 }}>
              <EmptyState icon="📅" text="Данных пока нет. Добавляй задачи и отмечай привычки — здесь появится статистика по неделям." />
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {weekRows.map(w => {
                const wpct = w.total > 0 ? Math.round((w.done / w.total) * 100) : 0;
                return (
                  <div key={w.wk} className="panel" style={{ padding:20 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:15 }}>{w.label}</div>
                        <div style={{ fontSize:12, color:'#94A3B8', marginTop:2 }}>
                          {w.total === 0 ? 'Нет данных' : `${w.done} из ${w.total} задач выполнено`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:12 }}>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:20, fontWeight:700, color:'#2563EB' }}>{w.done}</div>
                          <div style={{ fontSize:11, color:'#94A3B8' }}>Задач</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:20, fontWeight:700, color:'#10B981' }}>{w.habitDays}</div>
                          <div style={{ fontSize:11, color:'#94A3B8' }}>Привычек</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:20, fontWeight:700, color: wpct >= 70 ? '#10B981' : wpct >= 40 ? '#F59E0B' : '#EF4444' }}>{wpct}%</div>
                          <div style={{ fontSize:11, color:'#94A3B8' }}>Прогресс</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
                      {w.wDates.map((d, i) => {
                        const dayTasks  = tasks.filter(t => t.completed && t.created_at.slice(0,10) === d).length;
                        const dayHabits = logs.filter(l => l.logged_date === d).length;
                        const hasData   = dayTasks > 0 || dayHabits > 0;
                        const isToday   = d === toStr(today);
                        return (
                          <div key={d} style={{
                            background: hasData ? '#EFF6FF' : '#F8FAFF',
                            border: isToday ? '2px solid #2563EB' : '1px solid #E2E8F0',
                            borderRadius:10, padding:'8px 4px', textAlign:'center'
                          }}>
                            <div style={{ fontSize:10, color:'#94A3B8', marginBottom:4 }}>{DAY_LABELS[i]}</div>
                            <div style={{ fontSize:13, fontWeight:700, color: hasData ? '#2563EB' : '#CBD5E1' }}>
                              {new Date(d).getDate()}
                            </div>
                            {dayTasks > 0 && <div style={{ fontSize:10, color:'#2563EB', marginTop:2 }}>📋 {dayTasks}</div>}
                            {dayHabits > 0 && <div style={{ fontSize:10, color:'#10B981', marginTop:1 }}>✓ {dayHabits}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══ TAB: По месяцам ══ */
  if (tab === 'months') {
    return (
      <div className="progress-layout">
        <Header />
        <div className="prog-main" style={{ gridColumn: '1 / -1' }}>
          {monthRows.length === 0 ? (
            <div className="panel" style={{ padding:32 }}>
              <EmptyState icon="🗓️" text="Данных пока нет. Добавляй задачи и отмечай привычки — здесь появится статистика по месяцам." />
            </div>
          ) : (
            <>
              {/* Month cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:14 }}>
                {monthRows.map((m) => {
                  const mpct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                  const col  = mpct >= 70 ? '#10B981' : mpct >= 40 ? '#F59E0B' : '#2563EB';
                  return (
                    <div key={m.mk} className="panel" style={{ padding:18 }}>
                      <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>{m.label}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748B', marginBottom:4 }}>
                            <span>Задачи</span><span style={{ fontWeight:700, color: col }}>{mpct}%</span>
                          </div>
                          <div className="prog-bar-track">
                            <div className="prog-bar-fill" style={{ width:`${mpct}%`, background: col }}/>
                          </div>
                        </div>
                        <div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748B', marginBottom:4 }}>
                            <span>Привычки</span><span style={{ fontWeight:700, color:'#6366F1' }}>{m.habitPct}%</span>
                          </div>
                          <div className="prog-bar-track">
                            <div className="prog-bar-fill" style={{ width:`${m.habitPct}%`, background:'#6366F1' }}/>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:12 }}>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:'#2563EB' }}>{m.done}/{m.total}</div>
                          <div style={{ fontSize:11, color:'#94A3B8' }}>Задач</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:'#6366F1' }}>{m.habitPct}%</div>
                          <div style={{ fontSize:11, color:'#94A3B8' }}>Привычки</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary table */}
              <div className="panel" style={{ padding:20 }}>
                <div className="panel-title" style={{ marginBottom:16 }}>Сводная таблица по месяцам</div>
                <table className="prog-table">
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th>Всего задач</th>
                      <th>Выполнено</th>
                      <th>Прогресс</th>
                      <th>Привычки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map(m => {
                      const mpct = m.total > 0 ? Math.round((m.done/m.total)*100) : 0;
                      const col  = mpct >= 70 ? '#10B981' : mpct >= 40 ? '#F59E0B' : '#2563EB';
                      return (
                        <tr key={m.mk}>
                          <td style={{ fontWeight:600 }}>{m.label}</td>
                          <td style={{ textAlign:'center' }}>{m.total}</td>
                          <td style={{ textAlign:'center', fontWeight:600, color:'#10B981' }}>{m.done}</td>
                          <td style={{ minWidth:140 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div className="prog-bar-track" style={{ flex:1 }}>
                                <div className="prog-bar-fill" style={{ width:`${mpct}%`, background: col }}/>
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color: col }}>{mpct}%</span>
                            </div>
                          </td>
                          <td style={{ textAlign:'center' }}>
                            <span style={{ fontSize:12, fontWeight:700, color:'#6366F1' }}>{m.habitPct}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══ TAB: Обзор (default) ══ */
  return (
    <div className="progress-layout">
      <Header />

      <div className="prog-main">
        <div className="prog-stats-row">
          {[
            { icon:'📋', label:'Всего задач',      val: total > 0 ? String(total) : '—',         sub: total > 0 ? `${done} выполнено` : 'Добавь первую задачу' },
            { icon:'✅', label:'Выполнено задач',   val: done > 0  ? String(done)  : '—',         sub: done > 0  ? `${pct}% от всех`  : 'Выполни первую задачу' },
            { icon:'🔥', label:'Привычек сегодня',  val: habits.length > 0 ? `${habitRate}%` : '—', sub: habits.length > 0 ? `${logs.filter(l=>l.logged_date===toStr(today)).length}/${habits.length}` : 'Добавь привычки' },
            { icon:'📅', label:'Активных привычек', val: habits.length > 0 ? String(habits.length) : '—', sub: maxStreak > 0 ? `Рекорд: ${maxStreak} дн.` : 'Создай привычку' },
          ].map(s => (
            <div key={s.label} className="prog-stat-card">
              <div className="prog-stat-icon">{s.icon}</div>
              <div className="prog-stat-val">{s.val}</div>
              <div className="prog-stat-label">{s.label}</div>
              <div className="prog-stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="panel" style={{ padding:20 }}>
          <div className="panel-header" style={{ marginBottom:16 }}>
            <span className="panel-title">Задачи по дням (эта неделя)</span>
          </div>
          {isEmpty ? (
            <EmptyState icon="📈" text="Начни добавлять задачи — здесь появится динамика твоего прогресса"/>
          ) : (
            <svg width="100%" height="140" viewBox="0 0 400 140" preserveAspectRatio="none">
              {[0,2,4,6].map(v => {
                const y = 110 - (v/maxCount)*100;
                return <line key={v} x1="30" y1={y} x2="390" y2={y} stroke="#E2E8F0" strokeWidth="1"/>;
              })}
              <defs>
                <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15"/>
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <polygon points={['30,110',...weekCounts.map((c,i)=>`${30+(i/6)*360},${110-(c/maxCount)*100}`),'390,110'].join(' ')} fill="url(#aG)"/>
              <polyline points={weekCounts.map((c,i)=>`${30+(i/6)*360},${110-(c/maxCount)*100}`).join(' ')} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinejoin="round"/>
              {weekCounts.map((c,i) => <circle key={i} cx={30+(i/6)*360} cy={110-(c/maxCount)*100} r="5" fill="#2563EB"/>)}
              {DAY_LABELS.map((d,i) => <text key={i} x={30+(i/6)*360} y="132" fontSize="11" fill="#94A3B8" textAnchor="middle">{d}</text>)}
              {[0,2,4,6].map(v => <text key={v} x="24" y={113-(v/maxCount)*100} fontSize="10" fill="#94A3B8" textAnchor="end">{v}</text>)}
            </svg>
          )}
        </div>

        <div className="panel" style={{ padding:20 }}>
          <div className="panel-header" style={{ marginBottom:16 }}>
            <span className="panel-title">Прогресс привычек</span>
          </div>
          {habits.length === 0 ? (
            <EmptyState icon="🌱" text="Привычек нет. Добавь их в Планировщике!"/>
          ) : (
            <table className="prog-table">
              <thead><tr><th>Привычка</th><th>Прогресс</th><th>Дней</th><th>Сегодня</th></tr></thead>
              <tbody>
                {habits.map((h, i) => {
                  const hLogs = logs.filter(l => l.habit_id === h.id);
                  const streak = hLogs.length;
                  const hToday = hLogs.some(l => l.logged_date === toStr(today));
                  const pctVal = Math.min(100, Math.round((streak / 30) * 100));
                  const col    = COLORS[i % COLORS.length];
                  return (
                    <tr key={h.id}>
                      <td><div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background: col }}/>
                        {h.name}
                      </div></td>
                      <td><div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="prog-bar-track" style={{ flex:1 }}>
                          <div className="prog-bar-fill" style={{ width:`${pctVal}%`, background: col }}/>
                        </div>
                        <span style={{ fontSize:13, fontWeight:600, color: col, minWidth:34 }}>{pctVal}%</span>
                      </div></td>
                      <td style={{ textAlign:'center', fontWeight:600 }}>{streak}</td>
                      <td style={{ textAlign:'center' }}>
                        {hToday ? <span style={{ color:'#10B981', fontWeight:700 }}>✓</span> : <span style={{ color:'#CBD5E1' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="prog-right">
        <div className="panel" style={{ padding:20 }}>
          <div className="panel-title" style={{ marginBottom:16 }}>Выполнение задач</div>
          {total === 0 ? (
            <EmptyState icon="📋" text="Задач нет. Добавь их в Планировщике!"/>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ position:'relative', width:130, height:130, flexShrink:0 }}>
                <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="65" cy="65" r={R} fill="none" stroke="#E2E8F0" strokeWidth="10"/>
                  <circle cx="65" cy="65" r={R} fill="none" stroke="#2563EB" strokeWidth="10"
                    strokeDasharray={`${C*donePct} ${C}`} strokeLinecap="round"/>
                  <circle cx="65" cy="65" r={R} fill="none" stroke="#DBEAFE" strokeWidth="10"
                    strokeDasharray={`${C*inProgPct} ${C}`} strokeDashoffset={-(C*donePct)} strokeLinecap="round"/>
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:22, fontWeight:700 }}>{pct}%</span>
                  <span style={{ fontSize:10, color:'#94A3B8' }}>Выполнено</span>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { color:'#2563EB', label:'Выполнено', val: done },
                  { color:'#DBEAFE', label:'В процессе', val: inProg },
                  { color:'#E2E8F0', label:'Осталось',   val: remaining },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:s.color, border:'1px solid #E2E8F0', flexShrink:0 }}/>
                    <span style={{ fontSize:13, color:'#64748B', flex:1 }}>{s.label}</span>
                    <span style={{ fontSize:13, fontWeight:700 }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ padding:20 }}>
          <div className="panel-title" style={{ marginBottom:12 }}>Привычки за неделю</div>
          {habits.length === 0 ? (
            <EmptyState icon="🌿" text="Добавь привычки чтобы отслеживать их"/>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr repeat(7,18px)', gap:4, marginBottom:4 }}>
                <div/>
                {DAY_LABELS.map(d => <div key={d} style={{ fontSize:10, color:'#94A3B8', textAlign:'center' }}>{d}</div>)}
              </div>
              {habits.slice(0,5).map((h,i) => (
                <div key={h.id} style={{ display:'grid', gridTemplateColumns:'1fr repeat(7,18px)', gap:4, alignItems:'center' }}>
                  <div style={{ fontSize:12, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>
                  {last7.map(d => (
                    <div key={d} style={{ width:16, height:16, borderRadius:4, background: logs.some(l=>l.habit_id===h.id&&l.logged_date===d) ? COLORS[i%COLORS.length] : '#E2E8F0' }}/>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding:20 }}>
          <div className="panel-header" style={{ marginBottom:12 }}>
            <span className="panel-title">Достижения</span>
            <span style={{ fontSize:12, color:'#94A3B8' }}>{unlocked.length}/{achievements.length}</span>
          </div>
          {unlocked.length === 0 ? (
            <EmptyState icon="🏆" text="Выполняй задачи и веди привычки — здесь появятся достижения!"/>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {achievements.map(a => (
                <div key={a.title} className={`achievement-row${a.unlocked ? '' : ' locked'}`}>
                  <div className="ach-icon" style={{ opacity: a.unlocked ? 1 : 0.3 }}>{a.icon}</div>
                  <div style={{ flex:1 }}>
                    <div className="ach-title">{a.title}</div>
                    <div className="ach-desc">{a.desc}</div>
                  </div>
                  {a.unlocked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
