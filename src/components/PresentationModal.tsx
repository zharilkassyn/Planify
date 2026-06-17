import { useState, useEffect, useRef } from 'react';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import type { SelectedTemplate } from './TemplateGallery';
import { normalizeLayout, sanitizeList, type PresentationSlide, type SlideComparison, type SlideStat, type SlideTimelineItem } from './LayoutSystem';
import { PresentationPreview } from './PresentationPreview';
import { renderSlideToImage } from './SlideRenderer';
import { getPresentationTheme } from './TemplateEngine';
import { supabase } from '../lib/supabase';

interface AiSlideDraft {
  number?: number;
  title?: string;
  subtitle?: string;
  content?: unknown;
  layout?: string;
  visual?: string;
  visualPrompt?: string;
  stats?: unknown;
  comparison?: unknown;
  timeline?: unknown;
}

interface AiFunctionResponse { text?: string; error?: string; }
type DownloadFormat = 'pdf' | 'pptx';

interface Props {
  topic: string;
  selectedTemplate: SelectedTemplate | null;
  startMode: 'manual' | 'ai';
  onClose: () => void;
  onDone: (title: string, slidesCount: number) => void;
}

type Step = 'slides' | 'aiPreparing' | 'planning' | 'structure' | 'building' | 'preview';

const SLIDE_TEMPLATES: Array<{ title: string; subtitle: string; content: string[]; visual: string }> = [
  { title: 'Введение', subtitle: 'Почему тема важна и что зритель узнает', content: ['Контекст темы', 'Главная идея', 'Цель презентации'], visual: 'Большая тематическая иллюстрация' },
  { title: 'Ключевая идея', subtitle: 'Короткое объяснение сути простыми словами', content: ['Определение', 'Основные принципы', 'Где встречается'], visual: 'Иконки и смысловые блоки' },
  { title: 'Основные направления', subtitle: 'Как тема делится на понятные части', content: ['Направление 1', 'Направление 2', 'Направление 3'], visual: 'Карточки с акцентами' },
  { title: 'Этапы развития', subtitle: 'Как менялась тема со временем', content: ['Начало', 'Рост', 'Современный этап'], visual: 'Временная шкала' },
  { title: 'Факты и данные', subtitle: 'Что показывают цифры и наблюдения', content: ['Рост интереса', 'Практическая польза', 'Влияние на людей'], visual: 'Графики и крупные числа' },
  { title: 'Сравнение подходов', subtitle: 'Чем отличаются разные варианты', content: ['Сильные стороны', 'Ограничения', 'Когда применять'], visual: 'Две колонки сравнения' },
  { title: 'Практические примеры', subtitle: 'Где это можно увидеть в жизни', content: ['Пример из учебы', 'Пример из работы', 'Пример из повседневности'], visual: 'Сценарии применения' },
  { title: 'Главные выводы', subtitle: 'Что нужно запомнить после презентации', content: ['Главная мысль', 'Практическая польза', 'Следующий шаг'], visual: 'Финальный визуальный акцент' },
];

const PLANNING_STEPS = [
  'Анализируем тему...',
  'Создаём план...',
  'Распределяем информацию по слайдам...',
];

const AI_PREP_STEPS = [
  'Анализируем тему',
  'Создаем структуру',
  'Подбираем дизайн',
  'Готовим слайды',
];

const BUILDING_STEPS = [
  'Создаём дизайн...',
  'Добавляем изображения...',
  'Формируем слайды...',
  'Готово! ✓',
];

const STEP_DURATIONS = { planning: 1100, building: 950 };
const SLIDE_W = 1280;
const SLIDE_H = 720;

