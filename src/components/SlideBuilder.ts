import type { SelectedTemplate } from './TemplateGallery';
import {
  normalizeLayout,
  sanitizeList,
  type PresentationSlide,
  type SlideComparison,
  type SlideStat,
  type SlideTimelineItem,
} from './LayoutSystem';
import { applyImagePrompts } from './ImageGenerator';
import type { Audience, InformationLevel } from './PresentationGenerator';

export interface AiSlideDraft {
  number?: number;
  title?: string;
  subtitle?: string;
  content?: unknown;
  layout?: string;
  visual?: string;
  visualPrompt?: string;
  useImage?: unknown;
  stats?: unknown;
  comparison?: unknown;
  timeline?: unknown;
  quote?: unknown;
  attribution?: unknown;
}

const FALLBACK_SLIDES: Array<{ title: string; subtitle: string; content: string[]; visual: string }> = [
  { title: 'Введение', subtitle: 'Почему тема важна и что зритель узнает', content: ['Контекст темы', 'Главная идея', 'Цель презентации'], visual: 'Большая тематическая иллюстрация' },
  { title: 'Ключевая идея', subtitle: 'Короткое объяснение сути простыми словами', content: ['Определение', 'Основные принципы', 'Где встречается'], visual: 'Иконки и смысловые блоки' },
  { title: 'Основные направления', subtitle: 'Как тема делится на понятные части', content: ['Направление 1', 'Направление 2', 'Направление 3'], visual: 'Карточки с акцентами' },
  { title: 'Этапы развития', subtitle: 'Как менялась тема со временем', content: ['Начало', 'Рост', 'Современный этап'], visual: 'Временная шкала' },
  { title: 'Факты и данные', subtitle: 'Что показывают цифры и наблюдения', content: ['Рост интереса', 'Практическая польза', 'Влияние на людей'], visual: 'Графики и крупные числа' },
  { title: 'Сравнение подходов', subtitle: 'Чем отличаются разные варианты', content: ['Сильные стороны', 'Ограничения', 'Когда применять'], visual: 'Две колонки сравнения' },
  { title: 'Важная мысль', subtitle: 'Короткая цитата или центральная идея', content: ['Главный смысл', 'Почему это важно', 'Как это применить'], visual: 'Сильный визуальный акцент' },
  { title: 'Главные выводы', subtitle: 'Что нужно запомнить после презентации', content: ['Главная мысль', 'Практическая польза', 'Следующий шаг'], visual: 'Финальный визуальный акцент' },
];

function shortenForSlide(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentence = clean.split(/[.!?;:]/)[0]?.trim();
  if (sentence && sentence.length <= max) return sentence;
  const words = clean.split(' ');
  let result = '';
  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > max) break;
    result = next;
  }
  return result || clean.slice(0, max - 1).trim();
}

