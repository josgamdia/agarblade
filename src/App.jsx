import { useEffect, useState, useCallback } from 'react';
import { useGameState } from './hooks/useGameState.js';
import { store } from './game/state.js';
import GameCanvas from './components/GameCanvas.jsx';
import Crosshair from './components/Crosshair.jsx';
import StartScreen from './components/StartScreen.jsx';
import DeathScreen from './components/DeathScreen.jsx';
import HUD from './components/HUD.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import KillFeed from './components/KillFeed.jsx';
import Legend from './components/Legend.jsx';
import UpgradeBar from './components/UpgradeBar.jsx';
import WeaponBar from './components/WeaponBar.jsx';

export default function App() {
  const running = useGameState(s => s.running);
  const dead = useGameState(s => s.dead);
  const [damageFlash, setDamageFlash] = useState(false);

  // Hide cursor when game is active
  useEffect(() => {
    document.body.style.cursor = running ? 'none' : 'default';
    return () => { document.body.style.cursor = 'default'; };
  }, [running]);

  // Damage flash — triggered from renderer via store callback
  const triggerFlash = useCallback(() => {
    setDamageFlash(true);
    setTimeout(() => setDamageFlash(false), 300);
  }, []);

  useEffect(() => {
    store._onDamage = triggerFlash;
    return () => { store._onDamage = null; };
  }, [triggerFlash]);

  return (
    <>
      <GameCanvas />
      <Crosshair />

      {!running && !dead && <StartScreen />}
      {dead && <DeathScreen />}

      {running && (
        <>
          <div className="vignette" />
          {damageFlash && <div className="damage-flash" />}
          <div id="ui">
            <HUD />
            <Leaderboard />
            <KillFeed />
            <Legend />
            <UpgradeBar />
            <WeaponBar />
          </div>
        </>
      )}
    </>
  );
}
