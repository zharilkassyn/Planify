import { useEffect, useRef, useState } from 'react';
import { PresentationModal, type PresentationAttachment } from './PresentationModal';
import { TemplateGallery, PRESENTATION_TEMPLATES, type SelectedTemplate } from './TemplateGallery';
import { createFallbackSlides } from './SlideBuilder';
import type { PresentationSlide } from './LayoutSystem';

const MAX_CHARS = 500;

const STEPS = [
  {
    num: 1, bg: '#EFF6FF', iconColor: '#2563EB',
    title: 'Опиши тему',
    desc: 'Введи тему или загрузи документ с материалами',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    num: 2, bg: '#F0FDF4', iconColor: '#16A34A',
    title: 'ИИ создаст структуру',
    desc: 'Искусственный интеллект составит план и содержание',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2L9 9H2l5.5 4L5 20l7-4.5L19 20l-2.5-7L22 9h-7z"/>
      </svg>
    ),
  },
  {
    num: 3, bg: '#FFF7ED', iconColor: '#EA580C',
    title: 'Выбери стиль',
    desc: 'Выбери дизайн и настрой оформление по вкусу',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
    ),
  },
  {
    num: 4, bg: '#FAF5FF', iconColor: '#7C3AED',
    title: 'Скачай и используй',
    desc: 'Скачай презентацию в PowerPoint или PDF',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    ),
  },
];

const CARD_COLORS = ['#2D6A4F', '#1E3A5F', '#4C1D95', '#92400E', '#1E3A8A', '#065F46'];

const STORAGE_KEY = 'planify_presentations';
const SELECTED_TEMPLATE_KEY = 'planify_selected_template';
const PRESENTATION_DRAFT_KEY = 'planify_presentation_draft_topic';

interface Presentation {
  id: string;
  title: string;
  createdAt: number;
  fmt: string;
  bg: string;
  slidesCount?: number;
  slides?: PresentationSlide[];
  templateName?: string;
}

