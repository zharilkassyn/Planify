import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Auth } from './Auth';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

const GAME_PREVIEWS = [
  {
    title: 'Судоку',
    art: (
      <div className="land-sudoku-board" aria-hidden="true">
        {['5', '', '2', '', '9', '', '7', '', '4'].map((cell, index) => <span key={index}>{cell}</span>)}
      </div>
    ),
  },
  {
    title: 'Шахматы',
    art: (
      <div className="land-chess-scene" aria-hidden="true">
        <span className="chess-piece-main" />
        <span className="chess-piece-shadow" />
      </div>
    ),
  },
  {
    title: '2048',
    art: (
      <div className="land-tiles-2048" aria-hidden="true">
        {['2', '4', '8', '16'].map(tile => <span key={tile}>{tile}</span>)}
      </div>
    ),
  },
  {
    title: 'Теннис',
    art: (
      <div className="land-tennis-scene" aria-hidden="true">
        <span className="tennis-court-line" />
        <span className="tennis-racket" />
        <span className="tennis-ball" />
      </div>
    ),
  },
];

const WHY_CARDS = [
  { title: 'Всё в одном месте', text: 'План, заметки, карточки, ИИ, статистика и игры не разбросаны по разным приложениям.' },
  { title: 'Удобно каждый день', text: 'Интерфейс спокойно ведёт по учебному процессу и не мешает сосредоточиться.' },
  { title: 'Современно', text: 'Мягкие блоки, понятные состояния и быстрые действия делают работу лёгкой.' },
  { title: 'Красиво', text: 'Минималистичный визуальный стиль помогает учиться без визуального шума.' },
];

