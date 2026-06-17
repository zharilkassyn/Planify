import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type PlannerDraftEvent = {
  title: string;
  description: string;
  hour: number;
  end_hour: number;
  event_date: string;
  color: string;
};
type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  time: string;
  schedule?: PlannerDraftEvent[];
  addedToPlanner?: boolean;
};
type Chat    = { id: string; title: string; time: string; messages: Message[] };
type AiFunctionResponse = { text?: string; error?: string };
type AiScheduleResponse = { reply: string; events: PlannerDraftEvent[] };

const CAPABILITIES = [
  { icon: '📷', color: '#2563EB', title: 'Конспекты из фото',   desc: 'Загрузи фото конспекта или учебника, и я сделаю структурированный конспект.' },
  { icon: '🃏', color: '#0D9488', title: 'Флеш-карты',          desc: 'Создаю флеш-карты для лучшего запоминания.' },
  { icon: '💡', color: '#F59E0B', title: 'Объяснение тем',      desc: 'Объясняю сложные темы простыми словами.' },
  { icon: '❓', color: '#6366F1', title: 'Тесты и вопросы',     desc: 'Создаю тесты и вопросы для самопроверки.' },
  { icon: '📅', color: '#0284C7', title: 'Планирование',        desc: 'Помогу составить план обучения и подготовки.' },
  { icon: '❤️', color: '#EF4444', title: 'Мотивация',           desc: 'Поддержу и помогу не терять мотивацию!' },
];

const QUICK = ['Сделать конспект', 'Создать флеш-карты', 'Объяснить тему', 'Создать тест'];
const SCHEDULE_WORDS = ['расписан', 'план на день', 'план на неделю', 'запланируй', 'добавь в планировщик'];
const EVENT_COLORS = ['#2563EB', '#0284C7', '#6366F1', '#0D9488', '#F59E0B', '#EF4444'];

function getTime() {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayString() {
  return toDateString(new Date());
}

function isScheduleRequest(text: string) {
  const lower = text.toLowerCase();
  return SCHEDULE_WORDS.some(word => lower.includes(word));
}

const STORAGE_KEY = 'planify_chats';

function loadChats(): Chat[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getResponseContext(error: unknown): Response | null {
  if (!error || typeof error !== 'object') return null;
  const maybeError = error as { context?: unknown };
  return maybeError.context instanceof Response ? maybeError.context : null;
}

async function getAiErrorMessage(error: unknown): Promise<string> {
  const response = getResponseContext(error);
  if (response) {
    try {
      const body = await response.clone().json() as AiFunctionResponse;
      if (body.error) return body.error;
    } catch {
      const text = await response.clone().text();
      if (text) return text;
    }
  }

  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}

async function askAi(prompt: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
    body: {
      prompt,
      system: [
        'Ты ИИ-помощник для учебного приложения Planify.',
        'Отвечай на русском языке, понятно и дружелюбно.',
        'Помогай школьнику с учебой: объяснения, планы, тесты, конспекты, флеш-карты.',
        'Не пиши слишком длинно без необходимости.',
      ].join('\n'),
    },
  });

  if (error) throw new Error(await getAiErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.text?.trim()) throw new Error('ИИ не вернул ответ');

  return data.text.trim();
}

function stripCodeFence(text: string) {
  return text.replace(/```json|```/g, '').trim();
}

function isPlannerDraftEvent(value: unknown): value is PlannerDraftEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<PlannerDraftEvent>;
  return (
    typeof event.title === 'string'
    && typeof event.description === 'string'
    && typeof event.event_date === 'string'
    && typeof event.color === 'string'
    && typeof event.hour === 'number'
    && typeof event.end_hour === 'number'
  );
}

function normalizeEvent(event: PlannerDraftEvent, index: number): PlannerDraftEvent {
  const hour = Math.min(21, Math.max(8, Math.round(event.hour)));
  const endHour = Math.min(22, Math.max(hour + 1, Math.round(event.end_hour)));
  const color = EVENT_COLORS.includes(event.color) ? event.color : EVENT_COLORS[index % EVENT_COLORS.length];

  return {
    title: event.title.slice(0, 80),
    description: event.description.slice(0, 180),
    hour,
    end_hour: endHour,
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(event.event_date) ? event.event_date : todayString(),
    color,
  };
}

