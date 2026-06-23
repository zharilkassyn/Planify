import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { buildPlanifySystemPrompt, type PlanifyAiMode } from '../lib/aiContext';

type PlannerDraftEvent = {
  title: string;
  description: string;
  hour: number;
  end_hour: number;
  event_date: string;
  color: string;
};
type AppSection =
  | 'Главная'
  | 'Планировщик'
  | 'Таймер'
  | 'ИИ-помощник'
  | 'Флеш-карты'
  | 'Заметки'
  | 'Генерация презентаций'
  | 'Настройки';
type FlashcardDraft = { question: string; answer: string };
type FlashcardAiResponse = { deckName: string; description: string; cards: FlashcardDraft[] };
type AiAttachment = {
  name: string;
  mimeType: string;
  data?: string;
  text?: string;
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

const QUICK = ['Сделать конспект', 'Создать флеш-карты', 'Объяснить тему', 'Создать тест', 'Создать план'];
const SCHEDULE_WORDS = ['расписан', 'план на день', 'план на неделю', 'запланируй', 'добавь в планировщик'];
const EVENT_COLORS = ['#2563EB', '#0284C7', '#6366F1', '#0D9488', '#F59E0B', '#EF4444'];
const PRESENTATION_DRAFT_KEY = 'planify_presentation_draft_topic';
const TIMER_KEY = 'planify_timer_state';
const CREATE_ACTION_WORDS = [
  'создай',
  'создать',
  'сделай',
  'сделать',
  'сгенерируй',
  'сгенерировать',
  'составь',
  'составить',
  'добавь',
  'добавить',
  'запиши',
  'записать',
  'сохрани',
  'сохранить',
  'перенеси',
  'перенести',
  'отправь',
  'отправить',
];
const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
};

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

function includesAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some(word => lower.includes(word));
}

function hasCreateIntent(text: string) {
  const lower = text.toLowerCase();
  return CREATE_ACTION_WORDS.some(word => lower.includes(word));
}

function isExplicitFlashcardRequest(text: string) {
  return hasCreateIntent(text) && includesAny(text, ['флеш', 'карточк']);
}

function isExplicitNoteRequest(text: string) {
  return hasCreateIntent(text) && includesAny(text, ['заметк', 'записк', 'конспект']);
}

function extractTopic(text: string) {
  return text
    .replace(/сделай|создай|составь|открой|перейди|презентац(ию|ия|ии)|флеш[-\s]?карты|карточки|заметку|конспект|таймер|включи|запусти/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STORAGE_KEY = 'planify_chats';

function loadChats(): Chat[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveChats(chats: Chat[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function getTypingChunks(text: string): string[] {
  return text.match(/.{1,4}(\s|$)|\S+/g) ?? [text];
}

function cleanAiResponse(text: string) {
  const trimmed = text.trim();
  const quotePairs: [string, string][] = [
    ['"', '"'],
    ['“', '”'],
    ['«', '»'],
  ];

  for (const [start, end] of quotePairs) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end)) {
      return trimmed.slice(start.length, -end.length).trim();
    }
  }

  return trimmed;
}

function getVisibleMessageContent(message: Message) {
  return message.role === 'ai' ? cleanAiResponse(message.content) : message.content;
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

function extractRequestedCount(text: string, fallback: number) {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d{1,3})\s*(флеш|карточ|карт|событ|пункт|вопрос|слайд)/);
  if (match) return Math.min(200, Math.max(1, Number(match[1])));

  for (const [word, count] of Object.entries(NUMBER_WORDS)) {
    const pattern = new RegExp(`\\b${word}\\b\\s*(флеш|карточ|карт|событ|пункт|вопрос|слайд)`, 'i');
    if (pattern.test(lower)) return count;
  }

  return fallback;
}

function getChatContext(messages: Message[]) {
  return messages
    .slice(-16)
    .map(message => `${message.role === 'user' ? 'Пользователь' : 'Gemini'}: ${message.content.slice(0, 900)}`)
    .join('\n');
}

function needsPreviousTopic(text: string) {
  const lower = text.toLowerCase();
  return includesAny(lower, ['по этой теме', 'по нему', 'по ней', 'по этому', 'это', 'этой', 'тот же', 'предыдущ']);
}

function getTaskTopic(text: string, messages: Message[]) {
  const topic = extractTopic(text);
  const context = getChatContext(messages);
  if (!context || (topic && !needsPreviousTopic(text))) return topic || text;

  return [
    topic || text,
    '',
    'Контекст прошлой беседы:',
    context,
  ].join('\n');
}

async function askAi(
  prompt: string,
  mode: PlanifyAiMode = 'assistant',
  appState?: string,
  attachments?: AiAttachment[],
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
    body: {
      prompt,
      system: buildPlanifySystemPrompt({ mode, appState }),
      attachments,
    },
  });

  if (error) throw new Error(await getAiErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.text?.trim()) throw new Error('ИИ не вернул ответ');

  return cleanAiResponse(data.text);
}

