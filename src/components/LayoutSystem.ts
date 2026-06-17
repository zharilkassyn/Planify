export type SlideLayout =
  | 'title'
  | 'text-image'
  | 'cards'
  | 'timeline'
  | 'statistics'
  | 'comparison'
  | 'conclusion';

export interface SlideStat {
  value: string;
  label: string;
}

export interface SlideComparison {
  leftTitle: string;
  left: string[];
  rightTitle: string;
  right: string[];
}

export interface SlideTimelineItem {
  label: string;
  text: string;
}

export interface PresentationSlide {
  id: number;
  number: number;
  title: string;
  subtitle: string;
  content: string[];
  layout: SlideLayout;
  visual: string;
  visualPrompt: string;
  stats: SlideStat[];
  comparison?: SlideComparison;
  timeline: SlideTimelineItem[];
}

export const LAYOUT_SEQUENCE: SlideLayout[] = [
  'title',
  'text-image',
  'cards',
  'timeline',
  'statistics',
  'comparison',
  'cards',
  'conclusion',
];

export function normalizeLayout(value: string | undefined, index: number, total: number): SlideLayout {
  const clean = value?.toLowerCase().trim();
  if (index === 0) return 'title';
  if (index === total - 1) return 'conclusion';

  if (clean === 'title slide' || clean === 'hero' || clean === 'title') return 'title';
  if (clean === 'text + image' || clean === 'text-image' || clean === 'image text') return 'text-image';
  if (clean === 'three cards' || clean === 'cards' || clean === 'card') return 'cards';
  if (clean === 'timeline') return 'timeline';
  if (clean === 'statistics' || clean === 'stats') return 'statistics';
  if (clean === 'comparison' || clean === 'compare') return 'comparison';
  if (clean === 'conclusion' || clean === 'summary') return 'conclusion';

  return LAYOUT_SEQUENCE[index % LAYOUT_SEQUENCE.length];
}

export function getLayoutLabel(layout: SlideLayout): string {
  switch (layout) {
    case 'title':
      return 'Title slide';
    case 'text-image':
      return 'Text + Image';
    case 'cards':
      return 'Cards';
    case 'timeline':
      return 'Timeline';
    case 'statistics':
      return 'Statistics';
    case 'comparison':
      return 'Comparison';
    case 'conclusion':
      return 'Conclusion';
  }
}

export function sanitizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return items.length ? items : fallback;
}
