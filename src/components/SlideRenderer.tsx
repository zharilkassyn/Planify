import type { CSSProperties } from 'react';
import type { PresentationSlide } from './LayoutSystem';
import type { PresentationTheme } from './TemplateEngine';

const SLIDE_W = 1280;
const SLIDE_H = 720;

interface SlideRendererProps {
  slide: PresentationSlide;
  index: number;
  total: number;
  topic: string;
  theme: PresentationTheme;
  compact?: boolean;
}

export function SlideRenderer({ slide, index, total, topic, theme, compact = false }: SlideRendererProps) {
  const style = {
    '--slide-bg': theme.gradient,
    '--slide-primary': theme.primary,
    '--slide-secondary': theme.secondary,
    '--slide-accent': theme.accent,
    '--slide-surface': theme.surface,
    '--slide-text': theme.text,
    '--slide-muted': theme.muted,
    '--slide-line': theme.line,
  } as CSSProperties;

  return (
    <article className={`slide-renderer slide-${slide.layout}${compact ? ' compact' : ''}`} style={style}>
      <div className="slide-chrome">
        <span>{topic}</span>
        <span>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>

      {slide.layout === 'title' && (
        <div className="slide-layout-title">
          <div>
            <span className="slide-kicker">{topic}</span>
            <h2>{slide.title}</h2>
            <p>{slide.subtitle}</p>
          </div>
          <VisualBlock slide={slide} theme={theme} large />
        </div>
      )}

      {slide.layout === 'text-image' && (
        <div className="slide-layout-text-image">
          <div>
            <span className="slide-kicker">{topic}</span>
            <h2>{slide.title}</h2>
            <p>{slide.subtitle}</p>
            <ul>
              {slide.content.slice(0, 4).map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <VisualBlock slide={slide} theme={theme} />
        </div>
      )}

      {slide.layout === 'cards' && (
        <div className="slide-layout-cards">
          <div className="slide-heading with-visual">
            <div>
              <span className="slide-kicker">{topic}</span>
              <h2>{slide.title}</h2>
              <p>{slide.subtitle}</p>
            </div>
            <VisualBlock slide={slide} theme={theme} />
          </div>
          <div className="slide-card-grid">
            {slide.content.slice(0, 4).map((item, itemIndex) => (
              <div className="slide-info-card" key={item}>
                <span>{String(itemIndex + 1).padStart(2, '0')}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.layout === 'timeline' && (
        <div className="slide-layout-timeline">
          <div className="slide-heading with-visual">
            <div>
              <span className="slide-kicker">{topic}</span>
              <h2>{slide.title}</h2>
              <p>{slide.subtitle}</p>
            </div>
            <VisualBlock slide={slide} theme={theme} />
          </div>
          <div className="slide-timeline-line">
            {slide.timeline.slice(0, 4).map(item => (
              <div className="slide-timeline-item" key={`${item.label}-${item.text}`}>
                <span>{item.label}</span>
                <strong>{item.text}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.layout === 'statistics' && (
        <div className="slide-layout-statistics">
          <div className="slide-heading with-visual">
            <div>
              <span className="slide-kicker">{topic}</span>
              <h2>{slide.title}</h2>
              <p>{slide.subtitle}</p>
            </div>
            <VisualBlock slide={slide} theme={theme} />
          </div>
          <div className="slide-stat-grid">
            {slide.stats.slice(0, 3).map((stat, statIndex) => (
              <div className="slide-stat-card" key={`${stat.value}-${stat.label}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                <i style={{ width: `${55 + statIndex * 15}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.layout === 'comparison' && (
        <div className="slide-layout-comparison">
          <div className="slide-heading with-visual">
            <div>
              <span className="slide-kicker">{topic}</span>
              <h2>{slide.title}</h2>
              <p>{slide.subtitle}</p>
            </div>
            <VisualBlock slide={slide} theme={theme} />
          </div>
          <div className="slide-comparison-grid">
            <ComparisonColumn title={slide.comparison?.leftTitle ?? 'Подход 1'} items={slide.comparison?.left ?? slide.content.slice(0, 3)} />
            <ComparisonColumn title={slide.comparison?.rightTitle ?? 'Подход 2'} items={slide.comparison?.right ?? slide.content.slice(1, 4)} />
          </div>
        </div>
      )}

      {slide.layout === 'quote' && (
        <div className="slide-layout-quote">
          <VisualBlock slide={slide} theme={theme} />
          <div>
            <div className="slide-quote-mark">“</div>
            <blockquote>{slide.quote ?? slide.subtitle}</blockquote>
            <span>{slide.attribution ?? topic}</span>
          </div>
        </div>
      )}

      {slide.layout === 'summary' && (
        <div className="slide-layout-summary">
          <div>
            <span className="slide-kicker">{topic}</span>
            <h2>{slide.title}</h2>
            <p>{slide.subtitle}</p>
          </div>
          <div className="slide-conclusion-list">
            {slide.content.slice(0, 4).map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
      )}
    </article>
  );
}

function ComparisonColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="slide-comparison-column">
      <strong>{title}</strong>
      {items.slice(0, 3).map(item => <span key={item}>{item}</span>)}
    </div>
  );
}

function VisualBlock({ slide, theme, large = false }: { slide: PresentationSlide; theme: PresentationTheme; large?: boolean }) {
  return (
    <div className={`slide-visual-block${large ? ' large' : ''}`} aria-label={slide.visualPrompt}>
      <div className="slide-photo-haze" />
      <div className="slide-photo-subject">
        <span style={{ background: theme.primary }} />
        <span style={{ background: theme.secondary }} />
        <span style={{ background: theme.accent }} />
      </div>
    </div>
  );
}

export function renderSlideToImage(
  slide: PresentationSlide,
  index: number,
  total: number,
  topic: string,
  theme: PresentationTheme,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');

  paintBackground(ctx, theme);
  paintChrome(ctx, theme, index, total, topic);

  switch (slide.layout) {
    case 'title':
      paintTitle(ctx, slide, topic, theme);
      break;
    case 'text-image':
      paintTextImage(ctx, slide, theme);
      break;
    case 'cards':
      paintCards(ctx, slide, theme);
      break;
    case 'timeline':
      paintTimeline(ctx, slide, theme);
      break;
    case 'statistics':
      paintStatistics(ctx, slide, theme);
      break;
    case 'comparison':
      paintComparison(ctx, slide, theme);
      break;
    case 'quote':
      paintQuote(ctx, slide, theme);
      break;
    case 'summary':
      paintSummary(ctx, slide, theme);
      break;
  }

  return canvas.toDataURL('image/png');
}

function paintBackground(ctx: CanvasRenderingContext2D, theme: PresentationTheme) {
  const gradient = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  gradient.addColorStop(0, theme.bg);
  gradient.addColorStop(0.55, theme.primary);
  gradient.addColorStop(1, theme.secondary);
  ctx.fillStyle = theme.dark ? gradient : theme.bg;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

  if (!theme.dark) {
    const soft = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
    soft.addColorStop(0, '#FFFFFF');
    soft.addColorStop(1, theme.secondary);
    ctx.fillStyle = soft;
    ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  }

  ctx.globalAlpha = theme.dark ? 0.28 : 0.16;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(1060, 128, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.primary;
  ctx.beginPath();
  ctx.arc(160, 640, 240, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintChrome(ctx: CanvasRenderingContext2D, theme: PresentationTheme, index: number, total: number, topic: string) {
  ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.72)' : '#64748B';
  ctx.font = '700 22px Inter, Arial, sans-serif';
  ctx.fillText(topic.slice(0, 56).toUpperCase(), 78, 70);
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1}/${total}`, 1202, 70);
  ctx.textAlign = 'left';
}

function paintTitle(ctx: CanvasRenderingContext2D, slide: PresentationSlide, topic: string, theme: PresentationTheme) {
  paintPanel(ctx, 70, 104, 1140, 540, theme);
  paintKicker(ctx, topic, 120, 180, theme);
  paintHeading(ctx, slide.title, 120, 270, 650, 72, theme);
  paintBody(ctx, slide.subtitle, 120, 485, 620, 34, theme, 2);
  paintVisual(ctx, 830, 210, 260, theme);
}

function paintTextImage(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintKicker(ctx, 'Ключевые идеи', 84, 145, theme);
  paintHeading(ctx, slide.title, 84, 220, 640, 58, theme);
  paintBody(ctx, slide.subtitle, 84, 342, 610, 28, theme, 2);
  paintBullets(ctx, slide.content, 100, 440, 600, theme);
  paintVisual(ctx, 825, 210, 260, theme);
}

function paintCards(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintHeading(ctx, slide.title, 84, 156, 880, 54, theme);
  paintBody(ctx, slide.subtitle, 84, 246, 780, 26, theme, 2);
  paintVisual(ctx, 955, 132, 150, theme);
  slide.content.slice(0, 4).forEach((item, idx) => {
    const x = 84 + (idx % 2) * 560;
    const y = 350 + Math.floor(idx / 2) * 138;
    paintPanel(ctx, x, y, 500, 104, theme);
    paintKicker(ctx, `0${idx + 1}`, x + 26, y + 42, theme);
    paintBody(ctx, item, x + 94, y + 42, 350, 25, theme, 2);
  });
}

function paintTimeline(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintHeading(ctx, slide.title, 84, 158, 900, 54, theme);
  paintBody(ctx, slide.subtitle, 84, 246, 760, 26, theme, 2);
  paintVisual(ctx, 955, 128, 150, theme);
  ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.34)' : theme.line;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(145, 438);
  ctx.lineTo(1120, 438);
  ctx.stroke();
  slide.timeline.slice(0, 4).forEach((item, idx) => {
    const x = 145 + idx * 315;
    ctx.fillStyle = theme.primary;
    ctx.beginPath();
    ctx.arc(x, 438, 18, 0, Math.PI * 2);
    ctx.fill();
    paintKicker(ctx, item.label, x - 34, 378, theme);
    paintBody(ctx, item.text, x - 66, 500, 210, 24, theme, 3);
  });
}

function paintStatistics(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintHeading(ctx, slide.title, 84, 150, 850, 52, theme);
  paintBody(ctx, slide.subtitle, 84, 236, 760, 26, theme, 2);
  paintVisual(ctx, 955, 124, 150, theme);
  slide.stats.slice(0, 3).forEach((stat, idx) => {
    const x = 84 + idx * 380;
    paintPanel(ctx, x, 345, 320, 210, theme);
    ctx.fillStyle = theme.dark ? '#FFFFFF' : theme.text;
    ctx.font = '900 64px Inter, Arial, sans-serif';
    ctx.fillText(stat.value, x + 28, 430);
    paintBody(ctx, stat.label, x + 28, 482, 240, 25, theme, 2);
    ctx.fillStyle = theme.primary;
    roundRect(ctx, x + 28, 530, 170 + idx * 42, 14, 7);
    ctx.fill();
  });
}

function paintComparison(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintHeading(ctx, slide.title, 84, 145, 900, 52, theme);
  paintBody(ctx, slide.subtitle, 84, 230, 760, 26, theme, 2);
  paintVisual(ctx, 965, 124, 140, theme);
  const left = slide.comparison?.left ?? slide.content.slice(0, 3);
  const right = slide.comparison?.right ?? slide.content.slice(1, 4);
  paintCompareColumn(ctx, slide.comparison?.leftTitle ?? 'Подход 1', left, 110, 330, theme);
  paintCompareColumn(ctx, slide.comparison?.rightTitle ?? 'Подход 2', right, 680, 330, theme);
}

function paintQuote(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintPanel(ctx, 90, 118, 1100, 490, theme);
  ctx.fillStyle = theme.dark ? theme.accent : theme.primary;
  ctx.font = '900 110px Inter, Arial, sans-serif';
  ctx.fillText('“', 135, 238);
  paintHeading(ctx, slide.quote ?? slide.subtitle, 210, 300, 780, 54, theme);
  paintBody(ctx, slide.attribution ?? slide.visual, 214, 500, 620, 28, theme, 1);
  paintVisual(ctx, 940, 250, 150, theme);
}

function paintSummary(ctx: CanvasRenderingContext2D, slide: PresentationSlide, theme: PresentationTheme) {
  paintPanel(ctx, 78, 104, 1124, 540, theme);
  paintKicker(ctx, 'Итоги', 126, 176, theme);
  paintHeading(ctx, slide.title, 126, 262, 760, 64, theme);
  paintBody(ctx, slide.subtitle, 126, 402, 720, 30, theme, 2);
  slide.content.slice(0, 4).forEach((item, idx) => {
    paintBody(ctx, `• ${item}`, 150, 500 + idx * 38, 780, 25, theme, 1);
  });
}

function paintCompareColumn(ctx: CanvasRenderingContext2D, title: string, items: string[], x: number, y: number, theme: PresentationTheme) {
  paintPanel(ctx, x, y, 490, 250, theme);
  paintKicker(ctx, title, x + 32, y + 56, theme);
  paintBullets(ctx, items, x + 48, y + 110, 380, theme);
}

function paintPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: PresentationTheme) {
  ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.82)';
  roundRect(ctx, x, y, w, h, 32);
  ctx.fill();
  ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.18)' : theme.line;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function paintKicker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, theme: PresentationTheme) {
  ctx.fillStyle = theme.dark ? theme.accent : theme.primary;
  ctx.font = '900 22px Inter, Arial, sans-serif';
  ctx.fillText(text.slice(0, 64).toUpperCase(), x, y);
}

function paintHeading(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, theme: PresentationTheme) {
  ctx.fillStyle = theme.dark ? '#FFFFFF' : theme.text;
  ctx.font = `900 ${size}px Inter, Arial, sans-serif`;
  wrapCanvasText(ctx, text, maxWidth).slice(0, 3).forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * (size + 8));
  });
}

function paintBody(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, theme: PresentationTheme, maxLines: number) {
  ctx.fillStyle = theme.dark ? theme.muted : '#475569';
  ctx.font = `600 ${size}px Inter, Arial, sans-serif`;
  wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines).forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * (size + 12));
  });
}

function paintBullets(ctx: CanvasRenderingContext2D, items: string[], x: number, y: number, maxWidth: number, theme: PresentationTheme) {
  items.slice(0, 4).forEach((item, idx) => {
    ctx.fillStyle = theme.primary;
    ctx.beginPath();
    ctx.arc(x, y + idx * 48 - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    paintBody(ctx, item, x + 24, y + idx * 48, maxWidth, 25, theme, 1);
  });
}

function paintVisual(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, theme: PresentationTheme) {
  paintPanel(ctx, x, y, size, size, theme);
  const photoGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  photoGradient.addColorStop(0, theme.primary);
  photoGradient.addColorStop(0.52, theme.secondary);
  photoGradient.addColorStop(1, theme.accent);
  ctx.fillStyle = photoGradient;
  roundRect(ctx, x + 14, y + 14, size - 28, size - 28, 28);
  ctx.fill();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x + size * 0.72, y + size * 0.28, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.2)';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.18, y + size * 0.78);
  ctx.lineTo(x + size * 0.42, y + size * 0.48);
  ctx.lineTo(x + size * 0.58, y + size * 0.66);
  ctx.lineTo(x + size * 0.74, y + size * 0.42);
  ctx.lineTo(x + size * 0.88, y + size * 0.78);
  ctx.closePath();
  ctx.fill();
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