function loadPresentations(): Presentation[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function savePresentations(list: Presentation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function isSelectedTemplate(value: unknown): value is SelectedTemplate {
  if (!value || typeof value !== 'object') return false;
  const maybeTemplate = value as Partial<SelectedTemplate>;
  return (
    typeof maybeTemplate.templateName === 'string'
    && typeof maybeTemplate.style === 'string'
    && Array.isArray(maybeTemplate.colors)
    && maybeTemplate.colors.every(color => typeof color === 'string')
  );
}

function loadSelectedTemplate(): SelectedTemplate | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTED_TEMPLATE_KEY) || 'null');
    return isSelectedTemplate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSelectedTemplate(template: SelectedTemplate | null) {
  if (template) {
    localStorage.setItem(SELECTED_TEMPLATE_KEY, JSON.stringify(template));
  } else {
    localStorage.removeItem(SELECTED_TEMPLATE_KEY);
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Только что';
  if (min < 60) return `${min} мин. назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Вчера';
  return `${d} дня назад`;
}

const TIPS = [
  'Будь конкретным в описании темы',
  'Укажи целевую аудиторию',
  'Добавь ключевые тезисы',
  'Используй загруженные материалы',
];

const EXAMPLES = [
  '«Влияние искусственного интеллекта на образование»',
  '«История развития интернета»',
  '«Биология: строение клетки»',
];

export function PresentationsPage() {
  const [topic, setTopic]           = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [modalStartMode, setModalStartMode] = useState<'manual' | 'ai'>('manual');
  const [openedPresentation, setOpenedPresentation] = useState<Presentation | null>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [menuOpen, setMenuOpen]     = useState<number | null>(null);
  const [recent, setRecent]         = useState<Presentation[]>(loadPresentations);
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate | null>(loadSelectedTemplate);
  const [uploadedAttachment, setUploadedAttachment] = useState<PresentationAttachment | null>(null);
  const [formError, setFormError]   = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563EB';
  const sidebarTemplates = PRESENTATION_TEMPLATES.slice(0, 4);

  useEffect(() => {
    const draftTopic = localStorage.getItem(PRESENTATION_DRAFT_KEY);
    if (!draftTopic) return;
    setTopic(draftTopic);
    setFormError('');
    localStorage.removeItem(PRESENTATION_DRAFT_KEY);
  }, []);

  function findTemplateByName(templateName: string | undefined): SelectedTemplate | null {
    const template = PRESENTATION_TEMPLATES.find(item => item.templateName === templateName);
    return template
      ? {
          templateName: template.templateName,
          style: template.style,
          colors: template.colors,
        }
      : null;
  }

  function getPresentationTemplate(presentation: Presentation | null): SelectedTemplate | null {
    return findTemplateByName(presentation?.templateName) ?? selectedTemplate;
  }

  function getPresentationSlides(presentation: Presentation): PresentationSlide[] {
    if (presentation.slides?.length) return presentation.slides;

    return createFallbackSlides(
      presentation.title,
      presentation.slidesCount ?? 10,
      getPresentationTemplate(presentation),
      'standard',
      'school',
    );
  }

  function getSlidesForStorage(slides: PresentationSlide[]): PresentationSlide[] {
    return slides.map(slide => {
      if (!slide.imageDataUrl) return slide;
      const copy = { ...slide };
      delete copy.imageDataUrl;
      return copy;
    });
  }

  function handleModalDone(title: string, count: number, slides: PresentationSlide[]) {
    const savedSlides = getSlidesForStorage(slides);

    if (openedPresentation) {
      const updated = recent.map(item => (
        item.id === openedPresentation.id
          ? {
              ...item,
              title,
              slidesCount: count,
              slides: savedSlides,
              templateName: selectedTemplate?.templateName ?? item.templateName,
            }
          : item
      ));
      setRecent(updated);
      savePresentations(updated);
      setOpenedPresentation(null);
      return;
    }

    const newItem: Presentation = {
      id: String(Date.now()),
      title,
      createdAt: Date.now(),
      fmt: 'PPTX',
      bg: selectedTemplate
        ? `linear-gradient(135deg, ${selectedTemplate.colors.join(', ')})`
        : CARD_COLORS[recent.length % CARD_COLORS.length],
      slidesCount: count,
      slides: savedSlides,
      templateName: selectedTemplate?.templateName,
    };
    const updated = [newItem, ...recent];
    setRecent(updated);
    savePresentations(updated);
  }

  function handleDelete(id: string) {
    const updated = recent.filter(p => p.id !== id);
    setRecent(updated);
    savePresentations(updated);
    setMenuOpen(null);
  }

  function handleOpen(presentation: Presentation) {
    setOpenedPresentation(presentation);
    setTopic(presentation.title);
    setModalStartMode('manual');
    setMenuOpen(null);
    setShowModal(true);
  }

  function handleSelectTemplate(template: SelectedTemplate) {
    setSelectedTemplate(template);
    saveSelectedTemplate(template);
  }

  function handleFileUpload(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setFormError('Не получилось прочитать файл');
        return;
      }
      setUploadedAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl: result,
      });
      setFormError('');
    };
    reader.onerror = () => setFormError('Не получилось загрузить файл');
    reader.readAsDataURL(file);
  }

  function startAiGeneration() {
    if (!topic.trim()) {
      setFormError('Введите тему презентации');
      return;
    }
    setFormError('');
    setOpenedPresentation(null);
    setModalStartMode('ai');
    setShowModal(true);
  }

  function startManualGeneration() {
    if (!topic.trim()) {
      setFormError('Введите тему презентации');
      return;
    }
    setFormError('');
    setOpenedPresentation(null);
    setModalStartMode('manual');
    setShowModal(true);
  }

  return (
    <div className="timer-layout">
      {/* ── LEFT / MAIN ── */}
      <div className="timer-main">

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Генерация презентаций</h2>
            <p style={{ fontSize: 14, color: 'var(--soft)', marginTop: 4 }}>
              Создавай профессиональные презентации с помощью ИИ за секунды
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 18 }}>Как это работает</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  {/* Icon circle */}
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: s.bg, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: s.iconColor,
                    }}>
                      {s.icon}
                    </div>
                    {/* Number badge */}
                    <div style={{
                      position: 'absolute', top: -4, left: -4,
                      width: 20, height: 20, borderRadius: '50%',
                      background: primaryColor, color: '#fff',
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {s.num}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--soft)', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
                {/* Arrow between steps */}
                {i < STEPS.length - 1 && (
                  <div style={{ paddingTop: 28, color: '#CBD5E1', fontSize: 18, flexShrink: 0, margin: '0 4px' }}>
                    ─────&gt;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Create form */}
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 14 }}>Создать новую презентацию</div>

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <textarea
              value={topic}
              onChange={e => {
                setTopic(e.target.value.slice(0, MAX_CHARS));
                if (formError) setFormError('');
              }}
              placeholder="Опиши тему презентации..."
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1.5px solid var(--border)', borderRadius: 10,
                padding: '12px 14px', fontSize: 14, resize: 'vertical',
                fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--ink)',
                outline: 'none', lineHeight: 1.5,
              }}
              onFocus={e => (e.target.style.borderColor = primaryColor)}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 11, color: 'var(--soft)' }}>
              {topic.length}/{MAX_CHARS}
            </div>
          </div>

          {/* Examples */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--soft)', marginBottom: 6 }}>Например:</div>
            {EXAMPLES.map(ex => (
              <div key={ex}
                onClick={() => {
                  setTopic(ex.replace(/«|»/g, ''));
                  setFormError('');
                }}
                style={{ fontSize: 12, color: 'var(--soft)', marginBottom: 3, cursor: 'pointer',
                  paddingLeft: 10, transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = primaryColor)}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--soft)')}
              >
                • {ex}
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.ppt,.pptx"
              style={{ display: 'none' }}
              onChange={event => {
                handleFileUpload(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--card)',
                color: 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Загрузить файл
            </button>
            <button
              type="button"
              onClick={startAiGeneration}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10,
                border: `1.5px solid ${primaryColor}`, background: primaryColor + '12',
                color: primaryColor, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span aria-hidden="true">✨</span>
              Сгенерировать с ИИ
            </button>
            <button
              onClick={startManualGeneration}
              disabled={!topic.trim()}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: topic.trim() ? primaryColor : '#CBD5E1',
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: topic.trim() ? 'pointer' : 'not-allowed', transition: 'background .2s',
              }}
            >
              Создать презентацию
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {formError && <p className="presentation-form-error">{formError}</p>}

          {uploadedAttachment && (
            <div className="selected-template-chip">
              <span>Файл выбран: {uploadedAttachment.name}</span>
              <button type="button" onClick={() => setUploadedAttachment(null)}>
                Убрать
              </button>
            </div>
          )}

          {selectedTemplate && (
            <div className="selected-template-chip">
              <div className="selected-template-swatches" aria-hidden="true">
                {selectedTemplate.colors.map(color => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
              <span>Выбран стиль: {selectedTemplate.templateName}</span>
              <button type="button" onClick={() => setShowTemplateGallery(true)}>
                Изменить
              </button>
            </div>
          )}
        </div>

        {/* Recent presentations */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Недавние презентации</div>
            {recent.length > 0 && (
              <span style={{ fontSize: 13, color: primaryColor, fontWeight: 600, cursor: 'pointer' }}>
                Смотреть все →
              </span>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="panel" style={{ textAlign: 'center', padding: '36px 24px', color: 'var(--soft)' }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
                style={{ opacity: 0.35, marginBottom: 12 }}>
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--ink)' }}>
                Пока нет презентаций
              </div>
              <div style={{ fontSize: 13 }}>
                Создай первую презентацию — и она появится здесь
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
              {recent.map((r, i) => (
                <div key={r.id}
                  className="panel"
                  style={{ padding: 0, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    height: 110, background: r.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </div>
                  {/* Info */}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>
                      {r.title}
                    </div>
                    {r.templateName && (
                      <div style={{ fontSize: 11, color: primaryColor, fontWeight: 600, marginBottom: 5 }}>
                        {r.templateName}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--soft)' }}>{timeAgo(r.createdAt)}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        background: '#DBEAFE', color: '#1D4ED8',
                      }}>
                        {r.fmt}
                      </span>
                    </div>
                  </div>
                  {/* 3-dot menu */}
                  <button
                    onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === i ? null : i); }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 6,
                      color: '#fff', cursor: 'pointer', padding: '3px 6px', fontSize: 16, lineHeight: 1,
                    }}
                  >⋮</button>
                  {menuOpen === i && (
                    <div style={{
                      position: 'absolute', top: 36, right: 8, background: 'var(--card)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10,
                      overflow: 'hidden', minWidth: 140,
                    }}
                    onClick={e => e.stopPropagation()}
                    >
                      {['Открыть', 'Скачать'].map(action => (
                        <button key={action}
                          onClick={() => {
                            if (action === 'Открыть') {
                              handleOpen(r);
                            } else {
                              setMenuOpen(null);
                            }
                          }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '9px 14px', border: 'none', background: 'transparent',
                            fontSize: 13, cursor: 'pointer', color: 'var(--ink)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {action}
                        </button>
                      ))}
                      <button
                        onClick={() => handleDelete(r.id)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 14px', border: 'none', background: 'transparent',
                          fontSize: 13, cursor: 'pointer', color: '#EF4444', fontWeight: 600,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div className="timer-right">

        {/* Templates */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Шаблоны презентаций</span>
            <button
              type="button"
              className="template-open-link"
              onClick={() => setShowTemplateGallery(true)}
              style={{ color: primaryColor }}
            >
              Смотреть все →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sidebarTemplates.map(t => (
              <div key={t.id}
                onClick={() => handleSelectTemplate({
                  templateName: t.templateName,
                  style: t.style,
                  colors: t.colors,
                })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  padding: '8px 10px', borderRadius: 10,
                  border: `1.5px solid ${selectedTemplate?.templateName === t.templateName ? primaryColor : 'transparent'}`,
                  background: selectedTemplate?.templateName === t.templateName ? primaryColor + '08' : 'transparent',
                  transition: 'all .15s',
                }}
              >
                {/* Thumbnail */}
                <div style={{
                  width: 52, height: 36, borderRadius: 6, flexShrink: 0,
                  background: `linear-gradient(135deg, ${t.colors.join(', ')})`, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  padding: '6px 8px', gap: 4, boxSizing: 'border-box',
                  border: '1px solid rgba(0,0,0,0.08)',
                }}>
                  {[0, 1, 2].map(li => (
                    <div key={li} style={{
                      height: li === 0 ? 4 : 3, borderRadius: 2,
                      background: li === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
                      width: li === 0 ? '80%' : '60%',
                    }}/>
                  ))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{t.templateName}</div>
                  <div style={{ fontSize: 11, color: 'var(--soft)', marginTop: 1 }}>{t.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 14 }}>Советы по созданию</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TIPS.map(tip => (
              <div key={tip} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#16A34A" strokeWidth="2.5">
                    <polyline points="1.5 6 4.5 9 10.5 3"/>
                  </svg>
                </div>
                <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Click-outside to close menu */}
      {menuOpen !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setMenuOpen(null)}/>
      )}

      {/* Presentation Modal */}
      {showModal && (
        <PresentationModal
          topic={topic}
          selectedTemplate={getPresentationTemplate(openedPresentation)}
          startMode={modalStartMode}
          initialSlides={openedPresentation ? getPresentationSlides(openedPresentation) : undefined}
          attachment={openedPresentation ? null : uploadedAttachment}
          onClose={() => {
            setShowModal(false);
            setOpenedPresentation(null);
          }}
          onDone={(title, count, slides) => {
            handleModalDone(title, count, slides);
            setUploadedAttachment(null);
          }}
        />
      )}

      {showTemplateGallery && (
        <TemplateGallery
          selectedTemplate={selectedTemplate}
          onClose={() => setShowTemplateGallery(false)}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
    </div>
  );
}
