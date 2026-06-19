import { useState, useEffect, useRef } from 'react';
import pptxgen from 'pptxgenjs';
import { jsPDF } from 'jspdf';
import type { SelectedTemplate } from './TemplateGallery';
import type { PresentationSlide } from './LayoutSystem';
import { createFallbackSlides } from './SlideBuilder';
import { generatePresentationStructure, type Audience, type InformationLevel } from './PresentationGenerator';
import { PresentationPreview } from './PresentationPreview';
import { renderSlideToImage } from './SlideRenderer';
import { getPresentationTheme } from './TemplateEngine';
import { supabase } from '../lib/supabase';

interface AiFunctionResponse { text?: string; error?: string; }
type DownloadFormat = 'pdf' | 'pptx';

export interface PresentationAttachment {
  name: string;
  type: string;
  dataUrl: string;
}

interface Props {
  topic: string;
  selectedTemplate: SelectedTemplate | null;
  startMode: 'manual' | 'ai';
  initialSlides?: PresentationSlide[];
  attachment?: PresentationAttachment | null;
  onClose: () => void;
  onDone: (title: string, slidesCount: number, slides: PresentationSlide[]) => void;
}

type Step = 'settings' | 'aiPreparing' | 'planning' | 'structure' | 'building' | 'preview';

const INFORMATION_LEVELS: Array<{ value: InformationLevel; title: string; desc: string }> = [
  { value: 'brief', title: 'Краткая', desc: 'Главные мысли, мало текста, больше визуалов' },
  { value: 'standard', title: 'Стандартная', desc: 'Баланс текста и изображений, подходит для учебы' },
  { value: 'detailed', title: 'Подробная', desc: 'Больше объяснений, фактов и контента' },
];

const AUDIENCES: Array<{ value: Audience; title: string }> = [
  { value: 'school', title: 'Школьники' },
  { value: 'students', title: 'Студенты' },
  { value: 'business', title: 'Бизнес' },
  { value: 'professionals', title: 'Профессионалы' },
];

const PLANNING_STEPS = [
  'Анализируем тему...',
  'Создаём план...',
  'Пишем image prompts...',
  'Генерируем изображения...',
  'Распределяем layouts...',
];

const AI_PREP_STEPS = [
  'Анализируем тему',
  'Создаем структуру',
  'Подбираем дизайн',
  'Готовим слайды',
];

const BUILDING_STEPS = [
  'Применяем TemplateEngine...',
  'Добавляем изображения...',
  'Строим разные layouts...',
  'Готово! ✓',
];

const STEP_DURATIONS = { planning: 450, building: 220 };
const SLIDE_W = 1280;
const SLIDE_H = 720;

