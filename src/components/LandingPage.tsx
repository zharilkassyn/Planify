import { useState } from 'react';
import { Auth } from './Auth';

export function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);

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
            <Auth />
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="land-nav">
        <div className="land-nav-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <circle cx="12" cy="13" r="8"/>
            <path d="M7 3A2 2 0 0110 1"/><path d="M14 1A2 2 0 0117 3"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/>
          </svg>
          <span className="land-nav-brand">Planify</span>
        </div>
        <div className="land-nav-right">
        <nav className="land-nav-links">
          <div className="land-nav-dropdown">
            <span className="land-nav-trigger">
              Возможности
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
            <div className="land-nav-menu">
              {[
                { icon: '📅', title: 'Умное расписание', desc: 'Автоматическая сортировка уроков и внеклассных занятий. Больше не нужно держать всё в голове.' },
                { icon: '⏱️', title: 'Фокус-таймер', desc: 'Научно доказанный метод для продуктивной работы. 25 минут интенсивной учебы + 5 минут отдыха, чтобы не перегореть.' },
                { icon: '🤖', title: 'ИИ-помощник', desc: 'Твой личный тьютор. Попроси объяснить сложную тему, составить конспект или сгенерировать флеш-карточки.' },
                { icon: '📊', title: 'Трекер прогресса', desc: 'Визуализация твоего успеха. Видь, сколько тем ты прошёл и на сколько процентов близок к цели.' },
              ].map(item => (
                <div key={item.title} className="land-nav-menu-item">
                  <span className="land-nav-menu-icon">{item.icon}</span>
                  <div>
                    <div className="land-nav-menu-title">{item.title}</div>
                    <div className="land-nav-menu-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="land-nav-dropdown">
            <span className="land-nav-trigger">
              Как это работает
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
            <div className="land-nav-menu" style={{ width: 400 }}>
              {[
                { step: '1', title: 'Добавь свои задачи', desc: 'Просто введи предметы, дедлайны или темы, которые нужно выучить сегодня.' },
                { step: '2', title: 'Включи режим фокусировки', desc: 'Запусти Фокус-таймер, когда садишься за уроки. Мы уберём всё лишнее, чтобы ты не отвлекался.' },
                { step: '3', title: 'Получай мгновенную помощь от ИИ', desc: 'Если застрял на задаче — нажми кнопку ИИ-помощника, чтобы получить подсказку или объяснение.' },
                { step: '4', title: 'Анализируй результат', desc: 'Смотри, сколько времени ты уделил каждому предмету и как растёт твой уровень знаний.' },
              ].map(item => (
                <div key={item.step} className="land-nav-menu-item">
                  <span className="land-nav-step">{item.step}</span>
                  <div>
                    <div className="land-nav-menu-title">{item.title}</div>
                    <div className="land-nav-menu-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>
        <button className="land-btn-login" onClick={() => setShowAuth(true)}>Войти</button>
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
            Учись умнее,<br/>
            <span className="land-headline-accent">а не дольше</span>
          </h1>

          <p className="land-desc">
            Планируй, учись, отслеживай прогресс и используй ИИ-помощника, который поможет понять и запомнить больше.
          </p>

          <ul className="land-features">
            {[
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>, title: 'Умный планировщик', desc: 'Составляй расписание и следуй плану' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg>, title: 'Фокус-таймер', desc: 'Концентрируйся с помощью Pomodoro' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, title: 'Отслеживание прогресса', desc: 'Визуализируй свои достижения' },
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
            <button className="land-btn-primary" onClick={() => setShowAuth(true)}>
              Начать бесплатно →
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="16"/></svg>
                <span style={{fontSize:13,fontWeight:800,color:'#1E293B'}}>Planify</span>
              </div>
              {[
                {lbl:'Главная',act:true,icon:'🏠'},
                {lbl:'Планировщик',act:false,icon:'📅'},
                {lbl:'Таймер',act:false,icon:'⏱'},
                {lbl:'Прогресс',act:false,icon:'📊'},
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
                  <div style={{fontSize:11,fontWeight:700,color:'#1E293B',marginBottom:10}}>Прогресс за неделю</div>
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
    </div>
  );
}
