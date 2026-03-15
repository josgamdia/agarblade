import { useRef, useEffect } from 'react';
import { initRenderer, destroyRenderer } from '../game/renderer.js';
import { initInput, destroyInput } from '../game/input.js';

export default function GameCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    initRenderer(canvasRef.current);
    initInput();
    return () => {
      destroyRenderer();
      destroyInput();
    };
  }, []);

  return <canvas id="c" ref={canvasRef} />;
}
