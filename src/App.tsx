import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { applyTheme, type ThemeKey } from './lib/themes';
import { Auth } from './components/Auth';
import { Entries } from './components/Entries';
import { Planner } from './components/Planner';
import { TimerPage } from './components/TimerPage';
import { ProgressPage } from './components/ProgressPage';
import { AIPage } from './components/AIPage';
import { FlashCards } from './components/FlashCards';
import { NotesPage } from './components/NotesPage';
import { SettingsPage } from './components/SettingsPage';

const NAV = [
  { label: 'Главная', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { label: 'Планировщик', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { label: 'Таймер', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M7 3A2 2 0 0110 1"/><path d="M14 1A2 2 0 0117 3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg> },
  { label: 'Прогресс', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { label: 'ИИ-помощник', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> },
  { label: 'Флеш-карты', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> },
  { label: 'Заметки', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('Главная');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState(() => localStorage.getItem('planify_avatar_color') || '#2563EB');
  const [avatarImg, setAvatarImg] = useState<string | null>(() => localStorage.getItem('planify_avatar_img'));
  const [theme, setTheme] = useState<ThemeKey>(() => {
    const saved = localStorage.getItem('planify_theme');
    return (saved as ThemeKey) || 'blue';
  });

  useEffect(() => { applyTheme(theme); }, [theme]);

  function handleThemeChange(t: ThemeKey) {
    setTheme(t);
    localStorage.setItem('planify_theme', t);
  }

  function handleAvatarColor(color: string) {
    setAvatarColor(color);
    localStorage.setItem('planify_avatar_color', color);
  }

  function handleAvatarImg(img: string | null) {
    setAvatarImg(img);
    if (img) localStorage.setItem('planify_avatar_img', img);
    else localStorage.removeItem('planify_avatar_img');
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        const e = data.session.user.email || '';
        setDisplayName(data.session.user.user_metadata?.full_name || e.split('@')[0] || '');
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        const e = s.user.email || '';
        setDisplayName(s.user.user_metadata?.full_name || e.split('@')[0] || '');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading">Загрузка…</div>;

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="13" r="8"/>
            <path d="M7 3A2 2 0 0110 1"/><path d="M14 1A2 2 0 0117 3"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/>
          </svg>
          PLANIFY
        </div>
        <Auth />
      </div>
    );
  }

  const email = session.user.email || '';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="app-layout">
      <aside className={`sidebar${sidebarOpen ? '' : ' sidebar-collapsed'}`}>

        {/* Logo row */}
        <div className={`sidebar-logo${sidebarOpen ? '' : ' sidebar-logo-collapsed'}`}>
          {sidebarOpen && (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="13" r="8"/>
                <path d="M7 3A2 2 0 0110 1"/><path d="M14 1A2 2 0 0117 3"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/>
              </svg>
              <span className="sidebar-logo-text">Planify</span>
            </>
          )}
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'Свернуть панель' : 'Развернуть панель'}
          >
            <span className="toggle-bar" />
            <span className="toggle-bar" />
            <span className="toggle-bar" />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(({ label, icon }) => (
            <button
              key={label}
              className={`nav-item${activeNav === label ? ' active' : ''}`}
              onClick={() => setActiveNav(label)}
              title={!sidebarOpen ? label : ''}
            >
              {icon}
              {sidebarOpen && <span className="nav-label">{label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="sidebar-bottom">
          {sidebarOpen ? (
            <>
              <div className="sidebar-user" onClick={() => setActiveNav('Настройки')} style={{ cursor: 'pointer' }} title="Настройки">
                <div className="user-avatar" style={{ background: avatarColor, color: 'white', overflow: 'hidden', padding: 0 }}>
                  {avatarImg ? <img src={avatarImg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar"/> : initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="user-name">{displayName}</div>
                  <div className="user-role">Студент</div>
                </div>
              </div>
              <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
                Выйти
              </button>
            </>
          ) : (
            <div className="user-avatar" style={{ margin: '0 auto', background: avatarColor, color: 'white', overflow: 'hidden', padding: 0 }} title={displayName}>
              {avatarImg ? <img src={avatarImg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar"/> : initials}
            </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        {activeNav === 'Планировщик' ? <Planner /> : activeNav === 'Таймер' ? <TimerPage /> : activeNav === 'Прогресс' ? <ProgressPage /> : activeNav === 'ИИ-помощник' ? <AIPage /> : activeNav === 'Флеш-карты' ? <FlashCards /> : activeNav === 'Заметки' ? <NotesPage /> : activeNav === 'Настройки' ? <SettingsPage displayName={displayName} email={email} onNameChange={setDisplayName} avatarColor={avatarColor} onAvatarColorChange={handleAvatarColor} avatarImg={avatarImg} onAvatarImgChange={handleAvatarImg} theme={theme} onThemeChange={handleThemeChange} /> : <Entries userEmail={displayName} />}
      </main>
    </div>
  );
}
