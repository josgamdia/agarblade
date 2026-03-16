// WebSocket connection — extracted from client.html

import { store } from './state.js';
import { playHeal, playExplosion } from './sound.js';

export function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    store.update({ ws, connectionStatus: '✅ Conectado — ingresa tu nombre' });
  };

  ws.onclose = () => {
    store.update({ ws: null, connectionStatus: '❌ Sin conexión — reintentando…' });
    setTimeout(connect, 2000);
  };

  ws.onerror = () => { };

  ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
}

function handleMsg(msg) {
  if (msg.type === 'joined') {
    store.myId  = msg.id;
    store.myHue = msg.hue;
    store.dead  = false;
    store.update({ running: true, paused: false });
  }

  if (msg.type === 'state') {
    const data = msg.data;
    if (!data.explosions) data.explosions = [];

    store.gameState = data;

    const me = data.players.find(p => p.id === store.myId);
    if (me) {
      // heal sound
      if (me.hp > store.prevHp + 1.5) playHeal();
      store.prevHp = me.hp;

      store.myScore = me.score;
      store.myUpgrades = me.upgrades || [0, 0, 0, 0, 0, 0, 0, 0];

      store.camX = me.x - window.innerWidth / 2;
      store.camY = me.y - window.innerHeight / 2;

      // death detection
      if (me.hp <= 0 && !store.dead) {
        store.dead = true;
        store.deathScore = me.score;
        store.running = false;
      }
    }

    // explosion sounds for new explosions
    const currentExpIds = new Set(data.explosions.map(e => e.id));
    currentExpIds.forEach(id => {
      if (!store.seenExplosionIds.has(id)) playExplosion();
    });
    store.seenExplosionIds = currentExpIds;

    store.notifyChange();
  }

  if (msg.type === 'upgraded') {
    store.myUpgrades = msg.upgrades || [0, 0, 0, 0, 0, 0, 0, 0];
    store.myScore = msg.score;
    store.notifyChange();
  }

  if (msg.type === 'killed') {
    const msgs = [...store.killFeedMessages, { text: msg.text, time: Date.now() }];
    // keep last 5
    store.update({ killFeedMessages: msgs.slice(-5) });
  }
}

export function joinGame(name) {
  if (!store.ws || store.ws.readyState !== 1) return;
  const trimmed = (name || 'Jugador').slice(0, 16);
  store.playerName = trimmed;
  store.ws.send(JSON.stringify({ type: 'join', name: trimmed }));
}

export function respawn(name) {
  joinGame(name);
}
