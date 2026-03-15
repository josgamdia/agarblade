import { useGameState } from '../hooks/useGameState.js';
import { buyUpg } from '../game/input.js';
import { COSTS, MAXES } from '../game/constants.js';

const UPGRADES = [
  { icon: '🏃', name: 'Velocidad' },
  { icon: '⚡', name: 'Cadencia' },
  { icon: '💥', name: 'Daño' },
  { icon: '🔫', name: 'Doble' },
  { icon: '🔥', name: 'Metralleta' },
  { icon: '❤️', name: 'Salud' },
  { icon: '🔫', name: 'Escopeta' },
  { icon: '💣', name: 'Granadas' },
];

export default function UpgradeBar() {
  const upgrades = useGameState(s => s.myUpgrades);
  const score = useGameState(s => s.myScore);

  return (
    <div id="upgrades">
      {UPGRADES.map((u, i) => {
        const lv = upgrades[i] || 0;
        const cost = COSTS[i] * (lv + 1);
        const maxed = lv >= MAXES[i];
        const cantAfford = !maxed && score < cost;
        const cls = `upg${maxed || cantAfford ? ' maxed' : ''}`;
        return (
          <div key={i} className={cls} onClick={() => buyUpg(i)}>
            <span style={{ fontSize: 16 }}>{u.icon}</span> {u.name}
            <span className="cost">{maxed ? '✓ MAX' : cost + 'pts'}</span>
            <div className="lvl-bar">
              {Array.from({ length: MAXES[i] }, (_, j) => (
                <span key={j} className={`lvl-pip${j < lv ? ' filled' : ''}`} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