function parseScheduleResponse(text: string): AiScheduleResponse {
  const cleanText = stripCodeFence(text);
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('ИИ не вернул JSON для расписания');

  const parsed = JSON.parse(cleanText.slice(start, end + 1)) as Partial<AiScheduleResponse>;
  const events = Array.isArray(parsed.events)
    ? parsed.events.filter(isPlannerDraftEvent).map(normalizeEvent)
    : [];

  if (!parsed.reply || events.length === 0) throw new Error('ИИ не смог составить расписание');
  return { reply: parsed.reply, events };
}

async function askAiForSchedule(prompt: string): Promise<AiScheduleResponse> {
  const today = todayString();
  const response = await askAi([
    `Запрос пользователя: ${prompt}`,
    `Сегодня: ${today}`,
    'Составь расписание для планировщика.',
    'Если пользователь не указал дату, используй сегодняшнюю дату.',
    'Рабочие часы планировщика: с 08:00 до 22:00.',
    `Доступные цвета: ${EVENT_COLORS.join(', ')}.`,
    'Верни только JSON без markdown.',
    'Формат: {"reply":"короткое описание расписания","events":[{"title":"...","description":"...","hour":9,"end_hour":10,"event_date":"YYYY-MM-DD","color":"#2563EB"}]}',
  ].join('\n'));

  return parseScheduleResponse(response);
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

    setTyping(true);
    let aiContent = '';
    let schedule: PlannerDraftEvent[] | undefined;
    try {
      if (isScheduleRequest(content)) {
        const result = await askAiForSchedule(content);
        aiContent = result.reply;
        schedule = result.events;
      } else {
        aiContent = await askAi(content);
      }
    } catch (error) {
      const message = await getAiErrorMessage(error);
      aiContent = `Не получилось получить ответ от ИИ.\n\nПроверь, что GEMINI_API_KEY добавлен в Supabase Secrets и функция ai задеплоена.\n\nДетали: ${message}`;
    } finally {
      setTyping(false);
    }

    const aiMsg: Message = { id: uid(), role: 'ai', content: aiContent, time: getTime(), schedule };
    const final = updated.map(c =>
      c.id === chatId ? { ...c, messages: [...c.messages, aiMsg] } : c
    );
    setChats(final);
    saveChats(final);
  }

  async function addScheduleToPlanner(messageId: string, schedule: PlannerDraftEvent[]) {
    if (!activeChatId || schedule.length === 0) return;

    const { error } = await supabase.from('planner_events').insert(
      schedule.map(event => ({
        title: event.title,
        description: event.description,
        hour: event.hour,
        end_hour: event.end_hour,
        color: event.color,
        event_date: event.event_date,
      })),
    );

    const nextContent = error
      ? `Не получилось добавить расписание в планировщик.\n\nДетали: ${error.message}`
      : null;

    const updated = chats.map(chat => {
      if (chat.id !== activeChatId) return chat;
      return {
        ...chat,
        messages: chat.messages.map(message => {
          if (message.id !== messageId) return message;
          return {
            ...message,
            content: nextContent ?? message.content,
            addedToPlanner: !error,
          };
        }),
      };
    });

    setChats(updated);
    saveChats(updated);
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
                {m.schedule && m.schedule.length > 0 && (
                  <div className="ai-schedule-card">
                    <div className="ai-schedule-head">
                      <span>Расписание</span>
                      <span>{m.schedule.length} событий</span>
                    </div>
                    <div className="ai-schedule-list">
                      {m.schedule.map((event, i) => (
                        <div key={`${event.event_date}-${event.hour}-${event.title}-${i}`} className="ai-schedule-row">
                          <div className="ai-schedule-dot" style={{ background: event.color }} />
                          <div>
                            <div className="ai-schedule-title">{event.title}</div>
                            <div className="ai-schedule-meta">
                              {event.event_date} · {String(event.hour).padStart(2, '0')}:00-{String(event.end_hour).padStart(2, '0')}:00
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      className="ai-schedule-add"
                      onClick={() => addScheduleToPlanner(m.id, m.schedule ?? [])}
                      disabled={m.addedToPlanner}
                    >
                      {m.addedToPlanner ? 'Добавлено в планировщик' : 'Добавить в планировщик'}
                    </button>
                  </div>
                )}
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
