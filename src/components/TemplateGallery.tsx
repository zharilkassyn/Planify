import { useMemo, useRef, useState } from 'react';
import { TemplateCard, type PresentationTemplate } from './TemplateCard';

export type SelectedTemplate = Pick<PresentationTemplate, 'templateName' | 'style' | 'colors'>;

interface TemplateGalleryProps {
  selectedTemplate: SelectedTemplate | null;
  onClose: () => void;
  onSelectTemplate: (template: SelectedTemplate) => void;
}

const CATEGORIES = ['Все', 'Минимализм', 'Бизнес', 'Образование', 'Креатив', 'Технологии', 'Маркетинг'];

export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  {
    id: 'aurora-gradient',
    templateName: 'Aurora Gradient',
    style: 'modern',
    colors: ['#2563EB', '#7C3AED', '#A855F7'],
    category: 'Технологии',
    description: 'Плавный AI-градиент со свечением',
    variant: 'aurora',
  },
  {
    id: 'ocean-glass',
    templateName: 'Ocean Glass',
    style: 'glass',
    colors: ['#0EA5E9', '#67E8F9', '#E0F2FE'],
    category: 'Бизнес',
    description: 'Голубые glassmorphism-слайды',
    variant: 'ocean',
  },
  {
    id: 'neon-future',
    templateName: 'Neon Future',
    style: 'futuristic',
    colors: ['#020617', '#22D3EE', '#F472B6'],
    category: 'Технологии',
    description: 'Тёмный фон и неоновые акценты',
    variant: 'neon',
  },
  {
    id: 'minimal-white',
    templateName: 'Minimal White',
    style: 'minimal',
    colors: ['#FFFFFF', '#CBD5E1', '#2563EB'],
    category: 'Минимализм',
    description: 'Много воздуха, тонкие линии',
    variant: 'minimal',
  },
  {
    id: 'business-pro',
    templateName: 'Business Pro',
    style: 'business',
    colors: ['#0F172A', '#1D4ED8', '#94A3B8'],
    category: 'Бизнес',
    description: 'Строгая аналитика и графики',
    variant: 'business',
  },
  {
    id: 'creative-wave',
    templateName: 'Creative Wave',
    style: 'creative',
    colors: ['#8B5CF6', '#06B6D4', '#F97316'],
    category: 'Креатив',
    description: 'Необычные формы и яркие волны',
    variant: 'creative',
  },
  {
    id: 'academic-clean',
    templateName: 'Academic Clean',
    style: 'academic',
    colors: ['#F8FAFC', '#475569', '#16A34A'],
    category: 'Образование',
    description: 'Спокойный учебный дизайн',
    variant: 'academic',
  },
  {
    id: 'sunset-gradient',
    templateName: 'Sunset Gradient',
    style: 'marketing',
    colors: ['#F97316', '#EC4899', '#7C3AED'],
    category: 'Маркетинг',
    description: 'Тёплый современный градиент',
    variant: 'sunset',
  },
];

function toSelectedTemplate(template: PresentationTemplate): SelectedTemplate {
  return {
    templateName: template.templateName,
    style: template.style,
    colors: template.colors,
  };
}

export function TemplateGallery({ selectedTemplate, onClose, onSelectTemplate }: TemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState('Все');
  const [activeTemplateId, setActiveTemplateId] = useState(
    PRESENTATION_TEMPLATES.find(template => template.templateName === selectedTemplate?.templateName)?.id
      ?? PRESENTATION_TEMPLATES[0].id,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'Все') return PRESENTATION_TEMPLATES;
    return PRESENTATION_TEMPLATES.filter(template => template.category === activeCategory);
  }, [activeCategory]);

  const activeTemplate = filteredTemplates.find(template => template.id === activeTemplateId)
    ?? filteredTemplates[0];

  function scrollGallery(direction: 'back' | 'forward') {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction === 'forward' ? 420 : -420,
      behavior: 'smooth',
    });
  }

  function handleUse(template: PresentationTemplate) {
    onSelectTemplate(toSelectedTemplate(template));
    onClose();
  }

  return (
    <div className="template-gallery-overlay" onClick={onClose}>
      <section className="template-gallery-modal" onClick={event => event.stopPropagation()}>
        <header className="template-gallery-header">
          <div>
            <h2>Выберите стиль презентации</h2>
            <p>Выберите дизайн, который подходит для вашей темы</p>
          </div>
          <button className="template-gallery-close" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="template-categories" role="tablist" aria-label="Категории шаблонов">
          {CATEGORIES.map(category => (
            <button
              key={category}
              className={category === activeCategory ? 'active' : ''}
              type="button"
              onClick={() => {
                setActiveCategory(category);
                const nextTemplate = category === 'Все'
                  ? PRESENTATION_TEMPLATES[0]
                  : PRESENTATION_TEMPLATES.find(template => template.category === category);
                if (nextTemplate) setActiveTemplateId(nextTemplate.id);
              }}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="template-gallery-shell">
          <button
            className="template-scroll-btn"
            type="button"
            onClick={() => scrollGallery('back')}
            aria-label="Назад"
          >
            ‹
          </button>

          <div className="template-gallery-scroll" ref={scrollRef}>
            {filteredTemplates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                selected={template.id === activeTemplate.id}
                onSelect={nextTemplate => setActiveTemplateId(nextTemplate.id)}
                onUse={handleUse}
              />
            ))}
          </div>

          <button
            className="template-scroll-btn"
            type="button"
            onClick={() => scrollGallery('forward')}
            aria-label="Вперёд"
          >
            ›
          </button>
        </div>
      </section>
    </div>
  );
}