export function PresentationModal({ topic, selectedTemplate, startMode, initialSlides, attachment, onClose, onDone }: Props) {
  const [step, setStep]               = useState<Step>(
    initialSlides?.length ? 'preview' : startMode === 'ai' ? 'aiPreparing' : 'settings',
  );
  const [slidesCount, setSlidesCount] = useState(initialSlides?.length || 10);
  const [informationLevel, setInformationLevel] = useState<InformationLevel>('standard');
  const [audience, setAudience] = useState<Audience>('school');
  const [slides, setSlides]           = useState<PresentationSlide[]>(initialSlides ?? []);
  const [pendingAttachment, setPendingAttachment] = useState<PresentationAttachment | null>(attachment ?? null);
  const [selectedAttachmentSlide, setSelectedAttachmentSlide] = useState(1);
  const [loadIdx, setLoadIdx]         = useState(0);
  const [aiNotice, setAiNotice]       = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB';
  const theme = getPresentationTheme(selectedTemplate);

  // Refs so effects always see latest values without re-running
  const slidesCountRef = useRef(slidesCount);
  slidesCountRef.current = slidesCount;
  const informationLevelRef = useRef(informationLevel);
  informationLevelRef.current = informationLevel;
  const audienceRef = useRef(audience);
  audienceRef.current = audience;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  function createSlides(count: number): PresentationSlide[] {
    return createFallbackSlides(topic, count, selectedTemplate, informationLevelRef.current, audienceRef.current);
  }

  function shorten(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function buildSlideContentFromTitle(slide: PresentationSlide, nextTitle: string): PresentationSlide {
    const cleanTitle = nextTitle.trim();
    if (!cleanTitle) return { ...slide, title: nextTitle };

    const topicTitle = topic.trim() || 'презентация';
    const section = shorten(cleanTitle, 70);
    const attachedFileLabel = slide.content.find(item => item.startsWith('Файл: '));
    const generatedContent = [
      shorten(`Главная идея раздела: ${section}`, 70),
      shorten(`Ключевые факты и примеры по теме`, 70),
      shorten(`Почему это важно для темы «${topicTitle}»`, 70),
      'Короткий вывод для запоминания',
    ];
    const content = attachedFileLabel
      ? [attachedFileLabel, ...generatedContent].slice(0, 4)
      : generatedContent;
    const visual = shorten(`Визуальная метафора для раздела «${section}»`, 90);
    const visualPrompt = [
      visual,
      `Topic: ${topicTitle}`,
      `Slide title: ${section}`,
      `Layout: ${slide.layout}`,
      selectedTemplate ? `Style: ${selectedTemplate.style}` : 'modern educational presentation style',
      'clear presentation visual, no text labels, no watermark',
    ].join(', ');

    return {
      ...slide,
      title: nextTitle,
      subtitle: shorten(`Что важно понять про раздел «${section}».`, 150),
      content,
      visual,
      visualPrompt,
      imageDataUrl: slide.imageDataUrl,
      stats: content.slice(0, 3).map((item, index) => ({
        value: String(index + 1),
        label: item,
      })),
      comparison: {
        leftTitle: 'Главное',
        left: content.slice(0, 2),
        rightTitle: 'Важно учесть',
        right: content.slice(2, 4),
      },
      timeline: content.map((item, index) => ({
        label: `Шаг ${index + 1}`,
        text: item,
      })),
      quote: shorten(`«${section}» помогает лучше раскрыть тему презентации.`, 160),
      attribution: topicTitle,
    };
  }

  function addAttachmentToSlide(slide: PresentationSlide, file: PresentationAttachment): PresentationSlide {
    const isImage = file.type.startsWith('image/');
    const fileLabel = `Файл: ${file.name}`;
    const content = [
      fileLabel,
      ...slide.content.filter(item => item !== fileLabel),
    ].slice(0, 4);

    return {
      ...slide,
      layout: 'text-image',
      content,
      visual: isImage ? `Загруженное изображение: ${file.name}` : `Загруженный документ: ${file.name}`,
      visualPrompt: isImage
        ? `User uploaded image for slide "${slide.title}": ${file.name}`
        : `User uploaded document for slide "${slide.title}": ${file.name}`,
      useImage: isImage ? true : slide.useImage,
      imageDataUrl: isImage ? file.dataUrl : slide.imageDataUrl,
      stats: content.slice(0, 3).map((item, index) => ({
        value: index === 0 ? 'FILE' : String(index + 1),
        label: item,
      })),
      timeline: content.map((item, index) => ({
        label: index === 0 ? 'Файл' : `Шаг ${index + 1}`,
        text: item,
      })),
    };
  }

  function applyPendingAttachment() {
    if (!pendingAttachment) return;
    setSlides(currentSlides => currentSlides.map(slide => (
      slide.id === selectedAttachmentSlide
        ? addAttachmentToSlide(slide, pendingAttachment)
        : slide
    )));
    setPendingAttachment(null);
  }

  function startBuildingPresentation() {
    if (!pendingAttachment) {
      setStep('building');
      return;
    }

    const nextSlides = slides.map(slide => (
      slide.id === selectedAttachmentSlide
        ? addAttachmentToSlide(slide, pendingAttachment)
        : slide
    ));
    setSlides(nextSlides);
    setPendingAttachment(null);
    setStep('building');
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

  async function createSlidesWithAi(count: number): Promise<PresentationSlide[]> {
    return generatePresentationStructure({
      supabase,
      getAiErrorMessage,
      settings: {
        topic,
        slidesCount: count,
        informationLevel: informationLevelRef.current,
        audience: audienceRef.current,
        selectedTemplate,
      },
    });
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
    }, 450);

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
        }, Math.max(180, (AI_PREP_STEPS.length - stage) * 260));
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
        setTimeout(() => setStep('structure'), 150);
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
          onDoneRef.current(topic, slidesCountRef.current, slides);
        }, 120);
      }
    }, STEP_DURATIONS.building);
    return () => clearInterval(id);
  }, [step, topic]);

  function updateSlide(id: number, field: 'title' | 'subtitle' | 'content' | 'visualPrompt', value: string) {
    setSlides(s => s.map(sl => {
      if (sl.id !== id) return sl;
      if (field === 'title') return buildSlideContentFromTitle(sl, value);
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
        for (const [index, slide] of slides.entries()) {
          if (index > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
          pdf.addImage(await renderSlideToImage(slide, index, slides.length, topic, theme), 'PNG', 0, 0, SLIDE_W, SLIDE_H);
        }
        pdf.save(`${safeFileName()}.pdf`);
      } else {
        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = 'Planify';
        for (const [index, slide] of slides.entries()) {
          const pptSlide = pptx.addSlide();
          pptSlide.background = { color: theme.dark ? '0F172A' : 'FFFFFF' };
          pptSlide.addImage({
            data: await renderSlideToImage(slide, index, slides.length, topic, theme),
            x: 0,
            y: 0,
            w: 13.333,
            h: 7.5,
          });
        }
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

        {/* Top actions */}
        <div className={`pres-top-actions${step === 'preview' ? ' preview' : ''}`}>
          {step === 'preview' && (
            <div className="pres-preview-top-title">
              <p className="pres-modal-title">Предпросмотр презентации</p>
              <span>«{topic}» · {slides.length} слайдов</span>
            </div>
          )}
          {step === 'preview' && (
            <div className="pres-download-wrap">
              <button className="pres-download-main" onClick={() => setDownloadOpen(v => !v)}>
                Скачать
                <span aria-hidden="true">⌄</span>
              </button>
              {downloadOpen && (
                <div className="pres-download-menu">
                  <button onClick={() => downloadPresentation('pdf')}>Скачать PDF</button>
                  <button onClick={() => downloadPresentation('pptx')}>Скачать PPTX</button>
                </div>
              )}
            </div>
          )}
          <button className="pres-close" onClick={onClose} aria-label="Закрыть презентацию">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* ── STEP 1: generation settings ── */}
        {step === 'settings' && (
          <div>
            <p className="pres-modal-title" style={{ marginBottom: 2 }}>Настройки генерации</p>
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
              ИИ создаст структуру, image prompts, дизайн и preview
            </p>

            <div className="pres-settings-group">
              <div className="pres-settings-label">Насколько подробной должна быть презентация?</div>
              <div className="pres-choice-grid">
                {INFORMATION_LEVELS.map(level => (
                  <button
                    key={level.value}
                    type="button"
                    className={informationLevel === level.value ? 'active' : ''}
                    onClick={() => setInformationLevel(level.value)}
                  >
                    <strong>{level.title}</strong>
                    <span>{level.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pres-settings-group">
              <div className="pres-settings-label">Для кого презентация?</div>
              <div className="pres-audience-grid">
                {AUDIENCES.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={audience === item.value ? 'active' : ''}
                    onClick={() => setAudience(item.value)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('planning')}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                border: 'none', background: primaryColor, color: '#fff',
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              Создать структуру
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
                {slidesCount} слайдов · {informationLevel === 'brief' ? 'краткая' : informationLevel === 'detailed' ? 'подробная' : 'стандартная'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--soft)', marginBottom: 18 }}>
              Можно редактировать названия, блоки и image prompts перед созданием дизайна
            </p>
            {aiNotice && <p className="pres-ai-notice structure">{aiNotice}</p>}

            {pendingAttachment && (
              <div className="pres-attachment-picker">
                <div>
                  <strong>{pendingAttachment.name}</strong>
                  <span>Выбери слайд, куда добавить файл</span>
                </div>
                <select
                  value={selectedAttachmentSlide}
                  onChange={event => setSelectedAttachmentSlide(Number(event.target.value))}
                >
                  {slides.map(slide => (
                    <option key={slide.id} value={slide.id}>
                      Слайд {slide.id}: {slide.title}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={applyPendingAttachment}>
                  Добавить на слайд
                </button>
              </div>
            )}

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
                    <input
                      className="pres-slide-input pres-slide-visual-input"
                      value={sl.visualPrompt}
                      onChange={e => updateSlide(sl.id, 'visualPrompt', e.target.value)}
                      style={{ fontSize: 11, color: 'var(--soft)' }}
                    />
                    {sl.imageDataUrl && (
                      <div className="pres-slide-attachment-preview">
                        <img src={sl.imageDataUrl} alt={`Фото для слайда ${sl.id}`} />
                        <span>Фото добавлено на этот слайд</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={startBuildingPresentation}
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
            downloadOpen={downloadOpen}
            downloadStatus={downloadStatus}
            onDownload={downloadPresentation}
          />
        )}
      </div>
    </div>
  );
}
