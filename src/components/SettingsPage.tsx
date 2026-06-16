import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { THEMES, type ThemeKey } from '../lib/themes';

type Props = {
  displayName: string; email: string; onNameChange: (name: string) => void;
  avatarColor: string; onAvatarColorChange: (color: string) => void;
  avatarImg: string | null; onAvatarImgChange: (img: string | null) => void;
  theme: ThemeKey; onThemeChange: (t: ThemeKey) => void;
};

const AVATAR_COLORS = ['#2563EB','#0D9488','#6366F1','#F59E0B','#EF4444','#10B981','#7C3AED','#0284C7'];

export function SettingsPage({ displayName, email, onNameChange, avatarColor, onAvatarColorChange, avatarImg, onAvatarImgChange, theme, onThemeChange }: Props) {
  const [name, setName] = useState(displayName);
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onAvatarImgChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const initials = (name || email).charAt(0).toUpperCase();

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    onNameChange(name.trim());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function changePassword() {
    setPwError('');
    if (newPw.length < 6) { setPwError('Пароль должен быть не менее 6 символов'); return; }
    if (newPw !== confirmPw) { setPwError('Пароли не совпадают'); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    if (error) { setPwError(error.message); return; }
    setPwSaved(true);
    setNewPw(''); setConfirmPw('');
    setShowPwForm(false);
    setTimeout(() => setPwSaved(false), 3000);
  }

  return (
    <div className="settings-layout">

      {/* Header */}
      <div className="settings-header">
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Настройки</h2>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Управляй своим аккаунтом и профилем</p>
        </div>
        <button className="bell-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
        </button>
      </div>

      <div className="settings-body">

        {/* ── Профиль ── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Профиль
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>

            {/* Preview */}
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: 'white', flexShrink: 0, overflow: 'hidden', boxShadow: '0 4px 14px rgba(37,99,235,.25)' }}>
              {avatarImg
                ? <img src={avatarImg} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar"/>
                : initials}
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Цвет аватара</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Color circles */}
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => { onAvatarColorChange(c); onAvatarImgChange(null); }}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: c,
                      border: avatarColor === c && !avatarImg ? '3px solid #1E293B' : '3px solid transparent',
                      cursor: 'pointer', padding: 0, outline: 'none', flexShrink: 0,
                      transition: 'transform 0.15s, border-color 0.15s',
                      boxSizing: 'border-box',
                    }}/>
                ))}

                {/* Upload button */}
                <input type="file" accept="image/*" id="avatar-upload" style={{ display: 'none' }} onChange={handleFileUpload}/>
                <label htmlFor="avatar-upload" style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#EFF6FF', border: avatarImg ? '3px solid #2563EB' : '2px dashed #BFDBFE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box', transition: 'border-color 0.15s',
                }} title="Загрузить фото">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2">
                    <polyline points="16 16 12 12 8 16"/>
                    <line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                  </svg>
                </label>

              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>Нажми на круглую кнопку чтобы загрузить фото</div>
            </div>
          </div>

          {/* Name */}
          <div className="settings-field">
            <label className="settings-label">Имя</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="settings-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Введи своё имя" onKeyDown={e => e.key === 'Enter' && saveName()}/>
              <button className="fc-btn-primary" onClick={saveName} disabled={saving || !name.trim()}>
                {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="settings-field">
            <label className="settings-label">Почта</label>
            <input className="settings-input" value={email} disabled style={{ background: '#F8FAFC', color: '#94A3B8', cursor: 'not-allowed' }}/>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Почту изменить нельзя</div>
          </div>
        </div>

        {/* ── Тема ── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a10 10 0 010 20"/>
              <path d="M12 2v20M2 12h20"/>
            </svg>
            Тема оформления
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, t]) => (
              <button key={key} onClick={() => onThemeChange(key)}
                style={{
                  border: theme === key ? `2px solid ${t.primary}` : '2px solid #E2E8F0',
                  borderRadius: 12, padding: '12px 10px', background: theme === key ? t.vars['--primary-light'] : 'white',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}>
                {/* Mini preview */}
                <div style={{ width: 48, height: 36, borderRadius: 8, background: t.vars['--bg'], border: '1px solid #E2E8F0', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, background: t.vars['--card'], borderRight: `1px solid ${t.vars['--border']}` }}/>
                  <div style={{ position: 'absolute', left: 16, top: 5, right: 3, height: 5, borderRadius: 3, background: t.primary }}/>
                  <div style={{ position: 'absolute', left: 16, top: 13, right: 3, height: 3, borderRadius: 3, background: t.vars['--primary-mid'] }}/>
                  <div style={{ position: 'absolute', left: 16, top: 19, right: 3, height: 3, borderRadius: 3, background: t.vars['--primary-mid'] }}/>
                  <div style={{ position: 'absolute', left: 3, top: 6, width: 8, height: 8, borderRadius: '50%', background: t.primary }}/>
                  <div style={{ position: 'absolute', left: 3, top: 18, width: 8, height: 3, borderRadius: 2, background: t.vars['--primary-mid'] }}/>
                  {key === 'dark' && <div style={{ position: 'absolute', inset: 0, background: t.vars['--bg'], opacity: 0.6 }}/>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme === key ? t.primary : '#64748B' }}>{t.name}</div>
                {theme === key && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.primary }}/>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Безопасность ── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Безопасность
          </div>

          {pwSaved && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#16A34A', marginBottom: 16 }}>
              Пароль успешно изменён
            </div>
          )}

          {!showPwForm ? (
            <button className="fc-btn-secondary" onClick={() => setShowPwForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Изменить пароль
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="settings-field" style={{ marginBottom: 0 }}>
                <label className="settings-label">Новый пароль</label>
                <div style={{ position: 'relative' }}>
                  <input className="settings-input" type={showNew ? 'text' : 'password'}
                    placeholder="Не менее 6 символов" value={newPw} onChange={e => setNewPw(e.target.value)}/>
                  <button onClick={() => setShowNew(v => !v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94A3B8' }}>
                    {showNew
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              <div className="settings-field" style={{ marginBottom: 0 }}>
                <label className="settings-label">Подтверди пароль</label>
                <div style={{ position: 'relative' }}>
                  <input className="settings-input" type={showConfirm ? 'text' : 'password'}
                    placeholder="Повтори новый пароль" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}/>
                  <button onClick={() => setShowConfirm(v => !v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94A3B8' }}>
                    {showConfirm
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
              {pwError && <div style={{ fontSize: 13, color: '#EF4444' }}>{pwError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fc-btn-secondary" onClick={() => { setShowPwForm(false); setNewPw(''); setConfirmPw(''); setPwError(''); }}>Отмена</button>
                <button className="fc-btn-primary" onClick={changePassword} disabled={pwSaving}>
                  {pwSaving ? 'Сохранение...' : 'Сохранить пароль'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── О приложении ── */}
        <div className="settings-card">
          <div className="settings-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            О приложении
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Приложение', value: 'Planify' },
              { label: 'Версия', value: '1.0.0' },
              { label: 'Описание', value: 'Умный планировщик для студентов' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: 14, color: '#64748B' }}>{row.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Выйти ── */}
        <div className="settings-card" style={{ border: '1px solid #FECACA' }}>
          <div className="settings-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span style={{ color: '#EF4444' }}>Выход</span>
          </div>
          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14 }}>После выхода нужно будет войти снова</p>
          <button onClick={() => supabase.auth.signOut()}
            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Выйти из аккаунта
          </button>
        </div>

      </div>
    </div>
  );
}
