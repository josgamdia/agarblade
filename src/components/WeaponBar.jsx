import { useGameState } from '../hooks/useGameState.js';
import { selectWeapon } from '../game/input.js';

const WEAPONS = [
  { idx: 0, key: '1', label: 'Pistola' },
  { idx: 4, key: '2', label: 'Metralleta' },
  { idx: 6, key: '3', label: 'Escopeta' },
  { idx: 7, key: '4', label: 'Granadas' },
];

export default function WeaponBar() {
  const selectedWeapon = useGameState(s => s.selectedWeapon);
  const upgrades = useGameState(s => s.myUpgrades);

  return (
    <div id="weaponBar">
      {WEAPONS.map(w => {
        const owned = w.idx === 0 || (upgrades[w.idx] || 0) > 0;
        const active = selectedWeapon === w.idx && owned;
        const cls = ['wslot', active ? 'active' : '', owned ? '' : 'locked'].filter(Boolean).join(' ');
        return (
          <div key={w.idx} className={cls} onClick={() => selectWeapon(w.idx)}>
            <span className="wkey">[{w.key}]</span>{w.label}
          </div>
        );
      })}
    </div>
  );
}
