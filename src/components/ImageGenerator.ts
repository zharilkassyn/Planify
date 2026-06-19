import type { SelectedTemplate } from './TemplateGallery';
import type { PresentationSlide } from './LayoutSystem';
import type { Audience } from './PresentationGenerator';

interface AiImageResponse {
  imageDataUrl?: string;
  error?: string;
}

interface AiImageClient {
  functions: {
    invoke: <T>(name: string, options: { body: Record<string, unknown> }) => Promise<{ data: T | null; error: unknown }>;
  };
}

export function buildImagePrompt(
  topic: string,
  slide: Pick<PresentationSlide, 'title' | 'visual' | 'layout' | 'visualPrompt'>,
  selectedTemplate: SelectedTemplate | null,
  audience: Audience,
) {
  const templateStyle = selectedTemplate
    ? `use the selected presentation visual style internally, ${selectedTemplate.style}`
    : 'modern educational presentation style';

  const audienceTone = {
    school: 'clear school-friendly visual metaphor',
    students: 'smart academic visual with useful details',
    business: 'professional business visual, clean and trustworthy',
    professionals: 'expert-level visual, precise and polished',
  } satisfies Record<Audience, string>;

  return [
    slide.visualPrompt || slide.visual,
    `Topic: ${topic}`,
    `Slide: ${slide.title}`,
    `Layout: ${slide.layout}`,
    templateStyle,
    audienceTone[audience],
    'high quality presentation illustration, relevant to the slide, no random objects, no text labels inside image',
  ].join(', ');
}

export function applyImagePrompts(
  slides: PresentationSlide[],
  topic: string,
  selectedTemplate: SelectedTemplate | null,
  audience: Audience,
) {
  return slides.map(slide => ({
    ...slide,
    visualPrompt: buildImagePrompt(topic, slide, selectedTemplate, audience),
  }));
}

export async function generateSlideImages(
  supabase: AiImageClient,
  slides: PresentationSlide[],
  getAiErrorMessage: (error: unknown) => Promise<string>,
) {
  async function generateOne(slide: PresentationSlide): Promise<PresentationSlide> {
    if (!slide.useImage) {
      return slide;
    }

    try {
      const { data, error } = await supabase.functions.invoke<AiImageResponse>('ai', {
        body: {
          mode: 'image',
          prompt: slide.visualPrompt,
          system: 'Create a high-quality presentation image. No text, no labels, no watermark.',
        },
      });
      if (error) throw new Error(await getAiErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data?.imageDataUrl ? { ...slide, imageDataUrl: data.imageDataUrl } : slide;
    } catch {
      return slide;
    }
  }

  const result: PresentationSlide[] = [];
  const batchSize = 3;

  for (let i = 0; i < slides.length; i += batchSize) {
    const batch = slides.slice(i, i + batchSize);
    result.push(...await Promise.all(batch.map(generateOne)));
  }

  return result;
}
