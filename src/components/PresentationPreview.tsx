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
  downloadOpen: boolean;
  downloadStatus: string;
  onDownload: (format: DownloadFormat) => void;
}

export function PresentationPreview({
  slides,
  topic,
  theme,
  downloadOpen,
  downloadStatus,
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
        <div className="pres-download-wrap pres-download-inline">
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="presentation-preview-meta">
        <strong>Слайд {activeIndex + 1}</strong>
        <span>{getLayoutLabel(activeSlide.layout)}</span>
        <span>{activeSlide.title}</span>
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
