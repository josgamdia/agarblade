// Input system — extracted from client.html
// Handles keyboard, mouse, weapon selection, and the 33ms sendInput loop

import { store } from './state.js';
import { playShoot, getAudio } from './sound.js';

let inputInterval = null;
let boundHandlers = null;

// ── weapon / cooldown helpers ──

export function getCooldown() {
  const sw = store.selectedWeapon;
  const upg = store.myUpgrades;
  if (sw === 7 && upg[7]) return Math.max(400, 1200 - upg[1] * 80);
  if (sw === 4 && upg[4]) return Math.max(50, 100 - upg[1] * 10);
  if (sw === 6 && upg[6]) return Math.max(300, 800 - upg[1] * 60);
  return Math.max(60, 420 - upg[1] * 60);
}

export function getWeapon() {
  const sw = store.selectedWeapon;
  const upg = store.myUpgrades;
  if (sw === 7 && upg[7]) return 'Granadas';
  if (sw === 4 && upg[4]) return 'Metralleta';
  if (sw === 6 && upg[6]) return 'Escopeta';
  if (upg[3]) return 'Doble';
  return 'Pistola';
}

export function selectWeapon(idx) {
  if (idx === 0 || (store.myUpgrades[idx] || 0) > 0) {
    store.update({ selectedWeapon: idx });
  }
}

export function cycleWeapon() {
  const slots = [0, 4, 6, 7];
  const owned = slots.filter(w => w === 0 || store.myUpgrades[w]);
  const idx = owned.indexOf(store.selectedWeapon);
  store.update({ selectedWeapon: owned[(idx + 1) % owned.length] });
}

export function buyUpg(i) {
  if (!store.ws || store.ws.readyState !== 1) return;
  store.ws.send(JSON.stringify({ type: 'upgrade', index: i }));
}

// ── sendInput (33ms loop) ──

function sendInput() {
  if (!store.ws || store.ws.readyState !== 1 || !store.myId) return;
  const me = store.gameState.players.find(p => p.id === store.myId);
  if (!me) return;

  const now = performance.now();
  const cd = getCooldown();
  const shoot = store.mouseDown && (now - store.lastShotTime >= cd);
  if (shoot) {
    store.lastShotTime = now;
    playShoot(getWeapon());
  }

  let mvx = 0, mvy = 0;
  if (store.keys['w'] || store.keys['arrowup']) mvy -= 1;
  if (store.keys['s'] || store.keys['arrowdown']) mvy += 1;
  if (store.keys['a'] || store.keys['arrowleft']) mvx -= 1;
  if (store.keys['d'] || store.keys['arrowright']) mvx += 1;

  store.ws.send(JSON.stringify({
    type: 'input',
    tx: store.mx + store.camX,
    ty: store.my + store.camY,
    mvx, mvy,
    shoot,
    selWeapon: store.selectedWeapon,
  }));
}

// ── event handlers ──

function onMouseMove(e) {
  store.mx = e.clientX;
  store.my = e.clientY;
}

function onMouseDown(e) {
  if (e.button === 0) {
    store.mouseDown = true;
    getAudio(); // init audio on first click
  }
}

function onMouseUp(e) {
  if (e.button === 0) store.mouseDown = false;
}

function onContextMenu(e) {
  e.preventDefault();
}

function onKeyDown(e) {
  store.keys[e.key.toLowerCase()] = true;
  if (!store.running) return;
  if (e.key === '1') selectWeapon(0);
  if (e.key === '2') selectWeapon(4);
  if (e.key === '3') selectWeapon(6);
  if (e.key === '4') selectWeapon(7);
  if (e.key === 'q' || e.key === 'Q') cycleWeapon();
  if (e.key === 'm' || e.key === 'M') {
    store.update({ muted: !store.muted });
  }
}

function onKeyUp(e) {
  store.keys[e.key.toLowerCase()] = false;
}

// ── lifecycle ──

export function initInput() {
  boundHandlers = { onMouseMove, onMouseDown, onMouseUp, onContextMenu, onKeyDown, onKeyUp };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  inputInterval = setInterval(sendInput, 33);
}

export function destroyInput() {
  if (boundHandlers) {
    window.removeEventListener('mousemove', boundHandlers.onMouseMove);
    window.removeEventListener('mousedown', boundHandlers.onMouseDown);
    window.removeEventListener('mouseup', boundHandlers.onMouseUp);
    window.removeEventListener('contextmenu', boundHandlers.onContextMenu);
    window.removeEventListener('keydown', boundHandlers.onKeyDown);
    window.removeEventListener('keyup', boundHandlers.onKeyUp);
    boundHandlers = null;
  }
  if (inputInterval) {
    clearInterval(inputInterval);
    inputInterval = null;
  }
}
