import { useRef } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { buyUpg } from '../game/input.js';
import { store } from '../game/state.js';
import { COSTS, MAXES } from '../game/constants.js';
import { respawn } from '../game/connection.js';

const UPGRADES_INFO = [
  { name: 'Velocidad',  icon: '🏃', desc: '+1.5 velocidad/nivel' },
  { name: 'Cadencia',   icon: '⚡',  desc: 'Recarga más rápida' },
  { name: 'Daño',       icon: '💥',  desc: '+8 daño/nivel' },
  { name: 'Doble',      icon: '🔫',  desc: 'Segundo cañón' },
  { name: 'Metralleta', icon: '🔥',  desc: 'Ráfaga de precisión' },
  { name: 'Salud',      icon: '❤️',  desc: '+25 HP máx/nivel' },
  { name: 'Escopeta',   icon: '🎯',  desc: '6 perdigones' },
  { name: 'Granadas',   icon: '💣',  desc: 'Explosivo de área' },
];

function SkillNode({ index, upgrades, score }) {
  const info  = UPGRADES_INFO[index];
  const lv    = upgrades[index] || 0;
  const cost  = COSTS[index] * (lv + 1);
  const maxed = lv >= MAXES[index];
  const canAfford = !maxed && score >= cost;
  return (
    <div
      className={`sk-node ${maxed ? 'sk-maxed' : ''} ${!canAfford && !maxed ? 'sk-locked' : ''}`}
      onClick={() => canAfford && buyUpg(index)}
      title={info.desc}
    >
      <span className="sk-icon">{info.icon}</span>
      <span className="sk-name">{info.name}</span>
      <div className="sk-pips">
        {Array.from({ length: MAXES[index] }, (_, j) => (
          <span key={j} className={`sk-pip ${j < lv ? 'filled' : ''}`} />
        ))}
      </div>
      <span className="sk-cost">{maxed ? '✓ MAX' : `${cost}pts`}</span>
    </div>
  );
}

export default function PauseMenu() {
  const dead       = useGameState(s => s.dead);
  const score      = useGameState(s => s.myScore);
  const deathScore = useGameState(s => s.deathScore);
  const upgrades   = useGameState(s => s.myUpgrades);
  const nameRef    = useRef(null);

  function handleResume() {
    store.update({ paused: false });
  }

  function handleRestart() {
    const name = nameRef.current?.value.trim() || store.playerName || 'Jugador';
    store.update({ playerName: name, paused: false });
    respawn(name);
  }

  return (
    <div id="pauseMenu">
      <div id="pausePanel">
        {dead
          ? <h2 className="pause-title" style={{ color: 'var(--red)' }}>ELIMINADO</h2>
          : <h2 className="pause-title">⏸ PAUSA</h2>
        }
        {dead && (
          <p className="pause-death-score">
            Puntuación final: <b style={{ color: 'var(--gold)' }}>{deathScore}</b>
          </p>
        )}

        {/* ── Skill tree ── */}
        <div id="skillTreeSection">
          <div className="skill-tree-title">— ÁRBOL DE HABILIDADES —</div>
          <div className="skill-score-line">
            Puntos disponibles: <b style={{ color: 'var(--gold)' }}>{score}</b>
          </div>

          <div className="skill-tree-layout">
            {/* Main progression chain */}
            <div className="skill-main-branch">
              <SkillNode index={0} upgrades={upgrades} score={score} />
              <div className="sk-arrow">↓</div>
              <SkillNode index={1} upgrades={upgrades} score={score} />
              <div className="sk-arrow">↓</div>
              <SkillNode index={2} upgrades={upgrades} score={score} />
              <div className="sk-arrow">↓</div>
              {/* Weapon row branches off Damage */}
              <div className="skill-weapon-row">
                <div className="sk-weapon-col">
                  <SkillNode index={3} upgrades={upgrades} score={score} />
                  <div className="sk-arrow">↓</div>
                  <SkillNode index={7} upgrades={upgrades} score={score} />
                </div>
                <div className="sk-weapon-col">
                  <SkillNode index={6} upgrades={upgrades} score={score} />
                </div>
                <div className="sk-weapon-col">
                  <SkillNode index={4} upgrades={upgrades} score={score} />
                </div>
              </div>
            </div>

            {/* Standalone: Health */}
            <div className="skill-side-branch">
              <SkillNode index={5} upgrades={upgrades} score={score} />
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="pause-actions">
          {dead ? (
            <>
              <input
                ref={nameRef}
                className="screen-input"
                defaultValue={store.playerName || ''}
                placeholder="Tu nombre"
                maxLength={16}
                autoComplete="off"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleRestart()}
              />
              <button className="screen-btn" onClick={handleRestart}>↺ VOLVER A JUGAR</button>
            </>
          ) : (
            <>
              <button className="screen-btn" onClick={handleResume}>▶ CONTINUAR</button>
              <button className="screen-btn pause-restart-btn" onClick={handleRestart}>↺ REINICIAR</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
