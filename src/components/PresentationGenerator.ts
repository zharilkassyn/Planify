import type { SelectedTemplate } from './TemplateGallery';
import type { PresentationSlide } from './LayoutSystem';
import { parsePresentationSlides } from './SlideBuilder';
import { buildPlanifySystemPrompt } from '../lib/aiContext';

export type InformationLevel = 'brief' | 'standard' | 'detailed';
export type Audience = 'school' | 'students' | 'business' | 'professionals';

interface AiFunctionResponse {
  text?: string;
  error?: string;
}

interface AiFunctionClient {
  functions: {
    invoke: <T>(name: string, options: { body: Record<string, unknown> }) => Promise<{ data: T | null; error: unknown }>;
  };
}

export interface PresentationGenerationSettings {
  topic: string;
  slidesCount: number;
  informationLevel: InformationLevel;
  audience: Audience;
  selectedTemplate: SelectedTemplate | null;
}

interface GeneratePresentationStructureOptions {
  supabase: AiFunctionClient;
  settings: PresentationGenerationSettings;
  getAiErrorMessage: (error: unknown) => Promise<string>;
}

const INFO_LABELS: Record<InformationLevel, string> = {
  brief: 'Краткая: мало текста, главные мысли, больше визуалов',
  standard: 'Стандартная: баланс текста и изображений, подходит для учебы',
  detailed: 'Подробная: больше объяснений, фактов и контента',
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  school: 'школьники: простые формулировки, понятные примеры',
  students: 'студенты: академичный, но понятный стиль',
  business: 'бизнес: конкретика, польза, структура, метрики',
  professionals: 'профессионалы: точность, экспертный тон, меньше очевидных объяснений',
};

export async function generatePresentationStructure({
  supabase,
  settings,
  getAiErrorMessage,
}: GeneratePresentationStructureOptions): Promise<PresentationSlide[]> {
  const { topic, slidesCount, informationLevel, audience, selectedTemplate } = settings;
  const templateText = selectedTemplate
    ? `${selectedTemplate.templateName}, стиль ${selectedTemplate.style}, цвета ${selectedTemplate.colors.join(', ')}`
    : 'шаблон не выбран, используй современный чистый стиль';

  const prompt = [
    'Planify PresentationGenerator input:',
    JSON.stringify({
      topic,
      slidesCount,
      informationLevel,
      audience,
      selectedTemplate,
    }),
    '',
    'Сначала создай только структуру настоящей презентации. Дизайн будет применен SlideBuilder и TemplateEngine после структуры.',
    `Тема: ${topic}`,
    `Количество слайдов: ${slidesCount}. Верни ровно ${slidesCount} слайдов.`,
    `Уровень информации: ${INFO_LABELS[informationLevel]}.`,
    `Аудитория: ${AUDIENCE_LABELS[audience]}.`,
    `Шаблон: ${templateText}.`,
    '',
    'Для каждого слайда верни: title, subtitle, content, visualPrompt, layout, visual.',
    'Разные layouts обязательны: title, text-image, timeline, comparison, statistics, cards, quote, summary.',
    'Первый слайд должен быть title. Последний слайд должен быть summary.',
    'Не делай одинаковые страницы. Не делай один большой текст. Не вставляй тему как единственный заголовок.',
    'Каждый visualPrompt должен быть конкретной инструкцией для изображения по теме этого слайда.',
    'Например для исторической темы: "Historical black and white photo style, Europe 1939, soldiers, realistic documentary style".',
    'Не используй случайные картинки и абстрактные слова без связи со слайдом.',
    '',
    'Верни только валидный JSON без markdown:',
    '{"slides":[{"number":1,"title":"...","subtitle":"...","content":["..."],"layout":"title|text-image|timeline|comparison|statistics|cards|quote|summary","visual":"описание визуального блока","visualPrompt":"image prompt","stats":[{"value":"...","label":"..."}],"comparison":{"leftTitle":"...","left":["..."],"rightTitle":"...","right":["..."]},"timeline":[{"label":"...","text":"..."}],"quote":"...","attribution":"..."}]}',
  ].join('\n');

  const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
    body: {
      prompt,
      system: buildPlanifySystemPrompt({
        mode: 'presentation',
        appState: [
          `Тема: ${topic}`,
          `Количество слайдов: ${slidesCount}`,
          `Уровень информации: ${INFO_LABELS[informationLevel]}`,
          `Аудитория: ${AUDIENCE_LABELS[audience]}`,
          `Выбранный шаблон: ${templateText}`,
        ].join('\n'),
      }),
    },
  });

  if (error) throw new Error(await getAiErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (!data?.text) throw new Error('AI не вернул текст');

  return parsePresentationSlides(data.text, slidesCount, topic, selectedTemplate, informationLevel, audience);
}