function compactList(items: string[], maxItems: number, maxChars: number): string[] {
  return items
    .map(item => shortenForSlide(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function createFallbackSlides(
  topic: string,
  count: number,
  selectedTemplate: SelectedTemplate | null,
  informationLevel: InformationLevel,
  audience: Audience,
): PresentationSlide[] {
  const base = [
    {
      title: topic.slice(0, 80) || 'Тема презентации',
      subtitle: 'Краткое введение: почему эта тема важна и что зритель узнает из презентации.',
      content: ['Почему это важно', 'Что будет разобрано', 'Как применить знания'],
      visual: 'Тематическая обложка',
    },
    ...FALLBACK_SLIDES,
  ];

  const slides = base.slice(0, count).map((slide, idx) => (
    normalizeSlideDraft(slide, idx, count, topic, selectedTemplate, informationLevel)
  ));
  return applyImagePrompts(slides, topic, selectedTemplate, audience);
}

export function parsePresentationSlides(
  text: string,
  count: number,
  topic: string,
  selectedTemplate: SelectedTemplate | null,
  informationLevel: InformationLevel,
  audience: Audience,
): PresentationSlide[] {
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

  const slides = drafts.map((slide, idx) => normalizeSlideDraft(slide, idx, count, topic, selectedTemplate, informationLevel));
  return applyImagePrompts(slides, topic, selectedTemplate, audience);
}

function normalizeSlideDraft(
  slide: AiSlideDraft | { title: string; subtitle: string; content: string[]; visual: string },
  idx: number,
  total: number,
  topic: string,
  selectedTemplate: SelectedTemplate | null,
  informationLevel: InformationLevel,
): PresentationSlide {
  const fallback = FALLBACK_SLIDES[idx % FALLBACK_SLIDES.length];
  const contentLimit = informationLevel === 'brief' ? 3 : informationLevel === 'detailed' ? 4 : 3;
  const content = compactList(
    sanitizeList('content' in slide ? slide.content : undefined, fallback.content),
    contentLimit,
    52,
  );
  const layout = normalizeLayout('layout' in slide ? slide.layout : undefined, idx, total);
  const title = typeof slide.title === 'string' && slide.title.trim() ? slide.title.trim() : fallback.title;
  const subtitle = typeof slide.subtitle === 'string' && slide.subtitle.trim() ? slide.subtitle.trim() : fallback.subtitle;
  const visual = typeof slide.visual === 'string' && slide.visual.trim() ? slide.visual.trim() : fallback.visual;
  const rawVisualPrompt = 'visualPrompt' in slide ? slide.visualPrompt : undefined;
  const visualPrompt = typeof rawVisualPrompt === 'string' && rawVisualPrompt.trim()
    ? rawVisualPrompt.trim()
    : `${visual}, topic ${topic}, ${selectedTemplate?.templateName ?? 'modern presentation'} style`;
  const rawUseImage = 'useImage' in slide ? slide.useImage : undefined;
  const rawQuote = 'quote' in slide ? slide.quote : undefined;
  const rawAttribution = 'attribution' in slide ? slide.attribution : undefined;

  return {
    id: idx + 1,
    number: idx + 1,
    title: shortenForSlide(title, 58),
    subtitle: shortenForSlide(subtitle, 96),
    content,
    layout,
    visual,
    visualPrompt,
    useImage: idx === 0 || (typeof rawUseImage === 'boolean' ? rawUseImage : layout === 'text-image' || layout === 'quote'),
    stats: normalizeStats(slide, content),
    comparison: normalizeComparison(slide, content),
    timeline: normalizeTimeline(slide, content),
    quote: typeof rawQuote === 'string' ? shortenForSlide(rawQuote, 112) : shortenForSlide(subtitle, 112),
    attribution: typeof rawAttribution === 'string' ? rawAttribution.slice(0, 60) : topic,
  };
}

function normalizeStats(slide: AiSlideDraft | { content: string[] }, content: string[]): SlideStat[] {
  const source = 'stats' in slide && Array.isArray(slide.stats) ? slide.stats : [];
  const stats = source
    .filter((item): item is { value?: unknown; label?: unknown } => Boolean(item && typeof item === 'object'))
    .map(item => ({
      value: typeof item.value === 'string' ? item.value.slice(0, 12) : '3x',
      label: typeof item.label === 'string' ? shortenForSlide(item.label, 44) : 'важный показатель',
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
      text: typeof item.text === 'string' ? shortenForSlide(item.text, 48) : content[idx] ?? 'Ключевой этап',
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
      left: compactList(sanitizeList(maybe.left, content.slice(0, 3)), 3, 48),
      rightTitle: typeof maybe.rightTitle === 'string' ? maybe.rightTitle.slice(0, 36) : 'Подход B',
      right: compactList(sanitizeList(maybe.right, content.slice(1, 4)), 3, 48),
    };
  }

  return {
    leftTitle: 'Плюсы',
    left: content.slice(0, 3),
    rightTitle: 'Важно учесть',
    right: content.slice(1, 4).length ? content.slice(1, 4) : content,
  };
}
