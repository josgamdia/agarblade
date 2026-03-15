import { useRef } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { respawn } from '../game/connection.js';

export default function DeathScreen() {
  const score = useGameState(s => s.deathScore);
  const nameRef = useRef(null);

  function handleRespawn() {
    const name = nameRef.current?.value.trim() || 'Jugador';
    respawn(name);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleRespawn();
  }

  return (
    <div id="deathScreen" style={{ display: 'flex' }}>
      <h1>ELIMINADO</h1>
      <p style={{ fontSize: 18, color: '#fff', marginBottom: 4 }}>
        Puntuación: <b style={{ color: '#f7c948' }}>{score}</b>
      </p>
      <input
        className="screen-input"
        ref={nameRef}
        placeholder="Tu nombre"
        maxLength={16}
        autoComplete="off"
        autoFocus
        onKeyDown={handleKeyDown}
      />
      <button className="screen-btn" onClick={handleRespawn}>VOLVER A JUGAR</button>
    </div>
  );
}
