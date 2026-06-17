import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type Deck = { id: string; name: string; description: string; color: string; created_at: string; card_count?: number };
type Card = { id: string; deck_id: string; question: string; answer: string };

const COLORS = ['#2563EB','#0D9488','#6366F1','#F59E0B','#EF4444','#10B981','#0284C7','#7C3AED'];

export function FlashCards() {
  const [tab, setTab] = useState<'overview'|'decks'|'favorites'|'trash'>('overview');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [deckCards, setDeckCards] = useState<Card[]>([]);
  const [studyMode, setStudyMode] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [studyDone, setStudyDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studiedToday, setStudiedToday] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [correctReviews, setCorrectReviews] = useState(0);

  const [trashedIds, setTrashedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('planify_trash_decks') || '[]')); }
    catch { return new Set(); }
  });

  function saveTrashed(next: Set<string>) {
    localStorage.setItem('planify_trash_decks', JSON.stringify([...next]));
  }

  function trashDeck(id: string) {
    setTrashedIds(prev => { const n = new Set(prev); n.add(id); saveTrashed(n); return n; });
  }

  function restoreDeck(id: string) {
    setTrashedIds(prev => { const n = new Set(prev); n.delete(id); saveTrashed(n); return n; });
  }

  async function permanentDeleteDeck(id: string) {
    if (!confirm('Удалить колоду навсегда? Это действие нельзя отменить.')) return;
    await supabase.from('flashcards').delete().eq('deck_id', id);
    await supabase.from('flashcard_decks').delete().eq('id', id);
    setDecks(prev => prev.filter(d => d.id !== id));
    setTrashedIds(prev => { const n = new Set(prev); n.delete(id); saveTrashed(n); return n; });
  }

  const [favDeckIds, setFavDeckIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('planify_fav_decks') || '[]')); }
    catch { return new Set(); }
  });

  function toggleFavDeck(id: string) {
    setFavDeckIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('planify_fav_decks', JSON.stringify([...next]));
      return next;
    });
  }

  const [showNewDeck, setShowNewDeck] = useState(false);
  const [showNewCard, setShowNewCard] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckColor, setDeckColor] = useState(COLORS[0]);
  const [cardQ, setCardQ] = useState('');
  const [cardA, setCardA] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadDecks(), loadStats()]);
    setLoading(false);
  }

  async function loadDecks() {
    const { data } = await supabase.from('flashcard_decks').select('*').order('created_at', { ascending: false });
    if (data) {
      const withCounts = await Promise.all(data.map(async deck => {
        const { count } = await supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('deck_id', deck.id);
        return { ...deck, card_count: count ?? 0 };
      }));
      setDecks(withCounts);
    }
  }

  async function loadStats() {
    const today = new Date().toISOString().split('T')[0];
    const { data: td } = await supabase.from('flashcard_reviews').select('id').gte('reviewed_at', today);
    setStudiedToday(td?.length ?? 0);
    const { data: all } = await supabase.from('flashcard_reviews').select('rating');
    setTotalReviews(all?.length ?? 0);
    setCorrectReviews(all?.filter(r => r.rating >= 3).length ?? 0);
  }

  async function loadDeckCards(deckId: string) {
    const { data } = await supabase.from('flashcards').select('*').eq('deck_id', deckId).order('created_at');
    setDeckCards(data ?? []);
  }

  async function saveDeck() {
    if (!deckName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('flashcard_decks')
      .insert({ name: deckName.trim(), description: deckDesc.trim(), color: deckColor })
      .select().single();
    if (!error && data) {
      setDecks(prev => [{ ...data, card_count: 0 }, ...prev]);
      setShowNewDeck(false);
      setDeckName(''); setDeckDesc(''); setDeckColor(COLORS[0]);
    }
    setSaving(false);
  }

  async function deleteCard(id: string) {
    if (!confirm('Удалить карточку?')) return;
    await supabase.from('flashcards').delete().eq('id', id);
    setDeckCards(prev => prev.filter(c => c.id !== id));
    if (selectedDeck) {
      setDecks(prev => prev.map(d => d.id === selectedDeck.id ? { ...d, card_count: Math.max(0, (d.card_count ?? 1) - 1) } : d));
    }
  }

  function deleteDeck(id: string) {
    trashDeck(id);
    if (selectedDeck?.id === id) setSelectedDeck(null);
  }

  async function saveCard() {
    if (!cardQ.trim() || !cardA.trim() || !selectedDeck) return;
    setSaving(true);
    const { data, error } = await supabase.from('flashcards')
      .insert({ deck_id: selectedDeck.id, question: cardQ.trim(), answer: cardA.trim() })
      .select().single();
    if (!error && data) {
      setDeckCards(prev => [...prev, data]);
      setDecks(prev => prev.map(d => d.id === selectedDeck.id ? { ...d, card_count: (d.card_count ?? 0) + 1 } : d));
      setShowNewCard(false);
      setCardQ(''); setCardA('');
    }
    setSaving(false);
  }

  async function nextCard() {
    const card = deckCards[cardIdx];
    if (!card) return;
    await supabase.from('flashcard_reviews').insert({ card_id: card.id, rating: 4 });
    setStudiedToday(p => p + 1);
    setTotalReviews(p => p + 1);
    setCorrectReviews(p => p + 1);
    if (cardIdx < deckCards.length - 1) { setCardIdx(p => p + 1); setFlipped(false); }
    else setStudyDone(true);
  }

  function openDeck(deck: Deck) {
    setSelectedDeck(deck); loadDeckCards(deck.id);
    setStudyMode(false); setStudyDone(false);
  }

  function startStudy(deck: Deck) {
    setSelectedDeck(deck); loadDeckCards(deck.id);
    setStudyMode(true); setStudyDone(false);
    setCardIdx(0); setFlipped(false);
  }

  function endStudy() {
    setStudyMode(false); setStudyDone(false);
    setCardIdx(0); setFlipped(false);
  }

  const activeDecks = decks.filter(d => !trashedIds.has(d.id));
  const trashedDecks = decks.filter(d => trashedIds.has(d.id));
  const totalCards = activeDecks.reduce((s, d) => s + (d.card_count ?? 0), 0);
  const accuracy = totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0;

  /* ── Study session ──────────────────────────────────────────────────────── */
  if (studyMode && selectedDeck) {
    const card = deckCards[cardIdx];

    if (studyDone) {
      return (
        <div className="flashcards-layout">
          <div className="fc-study-done">
            <div className="fc-done-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1E293B' }}>Сессия завершена!</div>
            <div style={{ fontSize: 14, color: '#64748B' }}>{selectedDeck.name} · {deckCards.length} карточек</div>
            <div className="fc-done-stats">
              <div className="fc-done-stat" style={{ background: 'var(--primary-light,#EFF6FF)', border: '1px solid var(--primary-mid,#BFDBFE)' }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--primary)' }}>{deckCards.length}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Карточек пройдено</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="fc-btn-secondary" onClick={() => { setCardIdx(0); setFlipped(false); setStudyDone(false); }}>
                Повторить ещё раз
              </button>
              <button className="fc-btn-primary" onClick={endStudy}>К колодам</button>
            </div>
          </div>
        </div>
      );
    }

    if (!card) return <div className="flashcards-layout"><div style={{ padding: 40, color: '#94A3B8', textAlign: 'center' }}>Загрузка...</div></div>;

    const pct = deckCards.length > 0 ? Math.round((cardIdx / deckCards.length) * 100) : 0;
    return (
      <div className="flashcards-layout">
        <div className="fc-header">
          <button className="fc-back-btn" onClick={endStudy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Назад
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selectedDeck.name}</h2>
            <p style={{ fontSize: 13, color: '#64748B' }}>Карточка {cardIdx + 1} из {deckCards.length}</p>
          </div>
        </div>

        <div style={{ background: '#E2E8F0', borderRadius: 4, height: 6 }}>
          <div style={{ background: 'var(--primary)', borderRadius: 4, height: '100%', width: `${pct}%`, transition: 'width 0.3s' }}/>
        </div>

        <div className="fc-study-area">
          <div className="flip-card-wrap" onClick={() => setFlipped(v => !v)}>
            <div className={`flip-card-inner${flipped ? ' flipped' : ''}`}>
              <div className="flip-card-face flip-front">
                <div className="flip-label">Вопрос</div>
                <div className="flip-text">{card.question}</div>
              </div>
              <div className="flip-card-face flip-back">
                <div className="flip-label" style={{ color: 'var(--primary)' }}>Ответ</div>
                <div className="flip-text" style={{ color: '#1E293B' }}>{card.answer}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="fc-btn-secondary" onClick={() => setFlipped(v => !v)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
              {flipped ? 'Свернуть' : 'Развернуть'}
            </button>
            <button className="fc-btn-primary" onClick={nextCard}>
              Следующий
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Deck detail ────────────────────────────────────────────────────────── */
  if (selectedDeck && !studyMode) {
    return (
      <div className="flashcards-layout">
        <div className="fc-header">
          <button className="fc-back-btn" onClick={() => setSelectedDeck(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Назад
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: selectedDeck.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selectedDeck.name}</h2>
              {selectedDeck.description && <p style={{ fontSize: 13, color: '#64748B' }}>{selectedDeck.description}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="fc-btn-secondary" onClick={() => setShowNewCard(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Добавить карточку
            </button>
            {deckCards.length > 0 && (
              <button className="fc-btn-primary" onClick={() => startStudy(selectedDeck)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Начать изучение
              </button>
            )}
          </div>
        </div>

        {deckCards.length === 0 ? (
          <div className="fc-empty">
            <div className="fc-empty-icon" style={{ background: '#EFF6FF' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <div className="fc-empty-title">В колоде нет карточек</div>
            <div className="fc-empty-sub">Добавь первую карточку с вопросом и ответом</div>
            <button className="fc-btn-primary" onClick={() => setShowNewCard(true)}>+ Добавить карточку</button>
          </div>
        ) : (
          <div className="fc-cards-grid">
            {deckCards.map((card, i) => (
              <div key={card.id} className="fc-card-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, letterSpacing: 0.5 }}>#{i + 1}</div>
                  <button className="fc-delete-btn" onClick={() => deleteCard(card.id)} title="Удалить карточку">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 8 }}>{card.question}</div>
                <div style={{ height: 1, background: '#F1F5F9', marginBottom: 8 }}/>
                <div style={{ fontSize: 13, color: '#64748B' }}>{card.answer}</div>
              </div>
            ))}
          </div>
        )}

        {showNewCard && (
          <div className="fc-modal-overlay" onClick={() => setShowNewCard(false)}>
            <div className="fc-modal" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Новая карточка</h3>
                <button onClick={() => setShowNewCard(false)} className="fc-modal-close">×</button>
              </div>
              <div className="fc-form-group">
                <label className="fc-label">Вопрос (лицевая сторона)</label>
                <textarea className="fc-textarea" placeholder="Введи вопрос или понятие..." value={cardQ} onChange={e => setCardQ(e.target.value)} rows={3}/>
              </div>
              <div className="fc-form-group">
                <label className="fc-label">Ответ (обратная сторона)</label>
                <textarea className="fc-textarea" placeholder="Введи ответ или определение..." value={cardA} onChange={e => setCardA(e.target.value)} rows={3}/>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="fc-btn-secondary" onClick={() => setShowNewCard(false)}>Отмена</button>
                <button className="fc-btn-primary" onClick={saveCard} disabled={saving || !cardQ.trim() || !cardA.trim()}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Main view ──────────────────────────────────────────────────────────── */
  return (
    <div className="flashcards-layout">

      {/* Header */}
      <div className="fc-header">
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700 }}>Флеш-карты</h2>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Эффективное запоминание с помощью карточек</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
<button className="fc-btn-primary" onClick={() => setShowNewDeck(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Новая колода
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="fc-tabs">
        {(['overview','decks','favorites','trash'] as const).map(t => {
          const labels = { overview: 'Обзор', decks: 'Мои колоды', favorites: 'Избранное', trash: 'Корзина' };
          return (
            <button key={t} className={`fc-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="fc-body">

        {/* Left */}
        <div className="fc-content">

          {/* Stats */}
          <div className="fc-stats-row">
            <div className="fc-stat-card">
              <div className="fc-stat-icon" style={{ background: '#EFF6FF' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/>
                  <line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
                </svg>
              </div>
              <div>
                <div className="fc-stat-value">{totalCards}</div>
                <div className="fc-stat-label">Всего карточек</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon" style={{ background: '#F0FDF4' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 12l3 3 5-5"/>
                </svg>
              </div>
              <div>
                <div className="fc-stat-value" style={{ color: '#10B981' }}>{studiedToday}</div>
                <div className="fc-stat-label">Изучено сегодня</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon" style={{ background: '#FFF7ED' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="4"/>
                  <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
                </svg>
              </div>
              <div>
                <div className="fc-stat-value" style={{ color: '#F59E0B' }}>{accuracy}%</div>
                <div className="fc-stat-label">Правильных ответов</div>
              </div>
            </div>

            <div className="fc-stat-card">
              <div className="fc-stat-icon" style={{ background: '#FEF2F2' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div>
                <div className="fc-stat-value" style={{ color: '#EF4444' }}>0</div>
                <div className="fc-stat-label">Серия дней</div>
              </div>
            </div>
          </div>

          {/* Tab: Обзор */}
          {tab === 'overview' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Загрузка...</div>
            ) : activeDecks.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-empty-icon" style={{ background: '#EFF6FF' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5">
                    <rect x="1" y="8" width="22" height="13" rx="2"/>
                    <path d="M5 8V6a2 2 0 014 0v2M15 8V6a2 2 0 014 0v2"/>
                    <line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
                  </svg>
                </div>
                <div className="fc-empty-title">Нет колод для изучения</div>
                <div className="fc-empty-sub">Создай первую колоду флеш-карточек и начни учиться эффективнее</div>
                <button className="fc-btn-primary" onClick={() => setShowNewDeck(true)}>+ Создать первую колоду</button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#1E293B' }}>Недавние колоды</div>
                <div className="fc-decks-grid">
                  {activeDecks.slice(0, 6).map(deck => <DeckCard key={deck.id} deck={deck} onOpen={openDeck} onStudy={startStudy} onDelete={deleteDeck} isFav={favDeckIds.has(deck.id)} onToggleFav={toggleFavDeck}/>)}
                </div>
              </>
            )
          )}

          {/* Tab: Мои колоды */}
          {tab === 'decks' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Загрузка...</div>
            ) : activeDecks.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-empty-icon" style={{ background: '#EFF6FF' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5">
                    <rect x="1" y="8" width="22" height="13" rx="2"/>
                    <path d="M5 8V6a2 2 0 014 0v2M15 8V6a2 2 0 014 0v2"/>
                  </svg>
                </div>
                <div className="fc-empty-title">Колод ещё нет</div>
                <div className="fc-empty-sub">Создай свою первую колоду для изучения</div>
                <button className="fc-btn-primary" onClick={() => setShowNewDeck(true)}>+ Новая колода</button>
              </div>
            ) : (
              <div className="fc-decks-grid">
                {activeDecks.map(deck => <DeckCard key={deck.id} deck={deck} onOpen={openDeck} onStudy={startStudy} onDelete={deleteDeck} isFav={favDeckIds.has(deck.id)} onToggleFav={toggleFavDeck}/>)}
                <div className="fc-deck-card fc-deck-new" onClick={() => setShowNewDeck(true)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500, marginTop: 8 }}>Новая колода</div>
                </div>
              </div>
            )
          )}

          {/* Tab: Избранное */}
          {tab === 'favorites' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Загрузка...</div>
            ) : activeDecks.filter(d => favDeckIds.has(d.id)).length === 0 ? (
              <div className="fc-empty">
                <div className="fc-empty-icon" style={{ background: '#FFF7ED' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <div className="fc-empty-title">Избранных колод нет</div>
                <div className="fc-empty-sub">Нажми на звёздочку на колоде, чтобы добавить в избранное</div>
              </div>
            ) : (
              <div className="fc-decks-grid">
                {activeDecks.filter(d => favDeckIds.has(d.id)).map(deck => (
                  <DeckCard key={deck.id} deck={deck} onOpen={openDeck} onStudy={startStudy} onDelete={deleteDeck} isFav={true} onToggleFav={toggleFavDeck}/>
                ))}
              </div>
            )
          )}

          {/* Tab: Корзина */}
          {tab === 'trash' && (
            trashedDecks.length === 0 ? (
              <div className="fc-empty">
                <div className="fc-empty-icon" style={{ background: '#F1F5F9' }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </div>
                <div className="fc-empty-title">Корзина пуста</div>
                <div className="fc-empty-sub">Удалённые колоды появятся здесь</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {trashedDecks.map(deck => (
                  <div key={deck.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--card)', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 18px' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: deck.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{deck.card_count} карточек</div>
                    </div>
                    <button
                      onClick={() => restoreDeck(deck.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'var(--card)', color: '#1E293B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                      </svg>
                      Восстановить
                    </button>
                    <button
                      onClick={() => permanentDeleteDeck(deck.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                      Удалить навсегда
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Right sidebar */}
        <div className="fc-right">
          <div className="panel" style={{ padding: 18 }}>
            <div className="panel-header" style={{ marginBottom: 14 }}>
              <span className="panel-title">Мои колоды</span>
              {activeDecks.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setTab('decks')}>Все</span>
              )}
            </div>
            {activeDecks.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
                Колод ещё нет
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeDecks.slice(0, 6).map(deck => (
                  <div key={deck.id} className="fc-deck-row" onClick={() => openDeck(deck)}>
                    <div className="fc-deck-dot" style={{ background: deck.color }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{deck.card_count} карточек</div>
                    </div>
                    <button className="fc-mini-play" style={{ background: deck.color }}
                      onClick={e => { e.stopPropagation(); startStudy(deck); }} title="Начать изучение">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 18 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Как это работает</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/></svg>, bg: '#EFF6FF', text: 'Создай колоду и добавь карточки' },
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M12 8v4l3 3"/></svg>, bg: '#F0FDF4', text: 'Нажми на карточку, чтобы увидеть ответ' },
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, bg: '#FFF7ED', text: 'Оцени сложность для лучшего запоминания' },
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, bg: '#EEF2FF', text: 'Следи за своим прогрессом' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* New Deck Modal */}
      {showNewDeck && (
        <div className="fc-modal-overlay" onClick={() => setShowNewDeck(false)}>
          <div className="fc-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Новая колода</h3>
              <button onClick={() => setShowNewDeck(false)} className="fc-modal-close">×</button>
            </div>
            <div className="fc-form-group">
              <label className="fc-label">Название</label>
              <input className="fc-input" placeholder="Например: Английские слова" value={deckName} onChange={e => setDeckName(e.target.value)}/>
            </div>
            <div className="fc-form-group">
              <label className="fc-label">Описание (опционально)</label>
              <input className="fc-input" placeholder="Краткое описание..." value={deckDesc} onChange={e => setDeckDesc(e.target.value)}/>
            </div>
            <div className="fc-form-group">
              <label className="fc-label">Цвет</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setDeckColor(c)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: c, border: deckColor === c ? '3px solid #1E293B' : '3px solid transparent', cursor: 'pointer', transition: 'border-color 0.15s' }}/>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="fc-btn-secondary" onClick={() => setShowNewDeck(false)}>Отмена</button>
              <button className="fc-btn-primary" onClick={saveDeck} disabled={saving || !deckName.trim()}>
                {saving ? 'Создание...' : 'Создать колоду'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeckCard({ deck, onOpen, onStudy, onDelete, isFav, onToggleFav }: { deck: Deck; onOpen: (d: Deck) => void; onStudy: (d: Deck) => void; onDelete: (id: string) => void; isFav: boolean; onToggleFav: (id: string) => void }) {
  return (
    <div className="fc-deck-card" onClick={() => onOpen(deck)}>
      <div className="fc-deck-top" style={{ background: deck.color + '20' }}>
        <div className="fc-deck-icon-wrap" style={{ background: deck.color }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2"/>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className="fc-deck-count">{deck.card_count} карт.</div>
          <button
            className="fc-fav-btn"
            onClick={e => { e.stopPropagation(); onToggleFav(deck.id); }}
            title={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24"
              fill={isFav ? '#F59E0B' : 'none'}
              stroke={isFav ? '#F59E0B' : '#94A3B8'} strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button className="fc-delete-btn fc-deck-delete" onClick={e => { e.stopPropagation(); onDelete(deck.id); }} title="Удалить колоду">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
        {deck.description && <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.description}</div>}
        <button className="fc-study-btn" style={{ background: deck.color, marginTop: 8 }}
          onClick={e => { e.stopPropagation(); onStudy(deck); }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Изучить
        </button>
      </div>
    </div>
  );
}