function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -80px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`land-reveal${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  function openAuth(mode: 'signin' | 'signup') {
    setAuthMode(mode);
    setShowAuth(true);
  }

  return (
    <div className="land-root" style={{
      '--primary':       '#2563EB',
      '--primary-light': '#EFF6FF',
      '--primary-mid':   '#BFDBFE',
      '--primary-dark':  '#1D4ED8',
    } as React.CSSProperties}>
      {/* Auth modal */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440 }}>
            <Auth initialMode={authMode} />
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="land-nav">
        <div className="land-nav-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <path d="M6 3h9l3 3v15H6z"/>
            <path d="M15 3v4h4"/>
            <line x1="9" y1="11" x2="16" y2="11"/>
            <line x1="9" y1="15" x2="16" y2="15"/>
            <line x1="9" y1="19" x2="13" y2="19"/>
          </svg>
          <span className="land-nav-brand">Planify</span>
        </div>
        <div className="land-nav-right">
          <button className="land-btn-login" onClick={() => openAuth('signin')}>Войти</button>
        </div>
      </header>

      {/* Hero */}
      <section className="land-hero">
        <div className="land-hero-left">
          <div className="land-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Всё для эффективной учёбы в одном месте
          </div>

          <h1 className="land-headline">
            Каждый день<br/>
            <span className="land-headline-accent">ближе к цели.</span>
          </h1>

          <p className="land-desc">
            Планируй, учись, отслеживай результаты и используй ИИ-помощника, который поможет понять и запомнить больше.
          </p>

          <ul className="land-features">
            {[
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>, title: 'Умный планировщик', desc: 'Составляй расписание и следуй плану' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg>, title: 'Фокус-таймер', desc: 'Концентрируйся с помощью Pomodoro' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, title: 'Статистика', desc: 'Визуализируй свои достижения' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>, title: 'ИИ-помощник', desc: 'Конспекты, флеш-карты, объяснения и другое' },
            ].map(f => (
              <li key={f.title} className="land-feature-item">
                <span className="land-feature-icon">{f.icon}</span>
                <span>
                  <strong>{f.title}</strong>
                  <span className="land-feature-desc">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="land-cta-row">
            <button className="land-btn-primary" onClick={() => openAuth('signup')}>
              Начать →
            </button>
          </div>
          <div className="land-trust">
            <span>✓ Бесплатный доступ</span>
            <span>✓ Без привязки карты</span>
          </div>
        </div>

        {/* App preview mockup */}
        <div className="land-hero-right">

          {/* 3D Mockup */}
          <div className="land-mockup land-mockup-3d">

            {/* Sidebar */}
            <div style={{width:150,flexShrink:0,background:'white',borderRight:'1px solid #E2E8F0',padding:'20px 12px',display:'flex',flexDirection:'column',gap:2}}>
              <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:18,padding:'0 4px'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><line x1="9" y1="11" x2="16" y2="11"/><line x1="9" y1="15" x2="16" y2="15"/><line x1="9" y1="19" x2="13" y2="19"/></svg>
                <span style={{fontSize:13,fontWeight:800,color:'#1E293B'}}>Planify</span>
              </div>
              {[
                {lbl:'Главная',act:true,icon:'🏠'},
                {lbl:'Планировщик',act:false,icon:'📅'},
                {lbl:'Таймер',act:false,icon:'⏱'},
                {lbl:'ИИ-помощник',act:false,icon:'🤖'},
                {lbl:'Флеш-карты',act:false,icon:'🃏'},
                {lbl:'Заметки',act:false,icon:'📝'},
                {lbl:'+ Ещё',act:false,icon:''},
              ].map(({lbl,act,icon}) => (
                <div key={lbl} style={{fontSize:12,padding:'8px 10px',borderRadius:8,background:act?'#DBEAFE':'transparent',color:act?'#2563EB':'#64748B',fontWeight:act?700:400,display:'flex',alignItems:'center',gap:6}}>
                  {icon && <span style={{fontSize:12}}>{icon}</span>}
                  {lbl}
                </div>
              ))}
            </div>

            {/* Main */}
            <div style={{flex:1,background:'#F0F6FF',padding:18,display:'flex',flexDirection:'column',gap:12,overflow:'hidden'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#1E293B'}}>
                Добро пожаловать! 👋
                <br/><span style={{fontSize:12,fontWeight:400,color:'#64748B'}}>Готов к продуктивному дню?</span>
              </div>

              <div style={{background:'white',borderRadius:14,padding:12,border:'1px solid #E2E8F0'}}>
                <div style={{fontSize:12,fontWeight:700,color:'#1E293B',marginBottom:10}}>
                  План на сегодня <span style={{fontSize:10,color:'#64748B',fontWeight:400}}>15 мая, среда</span>
                </div>
                {[['10:00','Математика','1ч 30м'],['12:00','Английский язык','1ч'],['14:00','Физика','1ч 30м'],['16:00','Перерыв','30м'],['16:30','История','1ч']].map(([t,n,d]) => (
                  <div key={n} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid #F1F5F9'}}>
                    <span style={{fontSize:10,color:'#94A3B8',width:36,flexShrink:0}}>{t}</span>
                    <span style={{fontSize:11,color:'#1E293B',flex:1}}>{n}</span>
                    <span style={{fontSize:10,color:'#94A3B8'}}>{d}</span>
                  </div>
                ))}
                <div style={{fontSize:11,color:'#2563EB',marginTop:10,cursor:'default'}}>+ Добавить задачу</div>
              </div>

              <div style={{display:'flex',gap:10}}>
                <div style={{flex:1,background:'white',borderRadius:12,padding:12,border:'1px solid #E2E8F0'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#1E293B',marginBottom:10}}>Статистика за неделю</div>
                  <div style={{display:'flex',alignItems:'flex-end',gap:5,height:58}}>
                    {[40,55,70,45,90,60,30].map((h,i) => (
                      <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,height:'100%',justifyContent:'flex-end'}}>
                        <div style={{width:'100%',borderRadius:'4px 4px 0 0',height:h+'%',background:i===4?'#2563EB':'#DBEAFE'}}/>
                        <span style={{fontSize:8,color:'#94A3B8'}}>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{width:100,background:'white',borderRadius:12,padding:12,border:'1px solid #E2E8F0'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#1E293B',marginBottom:8}}>Цели</div>
                  <div style={{position:'relative',width:62,height:62,margin:'0 auto 8px'}}>
                    <svg width="62" height="62" viewBox="0 0 62 62" style={{transform:'rotate(-90deg)'}}>
                      <circle cx="31" cy="31" r="24" fill="none" stroke="#DBEAFE" strokeWidth="7"/>
                      <circle cx="31" cy="31" r="24" fill="none" stroke="#2563EB" strokeWidth="7" strokeDasharray={`${2*Math.PI*24*0.72} ${2*Math.PI*24}`} strokeLinecap="round"/>
                    </svg>
                    <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:13,fontWeight:700,color:'#1E293B'}}>72%</span>
                      <span style={{fontSize:8,color:'#94A3B8'}}>Выполнено</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    {[['#2563EB','Выполнено','18'],['#6366F1','В процессе','6'],['#CBD5E1','Осталось','9']].map(([c,l,v]) => (
                      <div key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:'#64748B'}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:c,flexShrink:0}}/>
                        <span style={{flex:1}}>{l}</span><b style={{color:'#1E293B'}}>{v}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{background:'#EFF6FF',borderRadius:12,padding:'10px 12px',display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:9,background:'#2563EB',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>🤖</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#1E293B'}}>ИИ-помощник</div>
                  <div style={{fontSize:9,color:'#64748B'}}>Загрузи материал и получи конспект, флеш-карты и объяснения</div>
                </div>
                <div style={{fontSize:10,fontWeight:700,background:'#2563EB',color:'white',borderRadius:7,padding:'6px 10px',whiteSpace:'nowrap',flexShrink:0}}>Попробовать</div>
              </div>
            </div>

            {/* Timer panel */}
            <div style={{width:148,flexShrink:0,background:'white',borderLeft:'1px solid #E2E8F0',padding:'20px 14px',display:'flex',flexDirection:'column',alignItems:'center'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#1E293B',marginBottom:12,textAlign:'center'}}>Фокус-таймер</div>
              <div style={{position:'relative',width:104,height:104,margin:'0 auto 12px'}}>
                <svg width="104" height="104" viewBox="0 0 104 104" style={{transform:'rotate(-90deg)'}}>
                  <circle cx="52" cy="52" r="42" fill="none" stroke="#DBEAFE" strokeWidth="9"/>
                  <circle cx="52" cy="52" r="42" fill="none" stroke="#2563EB" strokeWidth="9" strokeDasharray={`${2*Math.PI*42*0.96} ${2*Math.PI*42}`} strokeLinecap="round"/>
                </svg>
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{fontSize:24,fontWeight:800,color:'#1E293B'}}>25:00</div>
                  <div style={{fontSize:11,color:'#64748B'}}>Фокус</div>
                </div>
              </div>
              <button style={{width:'100%',padding:'9px 0',background:'#2563EB',color:'white',border:'none',borderRadius:9,fontSize:12,fontWeight:700,cursor:'default',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                ▶ Начать
              </button>
              <div style={{width:30,height:30,borderRadius:9,border:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="land-main land-story-main">
        <Reveal className="land-section land-story-intro" delay={80}>
          <span className="land-story-kicker">Возможности Planify</span>
          <h2>Все инструменты для учёбы в одном месте.</h2>
        </Reveal>

        <section className="land-feature-showcase-list" id="features">
          <Reveal className="land-section land-showcase-panel land-showcase-planner">
            <div className="land-showcase-copy">
              <span>Планировщик</span>
              <h2>Собери день в понятный учебный маршрут.</h2>
              <p>Расписание, задачи и приоритеты выглядят как чистая карта дня: сразу видно, что делать сейчас и что будет дальше.</p>
            </div>
            <div className="land-product-frame land-planner-mock" aria-hidden="true">
              <div className="land-mini-toolbar">
                <strong>Сегодня</strong>
                <span>5 задач</span>
              </div>
              {[
                ['09:00', 'Математика', 'Высокий'],
                ['11:30', 'Английский', 'Средний'],
                ['14:00', 'Физика', 'Высокий'],
                ['16:30', 'Повторение', 'Лёгкий'],
              ].map(([time, title, tag]) => (
                <div key={title} className="land-plan-row">
                  <span>{time}</span>
                  <strong>{title}</strong>
                  <i>{tag}</i>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal className="land-section land-showcase-panel land-showcase-notes" delay={120}>
            <div className="land-product-frame land-notes-mock" aria-hidden="true">
              <aside>
                <span>Папки</span>
                <b>Алгебра</b>
                <b>История</b>
                <b>Английский</b>
              </aside>
              <div>
                <span>Заметка</span>
                <h3>Учебный план на сегодня</h3>
                <ul className="land-note-tasks">
                  <li><b />Решить 12 задач по алгебре</li>
                  <li><b />Повторить 25 новых слов</li>
                  <li><b />Прочитать параграф по истории</li>
                  <li><b />Сделать короткий конспект</li>
                </ul>
              </div>
            </div>
            <div className="land-showcase-copy">
              <span>Заметки</span>
              <h2>Материалы не теряются и остаются под рукой.</h2>
              <p>Папки, история и редактор помогают быстро вернуться к теме, которую ты уже разбирал.</p>
            </div>
          </Reveal>

          <Reveal className="land-section land-showcase-panel land-showcase-flashcards" delay={160}>
            <div className="land-showcase-copy">
              <span>Флешкарточки</span>
              <h2>Повторение становится лёгким и визуальным.</h2>
              <p>Карточки появляются как колода: термин, ответ и прогресс повторения собраны в одном месте.</p>
            </div>
            <div className="land-product-frame land-flashcards-mock" aria-hidden="true">
              <div className="land-deck-card land-deck-card-back" />
              <div className="land-deck-card land-deck-card-middle" />
              <div className="land-deck-card land-deck-card-front">
                <span>Формула</span>
                <strong>Квадрат суммы</strong>
                <p>(a + b)² = a² + 2ab + b²</p>
              </div>
            </div>
          </Reveal>

          <Reveal className="land-section land-showcase-panel land-showcase-presentations" delay={200}>
            <div className="land-product-frame land-presentation-mock" aria-hidden="true">
              <div className="land-process-step active">
                <span>01</span>
                <strong>Тема</strong>
                <p>Космос и планеты</p>
              </div>
              <div className="land-process-line" />
              <div className="land-process-step">
                <span>02</span>
                <strong>Генерация</strong>
                <p>Структура и слайды</p>
              </div>
              <div className="land-slide-stack">
                <div className="land-presentation-card land-presentation-card-back" />
                <div className="land-presentation-card land-presentation-card-mid" />
                <div className="land-presentation-card land-presentation-card-front">
                  <div className="land-space-cover">
                    <span className="land-space-planet" />
                    <span className="land-space-orbit" />
                    <span className="land-space-star star-one" />
                    <span className="land-space-star star-two" />
                    <span className="land-space-star star-three" />
                  </div>
                  <div className="land-slide-caption">
                    <strong>Солнечная система</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="land-showcase-copy">
              <span>Генерация презентаций</span>
              <h2>От темы до готовой презентации за несколько шагов.</h2>
              <p>Задай тему, дождись генерации структуры и получи аккуратный материал для выступления.</p>
            </div>
          </Reveal>

          <Reveal className="land-section land-showcase-panel land-showcase-ai" delay={240}>
            <div className="land-showcase-copy">
              <span>AI помощник</span>
              <h2>Чат, который объясняет, сокращает и помогает думать.</h2>
              <p>Пиши вопрос, проси конспект, тест, план или объяснение темы простыми словами.</p>
            </div>
            <div className="land-product-frame land-chat-mock" aria-hidden="true">
              <div className="land-chat-bubble ai">Объясни тему простыми словами</div>
              <div className="land-chat-bubble user">И добавь пример</div>
              <div className="land-chat-bubble ai wide">Конечно. Начнём с идеи, потом разберём пример и сделаем короткий тест.</div>
              <div className="land-chat-input">
                <span>Спроси что-нибудь...</span>
                <b>→</b>
              </div>
            </div>
          </Reveal>

          <Reveal className="land-section land-games-section" delay={120}>
            <div className="land-section-split-head">
              <div>
                <span>Игры</span>
                <h2>Короткая пауза, которая не ломает учебный ритм.</h2>
              </div>
            </div>
            <div className="land-games-scroll" aria-label="Список игр">
              {GAME_PREVIEWS.map(game => (
                <article key={game.title} className="land-game-tile">
                  <div className="land-game-art">
                    {game.art}
                  </div>
                  <strong>{game.title}</strong>
                </article>
              ))}
            </div>
          </Reveal>

          <Reveal className="land-section land-showcase-panel land-showcase-stats" delay={160}>
            <div className="land-showcase-copy">
              <span>Статистика</span>
              <h2>Видно, как растёт фокус и закрываются цели.</h2>
              <p>Графики показывают выполненные задачи, время в фокусе и движение к результату без лишней сложности.</p>
            </div>
            <div className="land-product-frame land-stats-mock" aria-hidden="true">
              <div className="land-stats-dashboard-head">
                <div>
                  <span>Фокус за неделю</span>
                  <strong>18ч 40м</strong>
                </div>
                <b>+24%</b>
              </div>
              <div className="land-real-chart">
                <div className="land-real-scale">
                  <span>8ч</span>
                  <span>6ч</span>
                  <span>4ч</span>
                  <span>2ч</span>
                  <span>0ч</span>
                </div>
                <div className="land-real-plot">
                  <svg viewBox="0 0 420 210" preserveAspectRatio="none">
                    <path d="M0 26H420M0 72H420M0 118H420M0 164H420" className="land-stats-grid" />
                    <path d="M16 158 C58 132 78 144 116 106 C160 62 184 88 224 70 C272 46 298 76 336 44 C366 20 386 34 408 26" className="land-stats-line" />
                    <path d="M16 158 C58 132 78 144 116 106 C160 62 184 88 224 70 C272 46 298 76 336 44 C366 20 386 34 408 26 L408 198 L16 198 Z" className="land-stats-area" />
                    <circle cx="116" cy="106" r="5" />
                    <circle cx="224" cy="70" r="5" />
                    <circle cx="336" cy="44" r="5" />
                    <circle cx="408" cy="26" r="5" />
                  </svg>
                  <div className="land-real-bars">
                    {[
                      ['Пн', 48],
                      ['Вт', 63],
                      ['Ср', 54],
                      ['Чт', 78],
                      ['Пт', 92],
                      ['Сб', 67],
                      ['Вс', 84],
                    ].map(([day, value]) => (
                      <div key={day}>
                        <span style={{ height: `${value}%` }} />
                        <small>{day}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="land-stats-summary">
                <span><b /> 31 задача выполнена</span>
                <span><b /> 7 дней активности</span>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="land-section land-why-section" id="why">
          <Reveal className="land-section-split-head">
            <div>
              <span>Почему Planify</span>
              <h2>Не больше инструментов. Меньше хаоса.</h2>
            </div>
          </Reveal>
          <div className="land-why-grid">
            {WHY_CARDS.map((card, index) => (
              <Reveal key={card.title} className="land-why-card" delay={index * 120}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal className="land-section land-final-screen">
          <span>Готов начать</span>
          <h2>Пусть каждый учебный день будет понятнее.</h2>
          <p>Открой Planify и собери свои задачи, заметки, карточки и прогресс в одном месте.</p>
          <button className="land-btn-primary" onClick={() => openAuth('signup')}>
            Начать пользоваться
          </button>
        </Reveal>
      </main>

      <footer className="land-footer">
        <div className="land-nav-logo land-footer-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <path d="M6 3h9l3 3v15H6z"/>
            <path d="M15 3v4h4"/>
            <line x1="9" y1="11" x2="16" y2="11"/>
            <line x1="9" y1="15" x2="16" y2="15"/>
            <line x1="9" y1="19" x2="13" y2="19"/>
          </svg>
          <span className="land-nav-brand">Planify</span>
        </div>
        <nav>
          <a href="#features">Возможности</a>
          <button type="button" onClick={() => openAuth('signin')}>Войти</button>
        </nav>
        <span>© 2026 Planify. Все права защищены.</span>
      </footer>
    </div>
  );
}
