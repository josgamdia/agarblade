// Phaser 3 GameScene
// Optimizations: HSL cache, viewport culling, food caching, reduced gradient steps, lower caps

import Phaser from 'phaser';
import { store } from '../state';
import { WORLD, CHASE, FLEE } from '../constants';

function r2m(m) { return Math.sqrt(m) * 4; }

// ─── Memoized HSL → Phaser color number ──────────────────────────────────────
const _hslCache = new Map();
function hsl(h, s, l) {
  const key = (Math.round(h) << 14) | (Math.round(s * 100) << 7) | Math.round(l * 100);
  let c = _hslCache.get(key);
  if (c === undefined) {
    c = Phaser.Display.Color.HSLToColor(h / 360, s, l).color;
    _hslCache.set(key, c);
  }
  return c;
}

function borderColorNum(eMass, myMass) {
  const r = eMass / myMass;
  return r >= CHASE ? 0xff4455 : r <= FLEE ? 0x44ff88 : 0xf7c948;
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.trails      = [];
    this.frameCount  = 0;
    this.prevHp      = 100;
    this.labelTexts  = new Map();
    this.cachedFood  = [];   // food list cached between throttled ticks
    this._usedLabels = new Set(); // reused each frame to avoid per-frame alloc
  }

  create() {
    this.gfx   = this.add.graphics().setDepth(1);
    this.uiGfx = this.add.graphics().setScrollFactor(0).setDepth(200);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.setBackgroundColor('#040408');
  }

  update() {
    const state = store.gameState;
    if (!state || !store.running) return;

    this.frameCount++;

    // When paused, skip full redraw to save GPU
    if (store.paused) return;
    this.gfx.clear();
    this.uiGfx.clear();

    const cam = this.cameras.main;
    const W   = this.scale.width;
    const H   = this.scale.height;
    const me  = (state.players || []).find(p => p.id === store.myId);
    const myMass = me ? me.mass : 20;

    // Camera follow
    if (me) {
      cam.centerOn(me.x, me.y);
      store.camX = cam.scrollX;
      store.camY = cam.scrollY;
    }

    // Damage → camera shake
    if (me && me.hp < this.prevHp - 2) {
      cam.shake(80, Math.min(10, (this.prevHp - me.hp) * 0.7) * 0.001);
      if (typeof store._onDamage === 'function') store._onDamage();
    }
    if (me) this.prevHp = me.hp;

    // Cache food (server sends it every 5 ticks, null in between)
    if (state.food !== null && state.food !== undefined) this.cachedFood = state.food;

    // Viewport bounds for culling (world coords)
    const vl = cam.scrollX - 120, vr = cam.scrollX + W + 120;
    const vt = cam.scrollY - 120, vb = cam.scrollY + H + 120;
    const inView = (x, y, r) => x+r>=vl && x-r<=vr && y+r>=vt && y-r<=vb;

    this._updateTrails();

    this._drawBackground(cam);
    this._drawPortals(state.portals || []);
    this._drawFood(this.cachedFood, inView);
    this._drawTrails();
    this._drawBullets(state.bullets || [], inView);
    this._drawDeathParticles(state.deathParticles || [], inView);
    this._drawExplosions(state.explosions || [], inView);
    this._drawBots(state.bots || [], myMass, state.players || [], inView);
    this._drawOtherPlayers(state.players || [], store.myId, inView);
    if (me) this._drawMe(me);
    this._updateLabels(state);
    this._drawMinimap(state, myMass, W, H);
  }

  // ─── Trails ──────────────────────────────────────────────────────

  _addTrail(x, y, color, size, life) {
    if (this.trails.length >= 80) this.trails.shift();
    this.trails.push({ x, y, color, size, life, maxLife: life });
  }

  _updateTrails() {
    for (let i = this.trails.length - 1; i >= 0; i--)
      if (--this.trails[i].life <= 0) this.trails.splice(i, 1);
  }

  _drawTrails() {
    const g = this.gfx;
    for (const t of this.trails) {
      g.fillStyle(t.color, (t.life / t.maxLife) * 0.45);
      g.fillCircle(t.x, t.y, t.size * (t.life / t.maxLife));
    }
  }

  // ─── Background grid ─────────────────────────────────────────────

  _drawBackground(cam) {
    const g    = this.gfx;
    const camX = cam.scrollX, camY = cam.scrollY;
    const W    = cam.width,   H    = cam.height;
    const gs   = 80;
    const sx   = Math.floor(camX / gs) * gs;
    const sy   = Math.floor(camY / gs) * gs;

    // Batch all grid lines into a single draw call (much faster than one per line)
    g.lineStyle(1, 0x5046a0, 0.04);
    g.beginPath();
    for (let x = sx; x < camX + W + gs; x += gs) {
      g.moveTo(x, camY); g.lineTo(x, camY + H);
    }
    for (let y = sy; y < camY + H + gs; y += gs) {
      g.moveTo(camX, y); g.lineTo(camX + W, y);
    }
    g.strokePath();

    g.lineStyle(2, 0x7c6cf7, 0.3);
    g.strokeRect(0, 0, WORLD, WORLD);
  }

  // ─── Portals ─────────────────────────────────────────────────────

  _drawPortals(portals) {
    const g  = this.gfx;
    const fc = this.frameCount;
    for (const portal of portals) {
      const { x, y, r, life } = portal;
      const ph         = portal.hue || 270;
      const fadeAlpha  = Math.min(1, life / 60);
      const pulse      = 1 + Math.sin(fc * 0.06) * 0.08;

      g.fillStyle(hsl(ph, 0.9, 0.5), fadeAlpha * 0.05);
      g.fillCircle(x, y, r * 3.0 * pulse);
      g.fillStyle(hsl(ph, 0.9, 0.5), fadeAlpha * 0.1);
      g.fillCircle(x, y, r * 1.9);

      g.lineStyle(3, hsl(ph, 1, 0.65), fadeAlpha * 0.9);
      g.strokeCircle(x, y, r * pulse);

      const fast = fc * 0.09;
      for (let i = 0; i < 8; i++) {
        const a1 = fast + (i / 8) * Math.PI * 2;
        g.lineStyle(4, hsl((ph + i * 18) % 360, 1, 0.72), fadeAlpha * 0.95);
        g.beginPath(); g.arc(x, y, r * 0.85, a1, a1 + 0.38, false, 0.05); g.strokePath();
      }

      const slow = -fc * 0.045;
      for (let i = 0; i < 5; i++) {
        const a1 = slow + (i / 5) * Math.PI * 2;
        g.lineStyle(2.5, hsl((ph + 160 + i * 20) % 360, 1, 0.8), fadeAlpha * 0.7);
        g.beginPath(); g.arc(x, y, r * 0.55, a1, a1 + 0.55, false, 0.05); g.strokePath();
      }

      g.fillStyle(hsl(ph, 0.4, 0.08), fadeAlpha * 0.9);
      g.fillCircle(x, y, r * 0.42);
      g.fillStyle(hsl(ph, 1, 0.7), fadeAlpha * (0.45 + Math.sin(fc * 0.11) * 0.18));
      g.fillCircle(x, y, r * 0.22);
      g.fillStyle(0xffffff, fadeAlpha * (0.55 + Math.sin(fc * 0.13) * 0.2));
      g.fillCircle(x, y, r * 0.08);

      for (let i = 0; i < 4; i++) {
        const oa = fc * 0.055 + (i / 4) * Math.PI * 2;
        g.fillStyle(hsl((ph + i * 30) % 360, 1, 0.8), fadeAlpha * 0.85);
        g.fillCircle(x + Math.cos(oa) * r * 1.12, y + Math.sin(oa) * r * 1.12, 3.5);
      }
    }
  }

  // ─── Food ────────────────────────────────────────────────────────

  _drawFood(food, inView) {
    const g = this.gfx;
    for (const f of food) {
      if (!inView(f.x, f.y, f.r + 2)) continue;
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push({ x: f.x + f.r * Math.cos(a), y: f.y + f.r * Math.sin(a) });
      }
      g.fillStyle(hsl(f.hue, 0.7, 0.75), 1);
      g.fillPoints(pts, true);
    }
  }

  // ─── Death particles (collectible, server-side) ───────────────────

  _drawDeathParticles(particles, inView) {
    const g  = this.gfx;
    const fc = this.frameCount;
    for (const dp of particles) {
      if (!inView(dp.x, dp.y, dp.r * 3)) continue;
      const lifeFrac = Math.min(1, dp.life / 60); // fade out last 2 s
      const pulse    = 1 + Math.sin(fc * 0.12 + dp.id * 0.4) * 0.18;

      // Outer glow
      g.fillStyle(hsl(dp.hue, 1, 0.55), lifeFrac * 0.1);
      g.fillCircle(dp.x, dp.y, dp.r * 2.8 * pulse);
      // Mid glow
      g.fillStyle(hsl(dp.hue, 1, 0.6), lifeFrac * 0.4);
      g.fillCircle(dp.x, dp.y, dp.r * 1.5);
      // Core
      g.fillStyle(hsl(dp.hue, 0.9, 0.75), lifeFrac * 0.9);
      g.fillCircle(dp.x, dp.y, dp.r * pulse);
      // Bright center
      g.fillStyle(0xffffff, lifeFrac * 0.5);
      g.fillCircle(dp.x, dp.y, dp.r * 0.35);
    }
  }

  // ─── Bullets ─────────────────────────────────────────────────────

  _drawBullets(bullets, inView) {
    const g  = this.gfx;
    const fc = this.frameCount;
    for (const b of bullets) {
      if (!inView(b.x, b.y, 20)) continue;
      if (b.explosive) {
        const pulse = 1 + Math.sin(fc * 0.4) * 0.15;
        const r     = 8 * pulse;
        const base  = b.isPlayer ? 0xffa03c : 0xff5050;
        g.fillStyle(base, 0.12);    g.fillCircle(b.x, b.y, r * 2.5);
        g.fillStyle(base, 0.5);     g.fillCircle(b.x, b.y, r * 1.4);
        g.fillStyle(0xffffc8, 0.9); g.fillCircle(b.x, b.y, r * 0.5);
        g.lineStyle(1.5, base, 0.5); g.strokeCircle(b.x, b.y, r + 3);
        this._addTrail(b.x, b.y, base, 5, 8);
      } else {
        const col   = b.isPlayer ? 0xa08cff : 0xff3c50;
        const angle = Math.atan2(b.vy || 0, b.vx || 0);
        const len   = 10;
        const cx    = Math.cos(angle), cy = Math.sin(angle);
        const x1    = b.x - cx * len * 0.5, y1 = b.y - cy * len * 0.5;
        const x2    = b.x + cx * len * 0.5, y2 = b.y + cy * len * 0.5;
        g.lineStyle(6, col, 0.3);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        g.lineStyle(2.5, 0xffffff, 0.95);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        this._addTrail(b.x, b.y, col, 3, 5);
      }
    }
  }

  // ─── Explosions ──────────────────────────────────────────────────

  _drawExplosions(explosions, inView) {
    const g = this.gfx;
    for (const exp of explosions) {
      if (!inView(exp.x, exp.y, exp.r * 1.3)) continue;
      const progress = 1 - exp.life / 15;
      const r        = exp.r * (0.15 + progress * 0.85);
      const alpha    = Math.max(0, 1 - progress * 1.05);
      g.fillStyle(0xb41e00, alpha * 0.3);  g.fillCircle(exp.x, exp.y, r * 1.2);
      g.fillStyle(0xff7800, alpha * 0.7);  g.fillCircle(exp.x, exp.y, r * 0.85);
      g.fillStyle(0xfff064, alpha * 0.85); g.fillCircle(exp.x, exp.y, r * 0.55);
      if (progress < 0.25) {
        g.fillStyle(0xffffff, (1 - progress * 4) * alpha);
        g.fillCircle(exp.x, exp.y, r * 0.18);
      }
      for (let ring = 0; ring < 2; ring++) {
        g.lineStyle(3 - ring, 0xffb432, alpha * (0.3 - ring * 0.12));
        g.strokeCircle(exp.x, exp.y, r * (1.1 + ring * 0.25));
      }
    }
  }

  // ─── Cell ────────────────────────────────────────────────────────

  _drawCell(x, y, radius, hue, isMe, borderCol) {
    const g    = this.gfx;
    const time = this.frameCount * 0.02;

    // Outer glow
    g.fillStyle(hsl(hue, 0.8, 0.55), isMe ? 0.1 : 0.05);
    g.fillCircle(x, y, radius * 1.25);

    // Radial gradient (fewer steps for non-player cells)
    const steps = isMe ? 5 : 3;
    for (let i = 0; i <= steps; i++) {
      const t = 1 - i / steps;
      g.fillStyle(hsl(hue, 0.70, 0.38 + (1 - t) * 0.32), 1);
      g.fillCircle(x, y, radius * (t * 0.97 + 0.03));
    }

    const bw = 2.5 + Math.sin(time + hue * 0.017) * 0.5;
    g.lineStyle(bw, borderCol !== undefined ? borderCol : 0xffffff, 1);
    g.strokeCircle(x, y, radius);

    g.fillStyle(0xffffff, isMe ? 0.16 : 0.08);
    g.fillCircle(x - radius * 0.3, y - radius * 0.3, radius * 0.35);
  }

  // ─── HP bar ──────────────────────────────────────────────────────

  _drawHPBar(x, y, radius, hp, maxHp, width) {
    const g     = this.gfx;
    const bw    = width || radius * 2.4;
    const bh    = 4, bx = x - bw / 2, by = y - radius - 14;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    const hue   = ratio > 0.6 ? 140 : ratio > 0.3 ? 45 : 0;
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(bx, by, bw, bh, 2);
    if (ratio > 0) {
      g.fillStyle(hsl(hue, 0.9, 0.55), 1);
      g.fillRoundedRect(bx, by, ratio * bw, bh, 2);
      g.fillStyle(0xffffff, 0.15);
      g.fillRoundedRect(bx, by, ratio * bw, bh / 2, 2);
    }
  }

  // ─── Gun barrel ──────────────────────────────────────────────────

  _drawBarrel(x, y, angle, upgrades, weapon, pr) {
    const gw  = 5 + (upgrades[2] || 0);
    const gl  = pr + 12 + (upgrades[2] || 0) * 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const g   = this.gfx;
    const rotRect = (sx, sy, len, hh, color) => {
      const tx = (lx, ly) => ({ x: x + lx*cos - ly*sin, y: y + lx*sin + ly*cos });
      g.fillStyle(color, 1);
      g.fillPoints([tx(sx,sy-hh), tx(sx+len,sy-hh), tx(sx+len,sy+hh), tx(sx,sy+hh)], true);
    };
    if (weapon === 7 && upgrades[7]) {
      rotRect(pr-4, 0, gl*0.78, (gw+4)/2, 0xff9f43);
      rotRect(pr-4, 0, 6, (gw+4)/2, 0x6b3410);
    } else if (weapon === 6 && upgrades[6]) {
      rotRect(pr-4, -gw-2, gl*0.68, gw*0.43, 0xbbbbbb);
      rotRect(pr-4,  0,    gl*0.68, gw/2,    0xdddddd);
      rotRect(pr-4,  gw+2, gl*0.68, gw*0.43, 0xbbbbbb);
    } else {
      rotRect(pr-4, 0, gl, gw/2, 0xdddddd);
      if (upgrades[3] || (weapon === 4 && upgrades[4]))
        rotRect(pr-4, -gw-2, gl*0.8, gw/2, 0xcccccc);
      if (weapon === 4 && upgrades[4])
        rotRect(pr-4,  gw+2, gl*0.8, gw/2, 0xcccccc);
    }
  }

  // ─── Snake body + side cannons ───────────────────────────────────

  _drawSnakeCannon(cx, cy, angle, segR) {
    const g   = this.gfx;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const s   = segR + 1, len = 13, hw = 2.5;
    g.lineStyle(5, 0xbbbbbb, 0.9);
    g.beginPath();
    g.moveTo(cx + cos * s, cy + sin * s);
    g.lineTo(cx + cos * (s + len), cy + sin * (s + len));
    g.strokePath();
    g.lineStyle(2, 0xffffff, 0.35);
    g.beginPath();
    g.moveTo(cx + cos * s - sin * hw * 0.5, cy + sin * s + cos * hw * 0.5);
    g.lineTo(cx + cos * (s + len) - sin * hw * 0.5, cy + sin * (s + len) + cos * hw * 0.5);
    g.strokePath();
  }

  _drawSnakeBody(segments, hue) {
    if (!segments || segments.length === 0) return;
    const g = this.gfx;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg   = segments[i];
      const t     = 1 - i / segments.length;
      const segR  = Math.max(8, 16 * (0.4 + t * 0.6));
      const alpha = Math.min(1, t + 0.25);
      g.fillStyle(hsl(hue, 0.8, 0.5), t * 0.07);
      g.fillCircle(seg.x, seg.y, segR * 1.5);
      g.fillStyle(hsl(hue, 0.7, 0.45 + t * 0.12), alpha);
      g.fillCircle(seg.x, seg.y, segR);
      g.lineStyle(1.5, hsl(hue, 0.5, 0.75), alpha * 0.7);
      g.strokeCircle(seg.x, seg.y, segR);
      if (i % 2 === 0 && i + 1 < segments.length) {
        const nxt  = segments[i + 1];
        const bAng = Math.atan2(seg.y - nxt.y, seg.x - nxt.x);
        this._drawSnakeCannon(seg.x, seg.y, bAng + Math.PI / 2, segR);
        this._drawSnakeCannon(seg.x, seg.y, bAng - Math.PI / 2, segR);
      }
    }
  }

  // ─── Bots ────────────────────────────────────────────────────────

  _drawBots(bots, myMass, players, inView) {
    const g  = this.gfx;
    const fc = this.frameCount;
    for (const e of bots) {
      const er = r2m(e.mass);
      if (!inView(e.x, e.y, er * 1.4)) continue;
      const bc = borderColorNum(e.mass, myMass);
      if (e.gun) {
        for (let i = 0; i < 16; i += 4) {
          const a1 = (i / 16) * Math.PI * 2 - fc * 0.025;
          const a2 = ((i + 0.9) / 16) * Math.PI * 2 - fc * 0.025;
          g.lineStyle(2, 0xffd232, 0.7);
          g.beginPath(); g.arc(e.x, e.y, er+6, a1, a2, false, 0.05); g.strokePath();
        }
        if (players.length > 0) {
          const nearest = players.reduce((best, p) => {
            const d = Math.hypot(p.x-e.x, p.y-e.y);
            return (!best || d < best.d) ? { p, d } : best;
          }, null);
          if (nearest) {
            const ang = Math.atan2(nearest.p.y-e.y, nearest.p.x-e.x);
            const cos = Math.cos(ang), sin = Math.sin(ang);
            const tx  = (lx, ly) => ({ x: e.x+lx*cos-ly*sin, y: e.y+lx*sin+ly*cos });
            g.fillStyle(0xe8c800, 1);
            g.fillPoints([tx(er-2,-3.5), tx(er*1.65+6,-3.5), tx(er*1.65+6,3.5), tx(er-2,3.5)], true);
          }
        }
      }
      this._drawCell(e.x, e.y, er, e.hue, false, bc);
      if (e.maxHp) this._drawHPBar(e.x, e.y, er, e.hp, e.maxHp);
    }
  }

  // ─── Other players ───────────────────────────────────────────────

  _drawOtherPlayers(players, myId, inView) {
    for (const p of players) {
      if (p.id === myId) continue;
      const pr = r2m(p.mass);
      if (!inView(p.x, p.y, pr * 1.5 + 120)) continue;
      if (p.snakeMode && p.snakeBody?.length > 0)
        this._drawSnakeBody(p.snakeBody, p.hue);
      this._drawBarrel(p.x, p.y, p.angle||0, p.upgrades||Array(8).fill(0), p.weapon||0, pr);
      this._drawCell(p.x, p.y, pr, p.hue, false, 0xffff64);
      this._drawHPBar(p.x, p.y, pr, p.hp, p.maxHp||100, pr*2.6);
      if (p.snakeMode) {
        this.gfx.lineStyle(2, 0x00ffcc, 0.6 + Math.sin(this.frameCount * 0.15) * 0.3);
        this.gfx.strokeCircle(p.x, p.y, pr + 8);
      }
    }
  }

  // ─── My player ───────────────────────────────────────────────────

  _drawMe(me) {
    const pr = r2m(me.mass);
    const ga = Math.atan2(store.my + store.camY - me.y, store.mx + store.camX - me.x);
    if (me.snakeMode && me.snakeBody?.length > 0)
      this._drawSnakeBody(me.snakeBody, store.myHue);
    this._drawBarrel(me.x, me.y, ga, store.myUpgrades, store.selectedWeapon, pr);
    this._drawCell(me.x, me.y, pr, store.myHue, true, 0xffffff);
    this._drawHPBar(me.x, me.y, pr, me.hp, me.maxHp||100, pr*2.6);
    if (me.snakeMode) {
      this.gfx.lineStyle(2, 0x00ffcc, 0.6 + Math.sin(this.frameCount * 0.15) * 0.3);
      this.gfx.strokeCircle(me.x, me.y, pr + 8);
    }
  }

  // ─── Label pool ──────────────────────────────────────────────────

  _updateLabels(state) {
    const used = this._usedLabels;
    used.clear();

    const setLabel = (key, name, x, y, radius) => {
      used.add(key);
      let text = this.labelTexts.get(key);
      if (!text) {
        text = this.add.text(0, 0, '', {
          fontFamily: "'Share Tech Mono', monospace",
          fontSize:   '12px',
          color:      '#ffffffdd',
          stroke:     '#000000',
          strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(20);
        this.labelTexts.set(key, text);
      }
      const fs = Math.max(10, radius * 0.45);
      // Only update if changed (avoid expensive setText every frame)
      if (text._cachedName !== name)   { text.setText(name);      text._cachedName = name; }
      if (text._cachedFs   !== fs)     { text.setFontSize(fs);    text._cachedFs   = fs;   }
      text.setPosition(x, y);
      text.setVisible(true);
    };

    for (const e of (state.bots || []))
      setLabel('b' + e.id, e.name.slice(0, 6), e.x, e.y, r2m(e.mass));
    for (const p of (state.players || []))
      setLabel('p' + p.id, p.name.slice(0, 8), p.x, p.y, r2m(p.mass));

    for (const [key, text] of this.labelTexts) {
      if (!used.has(key)) { text.destroy(); this.labelTexts.delete(key); }
    }
  }

  // ─── Minimap ─────────────────────────────────────────────────────

  _drawMinimap(state, myMass, W, H) {
    const g  = this.uiGfx;
    const mW = 140, mH = 140;
    const mX = W - mW - 14, mY = H - mH - 80;
    const sc = mW / WORLD;

    g.fillStyle(0x050519, 0.8);
    g.fillRoundedRect(mX-3, mY-3, mW+6, mH+6, 10);
    g.lineStyle(1, 0x7c6cf7, 0.2);
    g.strokeRoundedRect(mX-3, mY-3, mW+6, mH+6, 10);

    // Food (every 3rd frame to save cost)
    if (this.frameCount % 3 === 0) {
      for (const f of this.cachedFood) {
        g.fillStyle(hsl(f.hue, 0.7, 0.55), 0.3);
        g.fillRect(mX + f.x*sc - 0.5, mY + f.y*sc - 0.5, 1, 1);
      }
    }

    for (const portal of (state.portals || [])) {
      g.fillStyle(hsl(portal.hue||270, 1, 0.7), 0.8);
      g.fillCircle(mX+portal.x*sc, mY+portal.y*sc, 4);
      g.lineStyle(1, hsl(portal.hue||270, 1, 0.8), 0.6);
      g.strokeCircle(mX+portal.x*sc, mY+portal.y*sc, 6);
    }

    for (const dp of (state.deathParticles || [])) {
      g.fillStyle(hsl(dp.hue, 1, 0.6), 0.7);
      g.fillCircle(mX+dp.x*sc, mY+dp.y*sc, 2);
    }

    for (const e of (state.bots || [])) {
      g.fillStyle(borderColorNum(e.mass, myMass), 1);
      g.fillCircle(mX+e.x*sc, mY+e.y*sc, 2);
    }

    for (const p of (state.players || [])) {
      const isMe = p.id === store.myId;
      g.fillStyle(isMe ? 0x7c6cf7 : 0xffff44, 1);
      g.fillCircle(mX+p.x*sc, mY+p.y*sc, isMe ? 4.5 : 3);
      if (isMe) {
        g.lineStyle(1.5, 0xffffff, 0.8);
        g.strokeCircle(mX+p.x*sc, mY+p.y*sc, 4.5);
      }
    }

    for (const exp of (state.explosions || [])) {
      g.fillStyle(0xff7800, 0.7);
      g.fillCircle(mX+exp.x*sc, mY+exp.y*sc, 4);
    }
  }
}
