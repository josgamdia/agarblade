import { useGameState } from '../hooks/useGameState.js';
import { getWeapon } from '../game/input.js';
import { toggleMute } from '../game/sound.js';

export default function HUD() {
  const mass = useGameState(s => {
    const me = s.gameState.players.find(p => p.id === s.myId);
    return me ? Math.floor(me.mass) : 20;
  });
  const score = useGameState(s => s.myScore);
  const muted = useGameState(s => s.muted);

  const hp = useGameState(s => {
    const me = s.gameState.players.find(p => p.id === s.myId);
    return me ? Math.max(0, Math.floor(me.hp)) : 100;
  });
  const maxHp = useGameState(s => {
    const me = s.gameState.players.find(p => p.id === s.myId);
    return me ? (me.maxHp || 100) : 100;
  });
  const isHealing = useGameState(s => {
    const me = s.gameState.players.find(p => p.id === s.myId);
    return me && me.hp < (me.maxHp || 100) && me.hp > s.prevHp;
  });

  const weapon = getWeapon();
  const hpColor = hp > maxHp * 0.6 ? '#44ff88' : hp > maxHp * 0.3 ? '#f7c948' : '#ff4455';

  return (
    <div id="hud">
      <div className="stat">Masa: <b>{mass}</b></div>
      <div className="stat">Puntos: <b>{score}</b></div>
      <div className="stat">Arma: <b>{weapon}</b></div>
      <div className="stat">HP: <b style={{ color: hpColor }}>{hp}/{maxHp}</b>{isHealing && <span id="regenIndicator"> ↑</span>}</div>
      <div className="stat" onClick={toggleMute} style={{ cursor: 'pointer', pointerEvents: 'all' }} title="Silenciar (M)">
        <span>{muted ? '🔇' : '🔊'}</span> <b>{muted ? 'Silencio' : 'Sonido'}</b>
      </div>
    </div>
  );
}
