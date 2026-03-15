import { useEffect } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { store } from '../game/state.js';

export default function KillFeed() {
  const messages = useGameState(s => s.killFeedMessages);

  // Auto-remove messages after 3.1s
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const alive = store.killFeedMessages.filter(m => now - m.time < 3100);
      if (alive.length !== store.killFeedMessages.length) {
        store.update({ killFeedMessages: alive });
      }
    }, 500);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div id="kills">
      {messages.map((m, i) => (
        <div key={m.time + '-' + i} className="kf">{m.text}</div>
      ))}
    </div>
  );
}
