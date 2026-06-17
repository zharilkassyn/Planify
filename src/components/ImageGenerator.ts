import type { SelectedTemplate } from './TemplateGallery';
import type { PresentationSlide } from './LayoutSystem';
import type { Audience } from './PresentationGenerator';

export function buildImagePrompt(
  topic: string,
  slide: Pick<PresentationSlide, 'title' | 'visual' | 'layout' | 'visualPrompt'>,
  selectedTemplate: SelectedTemplate | null,
  audience: Audience,
) {
  const templateStyle = selectedTemplate
    ? `${selectedTemplate.templateName} style, ${selectedTemplate.style}, colors ${selectedTemplate.colors.join(', ')}`
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
