import { useState, useEffect, useRef } from 'react';
import type { SelectedTemplate } from './TemplateGallery';
import { supabase } from '../lib/supabase';

interface Slide { id: number; title: string; desc: string; }
interface AiSlideDraft { title: string; desc: string; }
interface AiFunctionResponse { text?: string; error?: string; }

interface Props {
  topic: string;
  selectedTemplate: SelectedTemplate | null;
  startMode: 'manual' | 'ai';
  onClose: () => void;
  onDone: (title: string, slidesCount: number) => void;
}

type Step = 'slides' | 'aiPreparing' | 'planning' | 'structure' | 'building' | 'complete';

const SLIDE_TEMPLATES: Array<{ title: string; desc: string }> = [
  { title: 'Введение',               desc: 'Общее введение в тему и основные понятия' },
  { title: 'История и предпосылки', desc: 'Исторический контекст и предпосылки развития' },
  { title: 'Основные понятия',       desc: 'Ключевые термины и определения по теме' },
  { title: 'Факты и данные',         desc: 'Важные факты, статистика и исследования' },
  { title: 'Примеры',                desc: 'Практические примеры и иллюстрации' },
  { title: 'Современное состояние',  desc: 'Актуальное положение дел и тенденции' },
  { title: 'Преимущества',           desc: 'Положительные аспекты и преимущества' },
  { title: 'Проблемы и вызовы',      desc: 'Существующие проблемы и пути решения' },
  { title: 'Перспективы развития',   desc: 'Будущие тенденции и перспективы' },
  { title: 'Практическое применение',desc: 'Как применять знания на практике' },
  { title: 'Международный опыт',     desc: 'Опыт других стран и организаций' },
  { title: 'Влияние на общество',    desc: 'Социальное и культурное влияние' },
  { title: 'Экономический аспект',   desc: 'Экономические факторы и последствия' },
  { title: 'Технологии',             desc: 'Технологические решения и инновации' },
  { title: 'Сравнительный анализ',   desc: 'Сравнение различных подходов' },
  { title: 'Ключевые выводы',        desc: 'Главные выводы и итоги' },
  { title: 'Рекомендации',           desc: 'Практические рекомендации и советы' },
  { title: 'Заключение',             desc: 'Подведение итогов и финальные мысли' },
  { title: 'Вопросы и ответы',       desc: 'Время для обсуждения' },
  { title: 'Список источников',      desc: 'Использованная литература и ссылки' },
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

export function PresentationModal({ topic, selectedTemplate, startMode, onClose, onDone }: Props) {
  const [step, setStep]               = useState<Step>(startMode === 'ai' ? 'aiPreparing' : 'slides');
  const [slidesCount, setSlidesCount] = useState(10);
  const [slides, setSlides]           = useState<Slide[]>([]);
  const [loadIdx, setLoadIdx]         = useState(0);
  const [aiNotice, setAiNotice]       = useState('');

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB';

  // Refs so effects always see latest values without re-running
  const slidesCountRef = useRef(slidesCount);
  slidesCountRef.current = slidesCount;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  function createSlides(count: number): Slide[] {
    return SLIDE_TEMPLATES.slice(0, count).map((t, idx) => ({
      id: idx + 1,
      title: t.title,
      desc: t.desc,
    }));
  }

  function isAiSlideDraft(value: unknown): value is AiSlideDraft {
    if (!value || typeof value !== 'object') return false;
    const maybeSlide = value as Partial<AiSlideDraft>;
    return typeof maybeSlide.title === 'string' && typeof maybeSlide.desc === 'string';
  }

  function parseAiSlides(text: string, count: number): Slide[] {
    const cleanText = text.replace(/```json|```/g, '').trim();
    const start = cleanText.indexOf('[');
    const end = cleanText.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI ответил без JSON-массива');

    const parsed: unknown = JSON.parse(cleanText.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error('AI ответил в неверном формате');

    const drafts = parsed.filter(isAiSlideDraft).slice(0, count);
    if (drafts.length === 0) throw new Error('AI не вернул слайды');

    return drafts.map((slide, idx) => ({
      id: idx + 1,
      title: slide.title.slice(0, 80),
      desc: slide.desc.slice(0, 160),
    }));
  }

  async function createSlidesWithAi(count: number): Promise<Slide[]> {
    const styleText = selectedTemplate
      ? `Выбранный дизайн: ${selectedTemplate.templateName}, стиль ${selectedTemplate.style}, цвета ${selectedTemplate.colors.join(', ')}.`
      : 'Дизайн не выбран, подбери нейтральный современный стиль.';

    const prompt = [
      `Тема презентации: ${topic}`,
      `Количество слайдов: ${count}`,
      styleText,
      'Верни только JSON-массив без markdown.',
      'Формат каждого элемента: {"title":"короткий заголовок","desc":"1 короткое описание слайда"}.',
    ].join('\n');

    const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
      body: {
        prompt,
        system: 'Ты помогаешь школьнику создать понятную структуру презентации. Пиши на русском, кратко и по делу.',
      },
    });

    if (error) throw new Error(error.message);
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
      .catch(() => {
        setAiNotice('Gemini пока недоступен, поэтому подготовили базовую структуру.');
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
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < PLANNING_STEPS.length) {
        setLoadIdx(i);
      } else {
        clearInterval(id);
        const count = slidesCountRef.current;
        setSlides(createSlides(count));
        setTimeout(() => setStep('structure'), 400);
      }
    }, STEP_DURATIONS.planning);
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
          setStep('complete');
          onDoneRef.current(topic, slidesCountRef.current);
        }, 500);
      }
    }, STEP_DURATIONS.building);
    return () => clearInterval(id);
  }, [step, topic]);

  function updateSlide(id: number, field: 'title' | 'desc', value: string) {
    setSlides(s => s.map(sl => sl.id === id ? { ...sl, [field]: value } : sl));
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
      <div className="pres-modal" onClick={e => e.stopPropagation()}>

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
              Можно редактировать названия и описания перед созданием
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
                    <input
                      className="pres-slide-input"
                      value={sl.title}
                      onChange={e => updateSlide(sl.id, 'title', e.target.value)}
                      style={{ fontWeight: 700, fontSize: 14 }}
                    />
                    <input
                      className="pres-slide-input"
                      value={sl.desc}
                      onChange={e => updateSlide(sl.id, 'desc', e.target.value)}
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

        {/* ── STEP 5: complete ── */}
        {step === 'complete' && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
            <p className="pres-modal-title" style={{ marginBottom: 8 }}>Презентация готова!</p>
            <p style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 28 }}>
              «{topic}» — {slidesCount} слайдов создано и сохранено
              {selectedTemplate ? ` в стиле ${selectedTemplate.templateName}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '11px 22px', borderRadius: 12,
                  border: `2px solid ${primaryColor}`, background: 'transparent',
                  color: primaryColor, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Закрыть
              </button>
              <button style={{
                padding: '11px 22px', borderRadius: 12, border: 'none',
                background: primaryColor, color: '#fff', fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Скачать PPTX
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
