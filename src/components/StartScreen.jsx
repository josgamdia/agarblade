import { useRef } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { joinGame } from '../game/connection.js';

export default function StartScreen() {
  const inputRef = useRef(null);
  const status = useGameState(s => s.connectionStatus);
  const connected = useGameState(s => s.ws !== null);

  function handleJoin() {
    const name = inputRef.current?.value.trim() || 'Jugador';
    joinGame(name);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && connected) handleJoin();
  }

  return (
    <div id="startScreen">
      <h1>CELL SHOOTER</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
        Multijugador en tiempo real · Bots con IA · Mejoras de arma
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <p className="controls-hint">WASD moverse · Ratón apuntar · Clic disparar</p>
        <p className="controls-hint">1-4 armas · Q ciclar · M silenciar · ESC pausa</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 11, color: '#44ff88' }}>● Huye</span>
        <span style={{ fontSize: 11, color: '#f7c948' }}>● Neutral</span>
        <span style={{ fontSize: 11, color: '#ff4455' }}>● Te caza</span>
      </div>

      <input
        className="screen-input"
        ref={inputRef}
        placeholder="Tu nombre"
        maxLength={16}
        autoComplete="off"
        autoFocus
        onKeyDown={handleKeyDown}
      />
      <div id="connectStatus">{status}</div>
      <button className="screen-btn" disabled={!connected} onClick={handleJoin}>
        ENTRAR
      </button>
    </div>
  );
}
