import { useState } from 'react';
import type { PresentationSlide } from './LayoutSystem';
import { getLayoutLabel } from './LayoutSystem';
import { SlideRenderer } from './SlideRenderer';
import type { PresentationTheme } from './TemplateEngine';

type DownloadFormat = 'pdf' | 'pptx';

interface PresentationPreviewProps {
  slides: PresentationSlide[];
  topic: string;
  theme: PresentationTheme;
  selectedTemplateName?: string;
  downloadOpen: boolean;
  downloadStatus: string;
  onToggleDownload: () => void;
  onDownload: (format: DownloadFormat) => void;
}

export function PresentationPreview({
  slides,
  topic,
  theme,
  selectedTemplateName,
  downloadOpen,
  downloadStatus,
  onToggleDownload,
  onDownload,
}: PresentationPreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex] ?? slides[0];

  function move(direction: -1 | 1) {
    setActiveIndex(current => Math.min(slides.length - 1, Math.max(0, current + direction)));
  }

  if (!activeSlide) return null;

  return (
    <div className="presentation-preview">
      <div className="pres-preview-header">
        <div>
          <p className="pres-modal-title" style={{ textAlign: 'left', marginBottom: 4 }}>Предпросмотр презентации</p>
          <p style={{ fontSize: 13, color: 'var(--soft)' }}>
            «{topic}» · {slides.length} слайдов{selectedTemplateName ? ` · ${selectedTemplateName}` : ''}
          </p>
        </div>
        <div className="pres-download-wrap">
          <button className="pres-download-main" onClick={onToggleDownload}>
            Скачать
            <span aria-hidden="true">⌄</span>
          </button>
          {downloadOpen && (
            <div className="pres-download-menu">
              <button onClick={() => onDownload('pdf')}>Скачать PDF</button>
              <button onClick={() => onDownload('pptx')}>Скачать PPTX</button>
            </div>
          )}
        </div>
      </div>

      {downloadStatus && <p className="pres-download-status">{downloadStatus}</p>}

      <div className="presentation-stage">
        <button
          className="presentation-stage-arrow"
          type="button"
          onClick={() => move(-1)}
          disabled={activeIndex === 0}
          aria-label="Предыдущий слайд"
        >
          ‹
        </button>

        <div className="presentation-stage-slide">
          <SlideRenderer
            slide={activeSlide}
            index={activeIndex}
            total={slides.length}
            topic={topic}
            theme={theme}
          />
        </div>

        <button
          className="presentation-stage-arrow"
          type="button"
          onClick={() => move(1)}
          disabled={activeIndex === slides.length - 1}
          aria-label="Следующий слайд"
        >
          ›
        </button>
      </div>

      <div className="presentation-preview-meta">
        <strong>Слайд {activeIndex + 1}</strong>
        <span>{getLayoutLabel(activeSlide.layout)}</span>
        <span>{activeSlide.visualPrompt}</span>
      </div>

      <div className="presentation-thumbnails" aria-label="Миниатюры слайдов">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            className={index === activeIndex ? 'active' : ''}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`Открыть слайд ${index + 1}`}
          >
            <SlideRenderer slide={slide} index={index} total={slides.length} topic={topic} theme={theme} compact />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
