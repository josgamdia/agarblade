import { useEffect, useRef } from 'react';
import { createPhaserGame } from '../game/PhaserGame.js';
import { destroyInput, initInput } from '../game/input.js';

export default function GameCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    const game = createPhaserGame(containerRef.current);
    initInput();
    return () => {
      destroyInput();
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