function stripCodeFence(text: string) {
  return text.replace(/```json|```/g, '').trim();
}

function cleanupNoteText(text: string) {
  const clean = stripCodeFence(text).trim();

  try {
    const parsed = JSON.parse(clean) as { title?: unknown; content?: unknown; note?: unknown };
    const content = typeof parsed.content === 'string'
      ? parsed.content
      : typeof parsed.note === 'string'
        ? parsed.note
        : '';
    if (content.trim()) return content.trim();
  } catch {
    // If Gemini returned normal text, keep cleaning below.
  }

  return clean
    .split('\n')
    .filter(line => !/^\s*"?title"?\s*:/i.test(line))
    .filter(line => !/^\s*"?content"?\s*:/i.test(line))
    .map(line => line.replace(/^["{},\s]+|["{},\s]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

async function askAiForSchedule(prompt: string, appState?: string): Promise<AiScheduleResponse> {
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
  ].join('\n'), 'schedule', [`Сегодня: ${today}`, appState].filter(Boolean).join('\n\n'));

  return parseScheduleResponse(response);
}

function isFlashcardDraft(value: unknown): value is FlashcardDraft {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<FlashcardDraft>;
  return typeof card.question === 'string' && typeof card.answer === 'string';
}

async function askAiForFlashcards(
  prompt: string,
  attachments?: AiAttachment[],
  appState?: string,
): Promise<FlashcardAiResponse> {
  const requestedCount = extractRequestedCount(prompt, 12);
  const response = await askAi([
    `Запрос пользователя: ${prompt}`,
    appState ? `Контекст прошлой беседы и текущего приложения:\n${appState}` : '',
    attachments?.length ? `Пользователь прикрепил файл: ${attachments.map(file => file.name).join(', ')}` : '',
    `Точное количество карточек: ${requestedCount}`,
    'Создай учебную колоду флеш-карт.',
    'Если тема требует переводов, добавь перевод в answer. Если тема теоретическая, добавь краткое объяснение и пример в answer.',
    `Важно: верни ровно ${requestedCount} карточек, не меньше и не больше. Это не демо.`,
    'Верни только JSON без markdown.',
    'Формат: {"deckName":"название","description":"краткое описание","cards":[{"question":"вопрос","answer":"ответ"}]}',
    'Вопросы и ответы должны быть короткими, полезными и не повторяться.',
  ].filter(Boolean).join('\n'), 'flashcards', [`Запрошено карточек: ${requestedCount}`, appState].filter(Boolean).join('\n\n'), attachments);

  const cleanText = stripCodeFence(response);
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('ИИ не вернул JSON для флеш-карт');

  const parsed = JSON.parse(cleanText.slice(start, end + 1)) as Partial<FlashcardAiResponse>;
  let cards = Array.isArray(parsed.cards) ? parsed.cards.filter(isFlashcardDraft).slice(0, requestedCount) : [];
  if (!parsed.deckName || cards.length === 0) throw new Error('ИИ не смог создать флеш-карты');

  for (let attempt = 0; cards.length < requestedCount && attempt < 2; attempt++) {
    const missing = requestedCount - cards.length;
    const extraResponse = await askAi([
      `Исходный запрос пользователя: ${prompt}`,
      `Уже создано карточек: ${cards.length}`,
      `Нужно добавить ещё ровно ${missing} новых карточек.`,
      'Не повторяй уже созданные вопросы:',
      cards.map(card => `- ${card.question}`).join('\n'),
      'Верни только JSON без markdown.',
      'Формат: {"cards":[{"question":"вопрос","answer":"ответ"}]}',
    ].join('\n'), 'flashcards', [`Нужно добрать карточек: ${missing}`, appState].filter(Boolean).join('\n\n'), attachments);

    const cleanExtra = stripCodeFence(extraResponse);
    const extraStart = cleanExtra.indexOf('{');
    const extraEnd = cleanExtra.lastIndexOf('}');
    if (extraStart === -1 || extraEnd === -1 || extraEnd <= extraStart) continue;
    const extraParsed = JSON.parse(cleanExtra.slice(extraStart, extraEnd + 1)) as Partial<FlashcardAiResponse>;
    const extraCards = Array.isArray(extraParsed.cards) ? extraParsed.cards.filter(isFlashcardDraft) : [];
    const existingQuestions = new Set(cards.map(card => card.question.trim().toLowerCase()));
    cards = [
      ...cards,
      ...extraCards.filter(card => !existingQuestions.has(card.question.trim().toLowerCase())),
    ].slice(0, requestedCount);
  }

  if (cards.length < requestedCount) {
    const baseTopic = extractTopic(prompt) || prompt;
    while (cards.length < requestedCount) {
      const nextNumber = cards.length + 1;
      cards.push({
        question: `Вопрос ${nextNumber}: что важно знать по теме «${baseTopic}»?`,
        answer: `Кратко повтори ключевую идею ${nextNumber} по теме «${baseTopic}» и приведи пример.`,
      });
    }
  }

  return {
    deckName: parsed.deckName.slice(0, 80),
    description: (parsed.description ?? 'Колода создана ИИ').slice(0, 180),
    cards,
  };
}

interface AIPageProps {
  onNavigate?: (section: AppSection) => void;
}

export function AIPage({ onNavigate }: AIPageProps) {
  const [chats,      setChats]      = useState<Chat[]>(loadChats);
  const [activeChatId, setActiveChat] = useState<string | null>(chats[0]?.id ?? null);
  const [input,      setInput]      = useState('');
  const [typing,     setTyping]     = useState(false);
  const [attachment, setAttachment] = useState<AiAttachment | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId) ?? null;
  const messages   = activeChat?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function commitChats(nextChats: Chat[]) {
    setChats(nextChats);
    saveChats(nextChats);
  }

  function updateAiMessage(
    chatId: string,
    messageId: string,
    update: (message: Message) => Message,
  ) {
    setChats(prev => {
      const next = prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          messages: chat.messages.map(message => (
            message.id === messageId ? update(message) : message
          )),
        };
      });
      saveChats(next);
      return next;
    });
  }

  async function typeAiMessage(
    chatId: string,
    messageId: string,
    text: string,
    schedule?: PlannerDraftEvent[],
    addedToPlanner = false,
  ) {
    const chunks = getTypingChunks(text);
    let visibleText = '';

    for (const chunk of chunks) {
      visibleText += chunk;
      updateAiMessage(chatId, messageId, message => ({ ...message, content: visibleText }));
      await new Promise(resolve => window.setTimeout(resolve, 18));
    }

    updateAiMessage(chatId, messageId, message => ({ ...message, content: text, schedule, addedToPlanner }));
  }

  function newChat() {
    const chat: Chat = { id: uid(), title: 'Новый чат', time: getTime(), messages: [] };
    const updated = [chat, ...chats];
    commitChats(updated);
    setActiveChat(chat.id);
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        typeof result === 'string' ? resolve(result) : reject(new Error('Не получилось прочитать файл'));
      };
      reader.onerror = () => reject(new Error('Не получилось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        typeof result === 'string' ? resolve(result) : reject(new Error('Не получилось прочитать текст файла'));
      };
      reader.onerror = () => reject(new Error('Не получилось прочитать текст файла'));
      reader.readAsText(file);
    });
  }

  async function handleAttachment(file: File | undefined) {
    if (!file) return;
    const mimeType = file.type || 'application/octet-stream';

    if (mimeType.startsWith('text/')) {
      const text = await readFileAsText(file);
      setAttachment({
        name: file.name,
        mimeType,
        text: text.slice(0, 12000),
      });
      return;
    }

    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      const dataUrl = await readFileAsDataUrl(file);
      const data = dataUrl.split(',')[1];
      setAttachment({
        name: file.name,
        mimeType,
        data,
      });
      return;
    }

    setAttachment({
      name: file.name,
      mimeType,
      text: `Пользователь прикрепил файл ${file.name} (${mimeType}). Содержимое этого формата нельзя прочитать прямо в браузере.`,
    });
  }

  async function send(text?: string) {
    const selectedAttachment = attachment;
    const content = (text ?? input).trim() || (selectedAttachment ? 'Проанализируй прикреплённый файл' : '');
    if (!content) return;
    setInput('');
    setAttachment(null);

    let chatId = activeChatId;
    let currentChats = chats;

    // create chat if none
    if (!chatId) {
      const chat: Chat = { id: uid(), title: content.slice(0, 40), time: getTime(), messages: [] };
      currentChats = [chat, ...chats];
      chatId = chat.id;
      commitChats(currentChats);
      setActiveChat(chatId);
    }

    const userMsg: Message = { id: uid(), role: 'user', content, time: getTime() };
    const aiMessageId = uid();
    const pendingAiMsg: Message = { id: aiMessageId, role: 'ai', content: '', time: getTime() };
    const updated = currentChats.map(c =>
      c.id === chatId
        ? {
          ...c,
          title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
          messages: [...c.messages, userMsg, pendingAiMsg],
        }
        : c
    );
    commitChats(updated);

    setTyping(true);
    let aiContent = '';
    let schedule: PlannerDraftEvent[] | undefined;
    let targetNav: AppSection | undefined;
    let scheduleAlreadyAdded = false;
    const conversationMemory = getChatContext(messages);
    const appContext = [
      `Активный раздел: ИИ-помощник`,
      `Текущий запрос: ${content}`,
      selectedAttachment ? `Прикреплённый файл: ${selectedAttachment.name} (${selectedAttachment.mimeType})` : '',
      conversationMemory ? `История диалога:\n${conversationMemory}` : 'История диалога: новый чат',
    ].filter(Boolean).join('\n');
    const setStage = (stage: string) => {
      updateAiMessage(chatId, aiMessageId, message => ({ ...message, content: stage }));
    };

    try {
      const lower = content.toLowerCase();
      if (includesAny(lower, ['презентац'])) {
        setStage('Анализирую запрос и открываю генератор презентаций...');
        const presentationTopic = getTaskTopic(content, messages);
        localStorage.setItem(PRESENTATION_DRAFT_KEY, presentationTopic);
        targetNav = 'Генерация презентаций';
        aiContent = [
          `Открыл вкладку генерации презентаций и перенёс тему: «${presentationTopic}».`,
          'Дальше Planify учтёт количество слайдов, выбранный шаблон, создаст структуру, разные layout и финальный preview для скачивания.',
        ].join('\n');
      } else if (includesAny(lower, ['таймер', 'помодоро', 'фокус'])) {
        setStage('Настраиваю фокус-таймер...');
        const now = Date.now();
        const totalSec = 25 * 60;
        localStorage.setItem(TIMER_KEY, JSON.stringify({
          mode: 'focus',
          running: true,
          startedAt: now,
          totalSec,
          customMins: { focus: 25, short: 5, long: 15 },
        }));
        targetNav = 'Таймер';
        aiContent = 'Запустил фокус-таймер на 25 минут и открыл вкладку “Таймер”.';
      } else if (isExplicitFlashcardRequest(content)) {
        const requestedCount = extractRequestedCount(content, 12);
        setStage(`Создаю полноценную колоду: ${requestedCount} карточек...\nЭтап 1/3: анализ темы`);
        window.setTimeout(() => {
          setStage(`Создаю полноценную колоду: ${requestedCount} карточек...\nЭтап 2/3: формирую вопросы и ответы`);
        }, 900);
        const deck = await askAiForFlashcards(content, selectedAttachment ? [selectedAttachment] : undefined, appContext);
        setStage(`Создаю полноценную колоду: ${deck.cards.length} карточек...\nЭтап 3/3: сохраняю в Planify`);
        const { data, error } = await supabase.from('flashcard_decks')
          .insert({ name: deck.deckName, description: deck.description, color: EVENT_COLORS[0] })
          .select()
          .single();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Не получилось создать колоду');
        const { error: cardsError } = await supabase.from('flashcards').insert(
          deck.cards.map(card => ({
            deck_id: data.id,
            question: card.question,
            answer: card.answer,
          })),
        );
        if (cardsError) throw new Error(cardsError.message);
        targetNav = 'Флеш-карты';
        aiContent = `Создал колоду “${deck.deckName}” (${deck.cards.length} карточек) и открыл вкладку “Флеш-карты”.`;
      } else if (isExplicitNoteRequest(content)) {
        setStage('Анализирую материал и создаю структурированный конспект...');
        const noteText = await askAi([
          `Запрос пользователя: ${content}`,
          selectedAttachment ? `Пользователь прикрепил файл: ${selectedAttachment.name}` : '',
          'Создай аккуратный учебный конспект на русском.',
          'Не возвращай JSON. Не пиши поля title, content, note или другие технические ключи.',
          'Оформи как настоящий конспект: # главный заголовок, ## разделы, **важные термины**, списки через "-".',
          'Заголовки должны быть короткими, а пункты полезными и понятными.',
        ].filter(Boolean).join('\n'), 'notes', appContext, selectedAttachment ? [selectedAttachment] : undefined);
        const cleanNoteText = cleanupNoteText(noteText);
        const firstHeading = cleanNoteText.match(/^#\s+(.+)$/m)?.[1]?.trim();
        const title = (firstHeading || extractTopic(content) || 'Заметка от ИИ').slice(0, 70);
        const { error } = await supabase.from('notes').insert({
          title,
          content: cleanNoteText,
          tags: ['ai'],
          is_starred: false,
        });
        if (error) throw new Error(error.message);
        targetNav = 'Заметки';
        aiContent = `Создал заметку “${title}” и открыл вкладку “Заметки”.`;
      } else if (isScheduleRequest(content)) {
        setStage('Составляю расписание и готовлю события для планировщика...');
        const result = await askAiForSchedule(content, appContext);
        setStage(`Сохраняю ${result.events.length} событий в планировщик...`);
        const { error } = await supabase.from('planner_events').insert(
          result.events.map(event => ({
            title: event.title,
            description: event.description,
            hour: event.hour,
            end_hour: event.end_hour,
            color: event.color,
            event_date: event.event_date,
          })),
        );
        if (error) throw new Error(error.message);
        aiContent = `${result.reply}\n\nДобавил ${result.events.length} событий в планировщик и открыл вкладку “Планировщик”.`;
        schedule = result.events;
        scheduleAlreadyAdded = true;
        targetNav = 'Планировщик';
      } else {
        setStage('Думаю над запросом в контексте Planify...');
        aiContent = await askAi(content, 'assistant', appContext, selectedAttachment ? [selectedAttachment] : undefined);
      }
    } catch (error) {
      const message = await getAiErrorMessage(error);
      aiContent = `Не получилось получить ответ от ИИ.\n\nПроверь, что GEMINI_API_KEY добавлен в Supabase Secrets и функция ai задеплоена.\n\nДетали: ${message}`;
    } finally {
      setTyping(false);
    }

    await typeAiMessage(chatId, aiMessageId, aiContent, schedule, scheduleAlreadyAdded);
    if (targetNav) onNavigate?.(targetNav);
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

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(getVisibleMessageContent(message));
    setCopiedMessageId(message.id);
    setTimeout(() => {
      setCopiedMessageId(current => current === message.id ? null : current);
    }, 1600);
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

  function insertQuickPrompt(text: string) {
    setInput(current => current.trim() ? `${current.trimEnd()} ${text}` : text);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
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
            <button className="ai-hdr-btn" onClick={newChat}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Новый чат
            </button>
          </div>
        </div>

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
                    <button key={q} className="quick-btn" onClick={() => insertQuickPrompt(q)}>{q}</button>
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
                {m.role === 'ai' && !m.content ? (
                  <div className="typing-dots"><span/><span/><span/></div>
                ) : (
                  <div className="msg-text" style={{ whiteSpace: 'pre-wrap' }}>{getVisibleMessageContent(m)}</div>
                )}
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
                    <button
                      type="button"
                      className="msg-copy-btn"
                      onClick={() => copyMessage(m)}
                      disabled={!m.content}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      {copiedMessageId === m.id ? 'Скопировано' : 'Копировать'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef}/>
        </div>

        {/* input */}
        {attachment && (
          <div className="ai-attachment-chip">
            <span>{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="Убрать файл">×</button>
          </div>
        )}
        <div className="chat-input-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.md,.doc,.docx"
            style={{ display: 'none' }}
            onChange={event => {
              void handleAttachment(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <button className="attach-btn" title="Прикрепить файл" type="button" onClick={() => fileInputRef.current?.click()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <button className="send-btn" onClick={() => send()} disabled={!input.trim() && !attachment}>
            <svg className="send-icon" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21V3"/>
              <path d="M3.5 11.5L12 3l8.5 8.5"/>
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
          ИИ может ошибаться. Проверяй важную информацию.
        </div>
      </div>

      {/* ── RIGHT ── */}
      <div className="ai-right">

        {/* Recent chats */}
        <div className="panel ai-recent-panel">
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <span className="panel-title">Недавние чаты</span>
          </div>
          {chats.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
              Начни первый чат — здесь появится история
            </div>
          ) : (
            <div className="recent-chat-list">
              {chats.map(c => (
                <div key={c.id} className={`recent-chat-item${c.id === activeChatId ? ' active' : ''}`}
                  onClick={() => setActiveChat(c.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ flexShrink: 0, color: '#94A3B8' }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{c.time}</span>
                  <button className="recent-chat-delete" onClick={e => { e.stopPropagation(); deleteChat(c.id); }} aria-label="Удалить чат">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