export function PresentationModal({ topic, selectedTemplate, startMode, onClose, onDone }: Props) {
  void startMode;
  const [step, setStep]               = useState<Step>('slides');
  const [slidesCount, setSlidesCount] = useState(10);
  const [slides, setSlides]           = useState<PresentationSlide[]>([]);
  const [loadIdx, setLoadIdx]         = useState(0);
  const [aiNotice, setAiNotice]       = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB';
  const theme = getPresentationTheme(selectedTemplate);

  // Refs so effects always see latest values without re-running
  const slidesCountRef = useRef(slidesCount);
  slidesCountRef.current = slidesCount;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  function createSlides(count: number): PresentationSlide[] {
    const base = [
      {
        title: topic.slice(0, 80) || 'Тема презентации',
        subtitle: 'Краткое введение: почему эта тема важна и что зритель узнает из презентации.',
        content: ['Почему это важно', 'Что будет разобрано', 'Как применить знания'],
        visual: 'Тематическая обложка',
      },
      ...SLIDE_TEMPLATES,
    ];
    return base.slice(0, count).map((slide, idx) => normalizeSlideDraft(slide, idx, count));
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

  function parseAiSlides(text: string, count: number): PresentationSlide[] {
    const cleanText = text.replace(/```json|```/g, '').trim();
    const objectStart = cleanText.indexOf('{');
    const objectEnd = cleanText.lastIndexOf('}');
    const arrayStart = cleanText.indexOf('[');
    const arrayEnd = cleanText.lastIndexOf(']');
    if (objectStart === -1 && arrayStart === -1) throw new Error('AI ответил без JSON');

    const jsonText = objectStart !== -1 && objectEnd > objectStart
      ? cleanText.slice(objectStart, objectEnd + 1)
      : cleanText.slice(arrayStart, arrayEnd + 1);

    const parsed: unknown = JSON.parse(jsonText);
    const rawSlides = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { slides?: unknown }).slides)
        ? (parsed as { slides: unknown[] }).slides
        : [];

    const drafts = rawSlides.filter((value): value is AiSlideDraft => Boolean(value && typeof value === 'object')).slice(0, count);
    if (drafts.length === 0) throw new Error('AI не вернул слайды');

    return drafts.map((slide, idx) => normalizeSlideDraft(slide, idx, count));
  }

  function normalizeSlideDraft(slide: AiSlideDraft | { title: string; subtitle: string; content: string[]; visual: string }, idx: number, total: number): PresentationSlide {
    const fallback = SLIDE_TEMPLATES[idx % SLIDE_TEMPLATES.length];
    const content = sanitizeList('content' in slide ? slide.content : undefined, fallback.content);
    const layout = normalizeLayout('layout' in slide ? slide.layout : undefined, idx, total);
    const title = typeof slide.title === 'string' && slide.title.trim() ? slide.title.trim() : fallback.title;
    const subtitle = typeof slide.subtitle === 'string' && slide.subtitle.trim() ? slide.subtitle.trim() : fallback.subtitle;
    const visual = typeof slide.visual === 'string' && slide.visual.trim() ? slide.visual.trim() : fallback.visual;
    const rawVisualPrompt = 'visualPrompt' in slide ? slide.visualPrompt : undefined;
    const visualPrompt = typeof rawVisualPrompt === 'string' && rawVisualPrompt.trim()
      ? rawVisualPrompt.trim()
      : `${visual} for presentation about ${topic}, ${selectedTemplate?.templateName ?? 'modern clean style'}`;

    return {
      id: idx + 1,
      number: idx + 1,
      title: title.slice(0, 92),
      subtitle: subtitle.slice(0, 150),
      content,
      layout,
      visual,
      visualPrompt,
      stats: normalizeStats(slide, content),
      comparison: normalizeComparison(slide, content),
      timeline: normalizeTimeline(slide, content),
    };
  }

  function normalizeStats(slide: AiSlideDraft | { content: string[] }, content: string[]): SlideStat[] {
    const source = 'stats' in slide && Array.isArray(slide.stats) ? slide.stats : [];
    const stats = source
      .filter((item): item is { value?: unknown; label?: unknown } => Boolean(item && typeof item === 'object'))
      .map(item => ({
        value: typeof item.value === 'string' ? item.value.slice(0, 12) : '3x',
        label: typeof item.label === 'string' ? item.label.slice(0, 52) : 'важный показатель',
      }))
      .slice(0, 3);
    return stats.length ? stats : content.slice(0, 3).map((item, idx) => ({ value: ['3', '7', '90%'][idx] ?? `${idx + 1}`, label: item }));
  }

  function normalizeTimeline(slide: AiSlideDraft | { content: string[] }, content: string[]): SlideTimelineItem[] {
    const source = 'timeline' in slide && Array.isArray(slide.timeline) ? slide.timeline : [];
    const timeline = source
      .filter((item): item is { label?: unknown; text?: unknown } => Boolean(item && typeof item === 'object'))
      .map((item, idx) => ({
        label: typeof item.label === 'string' ? item.label.slice(0, 18) : `Этап ${idx + 1}`,
        text: typeof item.text === 'string' ? item.text.slice(0, 72) : content[idx] ?? 'Ключевой этап',
      }))
      .slice(0, 4);
    return timeline.length ? timeline : content.slice(0, 4).map((item, idx) => ({ label: `Этап ${idx + 1}`, text: item }));
  }

  function normalizeComparison(slide: AiSlideDraft | { content: string[] }, content: string[]): SlideComparison | undefined {
    const comparison = 'comparison' in slide ? slide.comparison : undefined;
    if (comparison && typeof comparison === 'object') {
      const maybe = comparison as { leftTitle?: unknown; left?: unknown; rightTitle?: unknown; right?: unknown };
      return {
        leftTitle: typeof maybe.leftTitle === 'string' ? maybe.leftTitle.slice(0, 36) : 'Подход A',
        left: sanitizeList(maybe.left, content.slice(0, 3)),
        rightTitle: typeof maybe.rightTitle === 'string' ? maybe.rightTitle.slice(0, 36) : 'Подход B',
        right: sanitizeList(maybe.right, content.slice(1, 4)),
      };
    }

    return {
      leftTitle: 'Плюсы',
      left: content.slice(0, 3),
      rightTitle: 'Важно учесть',
      right: content.slice(1, 4).length ? content.slice(1, 4) : content,
    };
  }

  async function createSlidesWithAi(count: number): Promise<PresentationSlide[]> {
    const styleText = selectedTemplate
      ? `Выбранный дизайн: ${selectedTemplate.templateName}, стиль ${selectedTemplate.style}, цвета ${selectedTemplate.colors.join(', ')}.`
      : 'Дизайн не выбран, подбери нейтральный современный стиль.';

    const prompt = [
      `Тема презентации: ${topic}`,
      `Количество слайдов: ${count}`,
      styleText,
      'Создай профессиональную структуру презентации как Gamma/Canva AI, не просто текст.',
      'Верни только JSON-объект без markdown в формате {"slides":[...]}.',
      'Каждый слайд: {"number":1,"title":"...","subtitle":"...","content":["коротко","коротко","коротко"],"layout":"title|text-image|cards|timeline|statistics|comparison|conclusion","visual":"что видно на слайде","visualPrompt":"точный промпт для иллюстрации","stats":[{"value":"75%","label":"..."}],"comparison":{"leftTitle":"...","left":["..."],"rightTitle":"...","right":["..."]},"timeline":[{"label":"...","text":"..."}]}.',
      'Используй разные layout: первый title, последний conclusion, между ними text-image, cards, timeline, statistics, comparison.',
      'Текст должен быть короткий, читаемый, без длинных абзацев. Каждый visualPrompt должен описывать конкретную иллюстрацию, а не случайные слова.',
      'Дизайн и визуальные подсказки должны соответствовать выбранному шаблону.',
    ].join('\n');

    const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
      body: {
        prompt,
        system: 'Ты senior AI presentation designer. Создавай русскоязычные слайды с разными layout, визуальной иерархией, коротким текстом и точными visualPrompt. Возвращай только валидный JSON.',
      },
    });

    if (error) throw new Error(await getAiErrorMessage(error));
    if (data?.error) throw new Error(data.error);
    if (!data?.text) throw new Error('AI не вернул текст');

    return parseAiSlides(data.text, count);
  }

  /* ── AI quick preparation ── */
  useEffect(() => {
    if (step !== 'aiPreparing') return;
    setLoadIdx(0);
    setAiNotice('');
    let cancelled = false;
    let stage = 0;

    const id = setInterval(() => {
      stage++;
      if (stage < AI_PREP_STEPS.length) {
        setLoadIdx(stage);
      } else if (stage === AI_PREP_STEPS.length) {
        clearInterval(id);
      }
    }, 950);

    createSlidesWithAi(slidesCountRef.current)
      .catch(async error => {
        const message = await getAiErrorMessage(error);
        setAiNotice(`Gemini пока недоступен, поэтому подготовили базовую структуру. Причина: ${message}`);
        return createSlides(slidesCountRef.current);
      })
      .then(generated => {
        if (cancelled) return;
        window.setTimeout(() => {
          if (cancelled) return;
          setLoadIdx(AI_PREP_STEPS.length - 1);
          setSlides(generated);
          setStep('structure');
        }, Math.max(650, (AI_PREP_STEPS.length - stage) * 700));
      });

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step]);

  /* ── Planning loading ── */
  useEffect(() => {
    if (step !== 'planning') return;
    setLoadIdx(0);
    setAiNotice('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < PLANNING_STEPS.length) {
        setLoadIdx(i);
      } else {
        clearInterval(id);
      }
    }, STEP_DURATIONS.planning);

    createSlidesWithAi(slidesCountRef.current)
      .catch(async error => {
        const message = await getAiErrorMessage(error);
        setAiNotice(`Gemini пока недоступен, поэтому подготовили базовый план. Причина: ${message}`);
        return createSlides(slidesCountRef.current);
      })
      .then(generated => {
        setSlides(generated);
        setLoadIdx(PLANNING_STEPS.length - 1);
        setTimeout(() => setStep('structure'), 500);
      });

    return () => clearInterval(id);
  }, [step]);

  /* ── Building loading ── */
  useEffect(() => {
    if (step !== 'building') return;
    setLoadIdx(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < BUILDING_STEPS.length) {
        setLoadIdx(i);
      } else {
        clearInterval(id);
        setTimeout(() => {
          setStep('preview');
          onDoneRef.current(topic, slidesCountRef.current);
        }, 500);
      }
    }, STEP_DURATIONS.building);
    return () => clearInterval(id);
  }, [step, topic]);

  function updateSlide(id: number, field: 'title' | 'subtitle' | 'content', value: string) {
    setSlides(s => s.map(sl => {
      if (sl.id !== id) return sl;
      if (field === 'content') {
        return {
          ...sl,
          content: value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 4),
        };
      }
      return { ...sl, [field]: value };
    }));
  }

  function safeFileName() {
    const clean = topic.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').slice(0, 48);
    return clean || 'presentation';
  }

  async function downloadPresentation(format: DownloadFormat) {
    setDownloadOpen(false);
    setDownloadStatus(format === 'pdf' ? 'Готовим PDF...' : 'Готовим PPTX...');
    try {
      if (format === 'pdf') {
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_W, SLIDE_H] });
        slides.forEach((slide, index) => {
          if (index > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
          pdf.addImage(renderSlideToImage(slide, index, slides.length, topic, theme), 'PNG', 0, 0, SLIDE_W, SLIDE_H);
        });
        pdf.save(`${safeFileName()}.pdf`);
      } else {
        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = 'Planify';
        slides.forEach((slide, index) => {
          const pptSlide = pptx.addSlide();
          pptSlide.background = { color: theme.dark ? '0F172A' : 'FFFFFF' };
          pptSlide.addImage({
            data: renderSlideToImage(slide, index, slides.length, topic, theme),
            x: 0,
            y: 0,
            w: 13.333,
            h: 7.5,
          });
        });
        await pptx.writeFile({ fileName: `${safeFileName()}.pptx` });
      }
      setDownloadStatus('Файл скачан');
      window.setTimeout(() => setDownloadStatus(''), 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setDownloadStatus(`Не получилось скачать файл: ${message}`);
    }
  }

  // Slider: compute thumb position for the floating number
  const MIN = 5, MAX = 20;
  const sliderPct = (slidesCount - MIN) / (MAX - MIN); // 0..1
  // Correct for thumb radius (≈13px) so label stays centred over thumb
  const thumbLeft = `calc(${sliderPct * 100}% - ${sliderPct * 26 - 13}px)`;
  const aiProgress = Math.round(((loadIdx + 1) / AI_PREP_STEPS.length) * 100);

  /* ── Loading indicator helper ── */
  function LoadingRows({ steps }: { steps: string[] }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
        {steps.map((text, i) => {
          const isDone    = i < loadIdx;
          const isActive  = i === loadIdx;
          return (
            <div key={i} className={`pres-load-row${isDone ? ' done' : isActive ? ' active' : ''}`}>
              {/* State icon */}
              {isDone ? (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: primaryColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5">
                    <polyline points="1.5 6 4.5 9 10.5 3"/>
                  </svg>
                </div>
              ) : isActive ? (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${primaryColor}`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  animation: 'pulse 1s ease-in-out infinite',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: primaryColor }}/>
                </div>
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '2px solid var(--border)' }}/>
              )}
              <span style={{
                fontSize: 14,
                fontWeight: isDone || isActive ? 600 : 400,
                color: isDone || isActive ? 'var(--ink)' : 'var(--soft)',
                transition: 'all 0.3s',
              }}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pres-overlay" onClick={onClose}>
      <div className={`pres-modal${step === 'preview' ? ' pres-modal-preview' : ''}`} onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button className="pres-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* ── STEP 1: slide count ── */}
        {step === 'slides' && (
          <div>
            <p className="pres-modal-title" style={{ marginBottom: 2 }}>Выберите количество слайдов</p>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--soft)', marginBottom: 36 }}>
              Тема: «{topic}»
            </p>
            {selectedTemplate && (
              <div className="pres-template-note">
                <div className="pres-template-dots" aria-hidden="true">
                  {selectedTemplate.colors.map(color => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </div>
                <span>Дизайн: {selectedTemplate.templateName}</span>
              </div>
            )}

            {/* Floating number above thumb */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <div style={{
                position: 'absolute',
                left: thumbLeft,
                bottom: 0,
                width: 64,
                textAlign: 'center',
                pointerEvents: 'none',
                transition: 'left 0.05s linear',
              }}>
                <div style={{ fontSize: 58, fontWeight: 900, color: primaryColor, lineHeight: 1 }}>
                  {slidesCount}
                </div>
                <div style={{ fontSize: 13, color: 'var(--soft)', marginTop: 2 }}>слайдов</div>
              </div>
              {/* Spacer for the number */}
              <div style={{ height: 88 }}/>
            </div>

            {/* Slider */}
            <div style={{ padding: '0 4px' }}>
              <input
                type="range"
                className="pres-slider"
                min={MIN} max={MAX}
                value={slidesCount}
                onChange={e => setSlidesCount(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${sliderPct * 100}%, var(--border) ${sliderPct * 100}%, var(--border) 100%)`,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--soft)', marginTop: 6 }}>
                <span>5</span><span>20</span>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--soft)', margin: '20px 0 28px' }}>
              ИИ создаст презентацию из выбранного количества слайдов
            </p>

            <button
              onClick={() => setStep('planning')}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                border: 'none', background: primaryColor, color: '#fff',
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              Дальше
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── AI FAST PREPARATION ── */}
        {step === 'aiPreparing' && (
          <div style={{ textAlign: 'center' }}>
            <div className="pres-ai-sparkle">✨</div>
            <p className="pres-modal-title">ИИ готовит презентацию</p>
            <p style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 18 }}>«{topic}»</p>

            <div className="pres-ai-progress">
              <div className="pres-ai-progress-top">
                <span>{AI_PREP_STEPS[loadIdx]}</span>
                <strong>{aiProgress}%</strong>
              </div>
              <div className="pres-ai-progress-track">
                <div style={{ width: `${aiProgress}%` }} />
              </div>
            </div>

            <LoadingRows steps={AI_PREP_STEPS} />
            {aiNotice && <p className="pres-ai-notice">{aiNotice}</p>}
          </div>
        )}

        {/* ── STEP 2: planning ── */}
        {step === 'planning' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 20 }}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="1.5"
                style={{ animation: 'spin 1.4s linear infinite' }}>
                <path d="M12 2L9 9H2l5.5 4L5 20l7-4.5L19 20l-2.5-7L22 9h-7z"/>
              </svg>
            </div>
            <p className="pres-modal-title">ИИ готовит структуру</p>
            <p style={{ fontSize: 13, color: 'var(--soft)' }}>Анализируем тему и создаём план</p>
            <LoadingRows steps={PLANNING_STEPS} />
          </div>
        )}

        {/* ── STEP 3: editable structure ── */}
        {step === 'structure' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p className="pres-modal-title" style={{ textAlign: 'left' }}>Структура готова</p>
              <span style={{
                fontSize: 12, color: 'var(--soft)', background: 'var(--bg)',
                padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)',
                whiteSpace: 'nowrap',
              }}>
                {slidesCount} слайдов
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 18 }}>
              Можно редактировать названия, подзаголовки и ключевые блоки перед созданием
            </p>
            {aiNotice && <p className="pres-ai-notice structure">{aiNotice}</p>}

            {/* Slide cards — scrollable */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto', paddingRight: 2, marginBottom: 20 }}>
              {slides.map(sl => (
                <div key={sl.id} className="pres-slide-card">
                  {/* Number badge */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: primaryColor + '18', color: primaryColor,
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sl.id}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div className="pres-slide-layout-pill">{sl.layout}</div>
                    <input
                      className="pres-slide-input"
                      value={sl.title}
                      onChange={e => updateSlide(sl.id, 'title', e.target.value)}
                      style={{ fontWeight: 700, fontSize: 14 }}
                    />
                    <input
                      className="pres-slide-input"
                      value={sl.subtitle}
                      onChange={e => updateSlide(sl.id, 'subtitle', e.target.value)}
                      style={{ fontSize: 12, color: 'var(--soft)' }}
                    />
                    <textarea
                      className="pres-slide-input pres-slide-textarea"
                      value={sl.content.join('\n')}
                      onChange={e => updateSlide(sl.id, 'content', e.target.value)}
                      rows={2}
                      style={{ fontSize: 12, color: 'var(--soft)' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep('building')}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                border: 'none', background: primaryColor, color: '#fff',
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L9 9H2l5.5 4L5 20l7-4.5L19 20l-2.5-7L22 9h-7z"/>
              </svg>
              Создать презентацию
            </button>
          </div>
        )}

        {/* ── STEP 4: building ── */}
        {step === 'building' && (
          <div style={{ textAlign: 'center' }}>
            {/* Circular progress */}
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 20px' }}>
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke={primaryColor + '20'} strokeWidth="7"/>
                <circle cx="44" cy="44" r="36" fill="none" stroke={primaryColor} strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={2 * Math.PI * 36 * (1 - (loadIdx + 1) / BUILDING_STEPS.length)}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '44px 44px', transition: 'stroke-dashoffset 0.7s ease' }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: primaryColor,
              }}>
                {Math.round(((loadIdx + 1) / BUILDING_STEPS.length) * 100)}%
              </div>
            </div>

            <p className="pres-modal-title">Создаём презентацию</p>
            <p style={{ fontSize: 13, color: 'var(--soft)' }}>«{topic}»</p>
            {selectedTemplate && (
              <p style={{ fontSize: 12, color: primaryColor, fontWeight: 700, marginTop: 8 }}>
                Стиль: {selectedTemplate.templateName}
              </p>
            )}
            <LoadingRows steps={BUILDING_STEPS} />
          </div>
        )}

        {/* ── STEP 5: preview ── */}
        {step === 'preview' && (
          <PresentationPreview
            slides={slides}
            topic={topic}
            theme={theme}
            selectedTemplateName={selectedTemplate?.templateName}
            downloadOpen={downloadOpen}
            downloadStatus={downloadStatus}
            onToggleDownload={() => setDownloadOpen(v => !v)}
            onDownload={downloadPresentation}
          />
        )}
      </div>
    </div>
  );
}
