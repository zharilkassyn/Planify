import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Entry = { id: string; title: string; completed: boolean; created_at: string };

const COLORS = ['#2563EB', '#38BDF8', '#10B981', '#F59E0B', '#EF4444'];

export function Entries({ userEmail }: { userEmail: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('entries')
      .select('id, title, completed, created_at')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setEntries((data ?? []) as Entry[]);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0) { setRunning(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from('entries').insert({ title: title.trim() });
    if (error) setError(error.message);
    else { setTitle(''); load(); }
  }

  async function remove(id: string) {
    await supabase.from('entries').delete().eq('id', id);
    load();
  }

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const total = 25 * 60;
  const progress = (total - timeLeft) / total;
  const r = 54;
  const circ = 2 * Math.PI * r;

  const done = Math.floor(entries.length * 0.6);
  const pct = entries.length > 0 ? Math.round((done / entries.length) * 100) : 0;
  const rp = 40;
  const cp = 2 * Math.PI * rp;

  const firstName = userEmail.split(' ')[0];

  return (
    <>
      <div className="dash-header">
        <div className="dash-greeting">
          <h2>Привет, {firstName}! 👋</h2>
          <p>Готов продуктивно поработать сегодня?</p>
        </div>
        <button className="bell-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
        </button>
      </div>

      <div className="widgets-row">
        {/* Timer */}
        <div className="widget">
          <div className="widget-title">Таймер фокусировки</div>
          <div className="timer-circle">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r={r} fill="none" stroke="#DBEAFE" strokeWidth="8"/>
              <circle cx="65" cy="65" r={r} fill="none" stroke="#2563EB" strokeWidth="8"
                strokeDasharray={`${circ * progress} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 65 65)"
              />
            </svg>
            <div className="timer-text">{mins}:{secs}</div>
          </div>
          <button
            className={`timer-start${running ? ' running' : ''}`}
            onClick={() => {
              if (timeLeft === 0) { setTimeLeft(25 * 60); setRunning(true); }
              else setRunning(r => !r);
            }}
          >
            {running ? 'Стоп' : timeLeft === 0 ? 'Заново' : 'Начать'}
          </button>
        </div>

        {/* Schedule */}
        <div className="widget">
          <div className="widget-title">Мои задачи сегодня</div>
          {entries.length === 0 ? (
            <div className="schedule-empty">Задач нет. Добавь первую!</div>
          ) : (
            <div className="schedule-list">
              {entries.slice(0, 5).map((e, i) => (
                <div key={e.id} className="schedule-item">
                  <div className="schedule-dot" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="schedule-name">{e.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="widget">
          <div className="widget-title">Прогресс</div>
          <div className="progress-circle-wrap">
            <div className="progress-circle">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={rp} fill="none" stroke="#DBEAFE" strokeWidth="9"/>
                <circle cx="50" cy="50" r={rp} fill="none" stroke="#2563EB" strokeWidth="9"
                  strokeDasharray={`${cp * pct / 100} ${cp}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="progress-text">
                <span className="progress-pct">{pct}%</span>
                <span className="progress-label">Готово</span>
              </div>
            </div>
            <div className="progress-stats">
              <div className="stat-row"><span className="stat-key">Всего задач</span><span className="stat-val">{entries.length}</span></div>
              <div className="stat-row"><span className="stat-key">Выполнено</span><span className="stat-val">{done}</span></div>
              <div className="stat-row"><span className="stat-key">Осталось</span><span className="stat-val">{entries.length - done}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-row">
        {/* Task list */}
        <div className="widget">
          <div className="widget-title">Все задачи</div>
          <form onSubmit={add} className="add-task-form">
            <input
              placeholder="Добавить задачу…"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <button type="submit">+ Добавить</button>
          </form>
          {error && <p className="message">{error}</p>}
          <div className="task-list">
            {entries.map(e => (
              <div key={e.id} className="task-item">
                <div className="task-check" />
                <span>{e.title}</span>
                <button className="task-del" onClick={() => remove(e.id)}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="widget">
          <div className="widget-title">Быстрые действия</div>
          <div className="quick-actions">
            {[
              { name: 'Планировщик', desc: 'Планируй задачи', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { name: 'Таймер', desc: 'Фокус 25 минут', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg> },
              { name: 'Заметки', desc: 'Твои конспекты', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
              { name: 'Прогресс', desc: 'Смотри статистику', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
            ].map(a => (
              <button key={a.name} className="action-card">
                <div className="action-icon">{a.icon}</div>
                <div className="action-name">{a.name}</div>
                <div className="action-desc">{a.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
