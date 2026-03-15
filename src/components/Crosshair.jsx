import { useRef, useEffect } from 'react';
import { store } from '../game/state.js';

export default function Crosshair() {
  const ref = useRef(null);

  useEffect(() => {
    // Use direct DOM mutation for performance (mousemove fires very often)
    function onMove(e) {
      if (ref.current) {
        ref.current.style.left = e.clientX + 'px';
        ref.current.style.top = e.clientY + 'px';
      }
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <svg id="crosshair" ref={ref} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
      <line x1="12" y1="2" x2="12" y2="7" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="7" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
      <line x1="17" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
    </svg>
  );
}
