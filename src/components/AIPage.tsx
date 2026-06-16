import { useState, useRef, useEffect } from 'react';

type Message = { id: string; role: 'user' | 'ai'; content: string; time: string };
type Chat    = { id: string; title: string; time: string; messages: Message[] };

const CAPABILITIES = [
  { icon: '📷', color: '#2563EB', title: 'Конспекты из фото',   desc: 'Загрузи фото конспекта или учебника, и я сделаю структурированный конспект.' },
  { icon: '🃏', color: '#0D9488', title: 'Флеш-карты',          desc: 'Создаю флеш-карты для лучшего запоминания.' },
  { icon: '💡', color: '#F59E0B', title: 'Объяснение тем',      desc: 'Объясняю сложные темы простыми словами.' },
  { icon: '❓', color: '#6366F1', title: 'Тесты и вопросы',     desc: 'Создаю тесты и вопросы для самопроверки.' },
  { icon: '📅', color: '#0284C7', title: 'Планирование',        desc: 'Помогу составить план обучения и подготовки.' },
  { icon: '❤️', color: '#EF4444', title: 'Мотивация',           desc: 'Поддержу и помогу не терять мотивацию!' },
];

const QUICK = ['Сделать конспект', 'Создать флеш-карты', 'Объяснить тему', 'Создать тест'];

const MOCK_RESPONSES: Record<string, string> = {
  'сделать конспект':  'Конечно! Напиши тему, по которой нужен конспект, и я структурирую материал для тебя.',
  'создать флеш-карты': 'Отлично! Укажи тему или вставь текст — я создам флеш-карты для эффективного запоминания.',
  'объяснить тему':    'С удовольствием! Напиши тему, которую хочешь понять, и я объясню её простыми словами.',
  'создать тест':      'Хорошо! Укажи тему — я составлю тест с вопросами для самопроверки.',
};

function getTime() {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function getMockResponse(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, resp] of Object.entries(MOCK_RESPONSES)) {
    if (lower.includes(key)) return resp;
  }
  return `Понял! Я работаю над ответом на твой вопрос: «${text}».\n\nДля полноценной работы ИИ-помощника подключи API-ключ Claude в настройках проекта. Пока что я отвечаю в демо-режиме.`;
}

const STORAGE_KEY = 'planify_chats';

