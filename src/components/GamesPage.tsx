import { lazy, Suspense, useState } from 'react';

const BlockBlastGame = lazy(() => import('./BlockBlastGame').then(module => ({ default: module.BlockBlastGame })));
const ChessGame = lazy(() => import('./ChessGame').then(module => ({ default: module.ChessGame })));
const FillCupGame = lazy(() => import('./FillCupGame').then(module => ({ default: module.FillCupGame })));
const Game2048 = lazy(() => import('./Game2048').then(module => ({ default: module.Game2048 })));
const SudokuGame = lazy(() => import('./SudokuGame').then(module => ({ default: module.SudokuGame })));
const Tennis3DGame = lazy(() => import('./Tennis3DGame').then(module => ({ default: module.Tennis3DGame })));

type GameId = 'block-blast' | 'sudoku' | 'chess' | 'cup' | '2048' | 'tennis';

type GameCard = {
  id: GameId;
  title: string;
  desc: string;
  featured?: boolean;
  difficulty?: boolean;
};

const games: GameCard[] = [
  {
    id: 'block-blast',
    title: 'Block Blast ⭐',
    desc: 'Расслабься и очисти поле',
    featured: true,
  },
  {
    id: 'sudoku',
    title: 'Судоку',
    desc: 'Классическая игра для тренировки логики',
  },
  {
    id: 'chess',
    title: 'Шахматы с ИИ',
    desc: 'Играй с ИИ разных уровней',
  },
  {
    id: 'cup',
    title: 'Наполни стакан 💧',
    desc: 'Нарисуй путь и заполни стакан водой',
  },
  {
    id: '2048',
    title: '2048',
    desc: 'Объединяй числа и улучшай результат',
  },
  {
    id: 'tennis',
    title: 'Теннис с ИИ 🎾',
    desc: 'Короткие матчи во время перерыва',
  },
];

function GamePreview({ id }: { id: GameId }) {
  if (id === 'block-blast') {
    return (
      <div className="game-preview-scene block-preview">
        <div className="block-board">
          {Array.from({ length: 25 }).map((_, index) => <span key={index} />)}
        </div>
        <div className="block-shapes">
          <i className="shape shape-l"><b/><b/><b/><b/></i>
          <i className="shape shape-line"><b/><b/><b/></i>
          <i className="shape shape-square"><b/><b/><b/><b/></i>
        </div>
      </div>
    );
  }

  if (id === 'sudoku') {
    const cells = ['5', '', '8', '', '', '7', '', '2', '', '', '9', '', '4', '', '', '', '6', '', '8', '', '', '', '3', '', '', '1', ''];
    return (
      <div className="game-preview-scene sudoku-modern">
        {cells.map((cell, index) => <span key={index}>{cell}</span>)}
      </div>
    );
  }

  if (id === 'chess') {
    const pieces = ['♜', '', '♞', '', '', '♙', '', '♛', '♙', '', '♔', '', '', '♙', '', '♖'];
    return (
      <div className="game-preview-scene chess-preview">
        {pieces.map((piece, index) => <span key={index}>{piece}</span>)}
      </div>
    );
  }

  if (id === 'cup') {
    return (
      <div className="game-preview-scene cup-preview">
        <span className="water-drop" />
        <span className="water-path" />
        <div className="cup-glass">
          <i />
        </div>
      </div>
    );
  }

  if (id === '2048') {
    const tiles = ['2', '4', '', '8', '16', '32', '', '64', '128'];
    return (
      <div className="game-preview-scene tiles-2048">
        {tiles.map((tile, index) => <span key={index} className={tile ? 'filled' : ''}>{tile}</span>)}
      </div>
    );
  }

  return (
    <div className="game-preview-scene tennis-preview">
      <span className="court-line mid" />
      <span className="court-line top" />
      <span className="court-line bottom" />
      <span className="tennis-player user" />
      <span className="tennis-player ai" />
      <span className="tennis-ball" />
    </div>
  );
}

export function GamesPage() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const backToGames = () => setActiveGame(null);

  function renderActiveGame() {
    if (activeGame === 'sudoku') return <SudokuGame onBack={backToGames} />;
    if (activeGame === 'block-blast') return <BlockBlastGame onBack={backToGames} />;
    if (activeGame === 'chess') return <ChessGame onBack={backToGames} />;
    if (activeGame === 'cup') return <FillCupGame onBack={backToGames} />;
    if (activeGame === '2048') return <Game2048 onBack={backToGames} />;
    if (activeGame === 'tennis') return <Tennis3DGame onBack={backToGames} />;
    return null;
  }

  if (activeGame) {
    return (
      <Suspense fallback={<div className="game-screen-loading">Загрузка игры…</div>}>
        {renderActiveGame()}
      </Suspense>
    );
  }

  return (
    <div className="games-page">
      <header className="games-header">
        <div>
          <div className="games-title-row">
            <h2>Игры</h2>
            <span className="games-title-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <line x1="6" y1="12" x2="10" y2="12"/>
                <line x1="8" y1="10" x2="8" y2="14"/>
                <line x1="15" y1="13" x2="15.01" y2="13"/>
                <line x1="18" y1="11" x2="18.01" y2="11"/>
                <path d="M5.4 18.6A3.5 3.5 0 011 15.2l1.2-6.1A5 5 0 017.1 5h9.8a5 5 0 014.9 4.1l1.2 6.1a3.5 3.5 0 01-4.4 3.4l-2.7-.8H8.1z"/>
              </svg>
            </span>
          </div>
          <p>Отдохни и перезагрузи мозг во время перемены.</p>
        </div>
      </header>

      <section className="games-hero">
        <div>
          <h3>Делай перерывы с пользой!</h3>
          <p>Короткая игра поможет снять напряжение и улучшить концентрацию.</p>
        </div>
      </section>

      <section className="games-grid" aria-label="Список игр">
        {games.map(game => (
          <article key={game.id} className={`game-card game-card-${game.id}${game.featured ? ' featured' : ''}`}>
            <div className="game-copy">
              <h3>{game.title}</h3>
              <p>{game.desc}</p>
              {game.difficulty && (
                <div className="game-difficulty" aria-label="Сложность">
                  <button type="button">Легко</button>
                  <button type="button" className="active">Средне</button>
                  <button type="button">Сложно</button>
                </div>
              )}
              <button className="game-play-btn" type="button" onClick={() => setActiveGame(game.id)}>Играть</button>
            </div>
            <GamePreview id={game.id} />
          </article>
        ))}
      </section>

    </div>
  );
}
