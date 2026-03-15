// Central game state store — plain JS singleton
// React reads via useSyncExternalStore; renderer/input read directly

let version = 0;
const listeners = new Set();

function notify() {
  version++;
  for (const fn of listeners) fn();
}

export const store = {
  // ── identity ──
  ws: null,
  myId: null,
  myHue: null,

  // ── mouse / camera ──
  mx: window.innerWidth / 2,
  my: window.innerHeight / 2,
  camX: 0,
  camY: 0,

  // ── input ──
  keys: {},
  mouseDown: false,
  lastShotTime: 0,

  // ── game data (from server) ──
  gameState: { players: [], bots: [], food: [], bullets: [], explosions: [] },
  myUpgrades: [0, 0, 0, 0, 0, 0, 0, 0],
  myScore: 0,
  prevHp: 100,
  seenExplosionIds: new Set(),

  // ── UI state ──
  running: false,
  dead: false,
  deathScore: 0,
  muted: false,
  selectedWeapon: 0, // 0=pistol/doble, 4=minigun, 6=shotgun, 7=grenade
  connectionStatus: 'Conectando al servidor…',
  killFeedMessages: [],

  // ── useSyncExternalStore API ──
  subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  getSnapshot() {
    return version;
  },

  // ── mutations ──
  update(patch) {
    Object.assign(store, patch);
    notify();
  },
  notifyChange() {
    notify();
  },
};