function loadChats(): Chat[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

export function AIPage() {
  const [chats,      setChats]      = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChat] = useState<string | null>(chats[0]?.id ?? null);
  const [input,      setInput]      = useState('');
  const [typing,     setTyping]     = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;
  const messages   = activeChat?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function newChat() {
    const chat: Chat = { id: uid(), title: 'Новый чат', time: getTime(), messages: [] };
    const updated = [chat, ...chats];
    setChats(updated);
    saveChats(updated);
    setActiveChat(chat.id);
    setShowHistory(false);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');

    let chatId = activeChatId;
    let currentChats = chats;

    // create chat if none
    if (!chatId) {
      const chat: Chat = { id: uid(), title: content.slice(0, 40), time: getTime(), messages: [] };
      currentChats = [chat, ...chats];
      chatId = chat.id;
      setChats(currentChats);
      setActiveChat(chatId);
    }

    const userMsg: Message = { id: uid(), role: 'user', content, time: getTime() };
    const updated = currentChats.map(c =>
      c.id === chatId
        ? { ...c, title: c.messages.length === 0 ? content.slice(0, 40) : c.title, messages: [...c.messages, userMsg] }
        : c
    );
    setChats(updated);
    saveChats(updated);

    // fake AI typing
    setTyping(true);
    await new Promise(r => setTimeout(r, 900 + Math.random() * 600));
    setTyping(false);

    const aiMsg: Message = { id: uid(), role: 'ai', content: getMockResponse(content), time: getTime() };
    const final = updated.map(c =>
      c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c
    );
    setChats(final);
    saveChats(final);
  }

  function deleteChat(id: string) {
    const updated = chats.filter(c => c.id !== id);
    setChats(updated);
    saveChats(updated);
    if (activeChatId === id) setActiveChat(updated[0]?.id ?? null);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="ai-layout">

      {/* ── LEFT: chat ── */}
      <div className="ai-main">

        {/* header */}
        <div className="ai-header">
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>ИИ-помощник</h2>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Ваш умный помощник для учёбы</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ai-hdr-btn" onClick={() => setShowHistory(v => !v)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              История чатов
            </button>
            <button className="ai-hdr-btn" onClick={newChat}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Новый чат
            </button>
            <button className="bell-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </button>
          </div>
        </div>

        {/* history dropdown */}
        {showHistory && (
          <div className="history-dropdown">
            <div className="panel-header" style={{ padding: '12px 16px 8px' }}>
              <span className="panel-title">История чатов</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }} onClick={newChat}>+ Новый</button>
            </div>
            {chats.length === 0 ? (
              <div style={{ padding: '12px 16px', fontSize: 13, color: '#94A3B8' }}>Чатов пока нет</div>
            ) : chats.map(c => (
              <div key={c.id} className={`history-item${c.id === activeChatId ? ' active' : ''}`}
                onClick={() => { setActiveChat(c.id); setShowHistory(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: '#94A3B8' }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{c.title}</span>
                <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{c.time}</span>
                <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                  style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* messages */}
        <div className="chat-area">
          {messages.length === 0 && (
            <div className="ai-welcome">
              <div className="ai-robot">🤖</div>
              <div>
                <div className="ai-welcome-title">Привет! 👋</div>
                <div className="ai-welcome-sub">Я здесь, чтобы помочь тебе учиться эффективнее.<br/>Что хочешь сделать сегодня?</div>
                <div className="ai-quick-btns">
                  {QUICK.map(q => (
                    <button key={q} className="quick-btn" onClick={() => send(q)}>{q}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`msg-row ${m.role}`}>
              {m.role === 'ai' && (
                <div className="msg-avatar">🤖</div>
              )}
              <div className={`msg-bubble ${m.role}`}>
                <div className="msg-text" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                <div className="msg-time">{m.time}</div>
                {m.role === 'ai' && (
                  <div className="msg-actions">
                    <button title="Полезно">👍</button>
                    <button title="Не полезно">👎</button>
                    <button title="Копировать" onClick={() => navigator.clipboard.writeText(m.content)}>📋</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="msg-row ai">
              <div className="msg-avatar">🤖</div>
              <div className="msg-bubble ai">
                <div className="typing-dots"><span/><span/><span/></div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* input */}
        <div className="chat-input-wrap">
          <button className="attach-btn" title="Прикрепить файл">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Спроси что-нибудь…"
            value={input}
            rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className="send-btn" onClick={() => send()} disabled={!input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
          ИИ может ошибаться. Проверяй важную информацию.
        </div>
      </div>

      {/* ── RIGHT ── */}
      <div className="ai-right">

        {/* Capabilities */}
        <div className="panel" style={{ padding: 18 }}>
          <div className="panel-title" style={{ marginBottom: 14 }}>Что я умею</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CAPABILITIES.map(c => (
              <button key={c.title} className="cap-card" onClick={() => send(c.title)}>
                <div className="cap-icon" style={{ background: c.color + '18', color: c.color }}>{c.icon}</div>
                <div className="cap-title">{c.title}</div>
                <div className="cap-desc">{c.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent chats */}
        <div className="panel" style={{ padding: 18 }}>
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <span className="panel-title">Недавние чаты</span>
            {chats.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setShowHistory(true)}>Посмотреть все</span>
            )}
          </div>
          {chats.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
              Начни первый чат — здесь появится история
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chats.slice(0, 5).map(c => (
                <div key={c.id} className={`recent-chat-item${c.id === activeChatId ? ' active' : ''}`}
                  onClick={() => setActiveChat(c.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ flexShrink: 0, color: '#94A3B8' }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{c.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="upload-card">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
          </svg>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 8 }}>Загрузи фото для анализа</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Перетащи файл сюда или нажми для выбора</div>
        </div>

      </div>
    </div>
  );
}
