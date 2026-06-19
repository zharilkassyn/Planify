import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatSecondsHMS, getTodayFocusSeconds, getWeekFocusHours, TIMER_STATS_EVENT } from '../lib/timerStats';

type Entry = { id: string; title: string; completed: boolean; created_at: string };

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function Entries({ userEmail, onNavigate }: { userEmail: string; onNavigate: (page: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [modalError, setModalError] = useState('');
  const [timeLeft] = useState(25 * 60);
  const [todayFocusSec, setTodayFocusSec] = useState(() => getTodayFocusSeconds());
  const [weekData, setWeekData] = useState(() => getWeekFocusHours());

  async function load() {
    const { data } = await supabase
      .from('entries')
      .select('id, title, completed, created_at')
      .order('created_at', { ascending: false });
    if (data) setEntries(data as Entry[]);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const updateFocusTime = () => {
      setTodayFocusSec(getTodayFocusSeconds());
      setWeekData(getWeekFocusHours());
    };
    window.addEventListener(TIMER_STATS_EVENT, updateFocusTime);
    window.addEventListener('storage', updateFocusTime);
    return () => {
      window.removeEventListener(TIMER_STATS_EVENT, updateFocusTime);
      window.removeEventListener('storage', updateFocusTime);
    };
  }, []);

  async function add() {
    const text = newTitle.trim();
    if (!text) { setModalError('Введи название задачи'); return; }
    setModalError('');
    const { error } = await supabase.from('entries').insert({ title: text, completed: false });
    if (error) { setModalError(error.message); return; }
    setNewTitle('');
    setShowModal(false);
    load();
  }

  async function remove(id: string) {
    await supabase.from('entries').delete().eq('id', id);
    load();
  }

  async function toggle(id: string, completed: boolean) {
    await supabase.from('entries').update({ completed: !completed }).eq('id', id);
    load();
  }

  function openModal() {
    setNewTitle('');
    setModalError('');
    setShowModal(true);
  }

  const total = 25 * 60;
  const progress = (total - timeLeft) / total;
  const r = 54;
  const circ = 2 * Math.PI * r;

  const done = entries.filter(e => e.completed).length;
  const pct = entries.length > 0 ? Math.round((done / entries.length) * 100) : 0;
  const rp = 40;
  const cp = 2 * Math.PI * rp;
  const chartH = 96;
  const chartW = 320;
  const weekFocusHours = weekData.reduce((sum, hours) => sum + hours, 0);
  const maxWeekHours = Math.max(...weekData, 0.5);
  const chartPoints = weekData.map((hours, index) => {
    const x = (index / 6) * (chartW - 28) + 18;
    const y = chartH - (hours / maxWeekHours) * (chartH - 18) - 8;
    return `${x},${y}`;
  }).join(' ');

  const firstName = userEmail.split(' ')[0];

  return (
    <>
      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Новая задача</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <label className="modal-label">Название</label>
            <input
              className="modal-input"
              placeholder="Например: Выучить главу 3…"
              value={newTitle}
              autoFocus
              onChange={ev => setNewTitle(ev.target.value)}
              onKeyDown={ev => { if (ev.key === 'Enter') add(); }}
            />

            {modalError && <p className="modal-error">{modalError}</p>}

            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="modal-btn-add" onClick={add}>
                + Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dash-header">
        <div className="dash-greeting">
          <h2>Привет, {firstName}! 👋</h2>
          <p>Готов продуктивно поработать сегодня?</p>
        </div>
      </div>

      <div className="widgets-row">
        {/* Timer */}
        <div className="widget" style={{ cursor: 'pointer' }} onClick={() => onNavigate('Таймер')}>
          <div className="widget-title">Таймер фокусировки</div>
          <div className="timer-circle">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r={r} fill="none" stroke="var(--primary)" strokeOpacity="0.15" strokeWidth="8"/>
              <circle cx="65" cy="65" r={r} fill="none" stroke="var(--primary)" strokeWidth="8"
                strokeDasharray={`${circ * progress} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 65 65)"
              />
            </svg>
            <div className="timer-text">25:00</div>
          </div>
          <div className="timer-start">Открыть таймер →</div>
        </div>

        {/* Statistics */}
        <div className="widget progress-wide-widget">
          <div className="dashboard-stats-head">
            <div className="widget-title">Статистика</div>
            <div className="dashboard-stats-head-gap" />
            <div className="dashboard-chart-head">
              <span>Фокус за неделю</span>
              {weekFocusHours > 0 && <strong>{weekFocusHours.toFixed(1)}ч</strong>}
            </div>
          </div>
          <div className="dashboard-stats-split">
            <div className="dashboard-stats-left">
              <div className="dashboard-task-summary">
                <div className="progress-circle">
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={rp} fill="none" stroke="var(--primary)" strokeOpacity="0.15" strokeWidth="9"/>
                    <circle cx="50" cy="50" r={rp} fill="none" stroke="var(--primary)" strokeWidth="9"
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
              <div className="dashboard-time-stat">
                <div className="dashboard-time-value">{formatSecondsHMS(todayFocusSec)}</div>
                <div className="dashboard-time-label">Потрачено сегодня</div>
              </div>
            </div>
            <div className="dashboard-stats-divider" />
            <div className="dashboard-stats-chart">
              <div className="dashboard-mini-chart">
                <svg width="100%" height={chartH + 26} viewBox={`0 0 ${chartW} ${chartH + 26}`}>
                  {[0, 0.5, 1].map(step => {
                    const y = chartH - step * (chartH - 18) - 8;
                    return <line key={step} x1="18" y1={y} x2={chartW - 10} y2={y} stroke="#E2E8F0" strokeWidth="1"/>;
                  })}
                  <polyline points={chartPoints} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
                  {weekData.map((hours, index) => {
                    const x = (index / 6) * (chartW - 28) + 18;
                    const y = chartH - (hours / maxWeekHours) * (chartH - 18) - 8;
                    return <circle key={DAY_LABELS[index]} cx={x} cy={y} r="4" fill="var(--primary)"/>;
                  })}
                  {DAY_LABELS.map((day, index) => {
                    const x = (index / 6) * (chartW - 28) + 18;
                    return <text key={day} x={x} y={chartH + 18} fontSize="10" fill="#94A3B8" textAnchor="middle">{day}</text>;
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bottom-row">
        {/* Task list */}
        <div className="widget">
          <div className="widget-header">
            <span className="widget-title" style={{ marginBottom: 0 }}>Все задачи</span>
            <button className="add-task-btn" onClick={openModal}>+ Добавить</button>
          </div>
          <div className="task-list" style={{ marginTop: 14 }}>
            {entries.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--soft)', textAlign: 'center', padding: '16px 0' }}>
                Нет задач. Нажми «+ Добавить»!
              </p>
            )}
            {entries.map(e => (
              <div key={e.id} className={`task-item${e.completed ? ' task-done' : ''}`}>
                <div
                  className={`task-check${e.completed ? ' task-check-done' : ''}`}
                  onClick={() => toggle(e.id, e.completed)}
                  style={{ cursor: 'pointer' }}
                >
                  {e.completed && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5">
                      <polyline points="1.5 6 4.5 9 10.5 3"/>
                    </svg>
                  )}
                </div>
                <span style={{ textDecoration: e.completed ? 'line-through' : 'none', opacity: e.completed ? 0.5 : 1, flex: 1 }}>
                  {e.title}
                </span>
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
              { name: 'Планировщик', desc: 'Планируй задачи', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { name: 'Таймер', desc: 'Фокус 25 минут', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg> },
              { name: 'Заметки', desc: 'Твои конспекты', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
            ].map(a => (
              <button key={a.name} className="action-card" onClick={() => onNavigate(a.name)}>
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
