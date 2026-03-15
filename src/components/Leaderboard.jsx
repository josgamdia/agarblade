import { useGameState } from '../hooks/useGameState.js';

export default function Leaderboard() {
  const players = useGameState(s => s.gameState.players);
  const myId = useGameState(s => s.myId);

  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 8);

  return (
    <div id="leaderboard">
      <h3>🏆 RANKING</h3>
      <div id="lbRows">
        {sorted.map((p, i) => {
          const cls = p.id === myId ? 'lb-row lb-me' : 'lb-row';
          const prefix = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
          return (
            <div key={p.id} className={cls}>
              <span>{prefix} {p.name.slice(0, 10)}</span>
              <span>{p.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
