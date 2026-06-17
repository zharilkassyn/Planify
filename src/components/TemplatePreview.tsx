export type TemplatePreviewVariant =
  | 'aurora'
  | 'ocean'
  | 'neon'
  | 'minimal'
  | 'business'
  | 'creative'
  | 'academic'
  | 'sunset';

interface TemplatePreviewProps {
  variant: TemplatePreviewVariant;
}

export function TemplatePreview({ variant }: TemplatePreviewProps) {
  return (
    <div className={`template-preview template-preview-${variant}`}>
      <div className="template-preview-slide">
        <div className="template-preview-topline" />
        <div className="template-preview-title">
          <span />
          <span />
        </div>
        <div className="template-preview-content">
          <div className="template-preview-copy">
            <span />
            <span />
            <span />
          </div>
          <div className="template-preview-visual">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="template-preview-footer">
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
