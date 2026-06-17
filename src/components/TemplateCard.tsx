import { TemplatePreview, type TemplatePreviewVariant } from './TemplatePreview';

export interface PresentationTemplate {
  id: string;
  templateName: string;
  style: string;
  colors: string[];
  category: string;
  description: string;
  variant: TemplatePreviewVariant;
}

interface TemplateCardProps {
  template: PresentationTemplate;
  selected: boolean;
  onSelect: (template: PresentationTemplate) => void;
  onUse: (template: PresentationTemplate) => void;
}

export function TemplateCard({ template, selected, onSelect, onUse }: TemplateCardProps) {
  return (
    <div
      className={`template-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(template)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(template);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <TemplatePreview variant={template.variant} />
      <div className="template-card-body">
        <div>
          <p className="template-card-title">{template.templateName}</p>
          <p className="template-card-desc">{template.description}</p>
        </div>
        <div className="template-card-swatches" aria-hidden="true">
          {template.colors.map(color => (
            <span key={color} style={{ background: color }} />
          ))}
        </div>
      </div>
      {selected && (
        <div className="template-card-actions">
          <button
            className="template-use-btn"
            type="button"
            onClick={event => {
              event.stopPropagation();
              onUse(template);
            }}
          >
            Использовать этот дизайн
          </button>
        </div>
      )}
    </div>
  );
}
