import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type Folder = { id: string; name: string; color: string; created_at: string };
type Note = {
  id: string; title: string; content: string;
  folder_id: string | null; tags: string[];
  is_starred: boolean; created_at: string; updated_at: string;
};

const FOLDER_COLORS = ['#2563EB','#0D9488','#6366F1','#F59E0B','#EF4444','#10B981','#0284C7','#7C3AED'];

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function preview(content: string) {
  return content.replace(/^#+\s/gm, '').replace(/\*\*/g, '').replace(/`/g, '').trim().slice(0, 90) || 'Нет содержимого';
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderNoteContent(content: string) {
  const lines = content.split('\n');
  return lines.map((line, index) => {
    const clean = line.trim();
    if (!clean) return <div key={index} className="ne-note-space" />;
    if (clean.startsWith('### ')) return <h4 key={index}>{renderInline(clean.slice(4))}</h4>;
    if (clean.startsWith('## ')) return <h3 key={index}>{renderInline(clean.slice(3))}</h3>;
    if (clean.startsWith('# ')) return <h2 key={index}>{renderInline(clean.slice(2))}</h2>;
    if (clean.startsWith('- ')) return <p key={index} className="ne-note-bullet">{renderInline(clean.slice(2))}</p>;
    if (clean.startsWith('> ')) return <blockquote key={index}>{renderInline(clean.slice(2))}</blockquote>;
    return <p key={index}>{renderInline(clean)}</p>;
  });
}

export function NotesPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folderId, setFolderId] = useState<string | 'all' | 'starred'>('all');
  const [selected, setSelected] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editStarred, setEditStarred] = useState(false);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [editingContent, setEditingContent] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: fd }, { data: nd }] = await Promise.all([
      supabase.from('note_folders').select('*').order('created_at'),
      supabase.from('notes').select('*').order('updated_at', { ascending: false }),
    ]);
    setFolders(fd ?? []);
    setNotes(nd ?? []);
    setLoading(false);
  }

  const filtered = notes.filter(n => {
    if (folderId === 'starred') return n.is_starred;
    if (folderId === 'all') return true;
    return n.folder_id === folderId;
  });

  function groupByDate(list: Note[]) {
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    const groups: { label: string; items: Note[] }[] = [];
    const t = list.filter(n => new Date(n.updated_at).toDateString() === today);
    const y = list.filter(n => new Date(n.updated_at).toDateString() === yest);
    const o = list.filter(n => { const d = new Date(n.updated_at).toDateString(); return d !== today && d !== yest; });
    if (t.length) groups.push({ label: 'Сегодня', items: t });
    if (y.length) groups.push({ label: 'Вчера', items: y });
    if (o.length) groups.push({ label: 'Раньше', items: o });
    return groups;
  }

  async function createNote() {
    const { data, error } = await supabase.from('notes').insert({
      title: 'Новая заметка', content: '',
      folder_id: folderId !== 'all' && folderId !== 'starred' ? folderId : null,
      tags: [], is_starred: false,
    }).select().single();
    if (!error && data) { setNotes(prev => [data, ...prev]); openNote(data); }
  }

  function openNote(note: Note) {
    setSelected(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditTags(note.tags);
    setEditStarred(note.is_starred);
    setEditingContent(false);
  }

  const autoSave = useCallback((note: Note, title: string, content: string, tags: string[], starred: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const upd = { title, content, tags, is_starred: starred, updated_at: new Date().toISOString() };
      await supabase.from('notes').update(upd).eq('id', note.id);
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...upd } : n));
      setSelected(prev => prev ? { ...prev, ...upd } : null);
      setSaving(false);
    }, 800);
  }, []);

  function onTitle(v: string) { setEditTitle(v); if (selected) autoSave(selected, v, editContent, editTags, editStarred); }
  function onContent(v: string) { setEditContent(v); if (selected) autoSave(selected, editTitle, v, editTags, editStarred); }

  async function toggleStar(note: Note, e?: React.MouseEvent) {
    e?.stopPropagation();
    const s = !note.is_starred;
    await supabase.from('notes').update({ is_starred: s }).eq('id', note.id);
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_starred: s } : n));
    if (selected?.id === note.id) { setSelected(p => p ? { ...p, is_starred: s } : null); setEditStarred(s); }
  }

  async function deleteNote(note: Note) {
    if (!confirm('Удалить заметку?')) return;
    await supabase.from('notes').delete().eq('id', note.id);
    setNotes(prev => prev.filter(n => n.id !== note.id));
    if (selected?.id === note.id) setSelected(null);
  }

  async function createFolder() {
    if (!folderName.trim()) return;
    const { data, error } = await supabase.from('note_folders').insert({ name: folderName.trim(), color: folderColor }).select().single();
    if (!error && data) { setFolders(prev => [...prev, data]); setShowNewFolder(false); setFolderName(''); setFolderColor(FOLDER_COLORS[0]); }
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || editTags.includes(tag)) { setTagInput(''); return; }
    const t = [...editTags, tag];
    setEditTags(t); setTagInput('');
    if (selected) autoSave(selected, editTitle, editContent, t, editStarred);
  }

  function removeTag(tag: string) {
    const t = editTags.filter(x => x !== tag);
    setEditTags(t);
    if (selected) autoSave(selected, editTitle, editContent, t, editStarred);
  }

  async function changeFolder(noteId: string, newFolderId: string | null) {
    await supabase.from('notes').update({ folder_id: newFolderId }).eq('id', noteId);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folder_id: newFolderId } : n));
    setSelected(prev => prev ? { ...prev, folder_id: newFolderId } : null);
  }

  const groups = groupByDate(filtered);

  const StarIcon = ({ filled }: { filled: boolean }) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? '#F59E0B' : 'none'} stroke={filled ? '#F59E0B' : '#CBD5E1'} strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );

  return (
    <div className="notes-layout">

      {/* ── Left sidebar ── */}
      <div className={`notes-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>

        <div className="notes-sidebar-top">
          {!sidebarCollapsed && <span className="ns-section-title">Папки</span>}
          <button className="notes-sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} title={sidebarCollapsed ? 'Открыть меню заметок' : 'Свернуть меню заметок'}>
            ☰
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
        <div className="ns-section">
          <button className={`ns-folder-item${folderId === 'all' ? ' active' : ''}`} onClick={() => setFolderId('all')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <span>Все заметки</span>
            <span className="ns-count">{notes.length}</span>
          </button>

          <button className={`ns-folder-item${folderId === 'starred' ? ' active' : ''}`} onClick={() => setFolderId('starred')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>Избранное</span>
            <span className="ns-count">{notes.filter(n => n.is_starred).length}</span>
          </button>

          {folders.map(f => (
            <button key={f.id} className={`ns-folder-item${folderId === f.id ? ' active' : ''}`} onClick={() => setFolderId(f.id)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={f.color + '28'} stroke={f.color} strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              <span className="ns-folder-name">{f.name}</span>
              <span className="ns-count">{notes.filter(n => n.folder_id === f.id).length}</span>
            </button>
          ))}
        </div>

        <div className="notes-list-panel">
          <div className="nl-history-header">
            <span className="ns-section-title">История</span>
          </div>

          {loading ? (
            <div style={{ padding: '20px', color: '#94A3B8', textAlign: 'center', fontSize: 13 }}>Загрузка...</div>
          ) : filtered.length === 0 ? (
            <div className="nl-empty">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', marginTop: 8 }}>Заметок пока нет</div>
              <div style={{ fontSize: 12, color: '#CBD5E1' }}>Создай заметку в редакторе справа</div>
            </div>
          ) : (
            <div className="nl-list">
            {groups.map(g => (
              <div key={g.label}>
                <div className="nl-group-label">{g.label}</div>
                {g.items.map(note => (
                  <div key={note.id} className={`nl-item${selected?.id === note.id ? ' active' : ''}`} onClick={() => openNote(note)}>
                    <div className="nl-item-title">{note.title || 'Без названия'}</div>
                    <div className="nl-item-preview">{preview(note.content)}</div>
                    <div className="nl-item-meta">
                      <span>{fmtDate(note.updated_at)}</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button className="nl-star-btn" onClick={e => toggleStar(note, e)}><StarIcon filled={note.is_starred}/></button>
                        <button className="nl-star-btn nl-delete-btn" onClick={e => { e.stopPropagation(); deleteNote(note); }} title="Удалить">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* ── Right: editor ── */}
      <div className="notes-editor-panel">
        {!selected ? (
          <div className="ne-empty">
            <div className="ne-empty-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1E293B' }}>Выбери заметку</div>
            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              Нажми на заметку слева или создай новую
            </div>
            <button className="fc-btn-primary" onClick={createNote}>+ Новая заметка</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="ne-header">
              <input className="ne-title-input" value={editTitle} onChange={e => onTitle(e.target.value)} placeholder="Название заметки"/>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {saving && <span style={{ fontSize: 11, color: '#94A3B8' }}>Сохранение...</span>}
                <button className="ne-action-btn" onClick={() => toggleStar(selected)} title={editStarred ? 'Убрать из избранного' : 'В избранное'}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={editStarred ? '#F59E0B' : 'none'} stroke={editStarred ? '#F59E0B' : '#94A3B8'} strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
                <button className="ne-action-btn" title="Экспорт">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </button>
                <button className="ne-action-btn ne-delete-btn" title="Удалить" onClick={() => deleteNote(selected)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Meta */}
            <div className="ne-meta">
              <span>Создано: {fmtDate(selected.created_at)}</span>
              <span className="ne-meta-dot">·</span>
              <span>Изменено: {fmtDate(selected.updated_at)}</span>
            </div>

            {/* Folder + Tags row */}
            <div className="ne-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                <select className="ne-folder-select" value={selected.folder_id ?? ''}
                  onChange={e => changeFolder(selected.id, e.target.value || null)}>
                  <option value="">Без папки</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div className="ne-tags">
              {editTags.map(tag => (
                <span key={tag} className="ne-tag">
                  {tag}
                  <button className="ne-tag-remove" onClick={() => removeTag(tag)}>×</button>
                </span>
              ))}
              {showTagInput ? (
                <input className="ne-tag-input" placeholder="Тег..." value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { addTag(); } if (e.key === 'Escape') setShowTagInput(false); }}
                  onBlur={() => { addTag(); setShowTagInput(false); }}
                  autoFocus/>
              ) : (
                <button className="ne-add-tag-btn" onClick={() => setShowTagInput(true)}>+ Тег</button>
              )}
            </div>

            {/* Editor */}
            <div className="ne-content-area">
              {editingContent ? (
                <textarea
                  className="ne-editor"
                  value={editContent}
                  onChange={e => onContent(e.target.value)}
                  onBlur={() => setEditingContent(false)}
                  autoFocus
                  placeholder={`Начни писать заметку...\n\n# Используй # для заголовков\n- и минус для списков\n> и > для цитат`}
                />
              ) : (
                <div className="ne-rendered-note" onClick={() => setEditingContent(true)}>
                  {editContent.trim() ? renderNoteContent(editContent) : (
                    <p className="ne-rendered-placeholder">Начни писать заметку...</p>
                  )}
                </div>
              )}
            </div>

            {/* Formatting hint */}
            <div className="ne-hint-row">
              <span className="ne-hint"># Заголовок</span>
              <span className="ne-hint">- Список</span>
              <span className="ne-hint">&gt; Цитата</span>
              <span className="ne-hint">**жирный**</span>
            </div>
          </>
        )}
      </div>

      {/* New folder modal */}
      {showNewFolder && (
        <div className="fc-modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="fc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Новая папка</h3>
              <button className="fc-modal-close" onClick={() => setShowNewFolder(false)}>×</button>
            </div>
            <div className="fc-form-group">
              <label className="fc-label">Название</label>
              <input className="fc-input" placeholder="Например: Математика" value={folderName}
                onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}/>
            </div>
            <div className="fc-form-group">
              <label className="fc-label">Цвет</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FOLDER_COLORS.map(c => (
                  <button key={c} onClick={() => setFolderColor(c)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: c, border: folderColor === c ? '3px solid #1E293B' : '3px solid transparent', cursor: 'pointer' }}/>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="fc-btn-secondary" onClick={() => setShowNewFolder(false)}>Отмена</button>
              <button className="fc-btn-primary" onClick={createFolder} disabled={!folderName.trim()}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
