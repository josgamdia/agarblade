// Canvas 2D renderer — major visual overhaul
// Neon bullets, cell membranes, trail system, nebula background, muzzle flash

import { store } from './state.js';
import { WORLD, CHASE, FLEE } from './constants.js';

let canvas = null;
let ctx = null;
let animFrameId = null;
let frameCount = 0;

// ── Visual FX state ──
let shakeX = 0, shakeY = 0, shakeIntensity = 0;
let prevPlayerHp = 100;

// Trail system (ring buffer for perf)
const trails = [];
const MAX_TRAILS = 400;

// Particle system
const particles = [];
const MAX_PARTICLES = 300;

function r2m(m) { return Math.sqrt(m) * 4; }

function borderColor(eMass, myMass) {
  const r = eMass / myMass;
  return r >= CHASE ? '#ff4455' : r <= FLEE ? '#44ff88' : '#f7c948';
}

// ── Trail system ──
function addTrail(x, y, color, size, life) {
  if (trails.length >= MAX_TRAILS) trails.shift();
  trails.push({ x, y, color, size, life, maxLife: life });
}

function updateTrails() {
  for (let i = trails.length - 1; i >= 0; i--) {
    trails[i].life -= 1;
    if (trails[i].life <= 0) trails.splice(i, 1);
  }
}

function drawTrails() {
  for (const t of trails) {
    const alpha = (t.life / t.maxLife) * 0.5;
    const sz = t.size * (t.life / t.maxLife);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(t.x, t.y, sz, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Particles ──
function addParticle(x, y, vx, vy, life, color, size) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.97; p.vy *= 0.97;
    p.life -= 1;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    const sz = p.size * (0.3 + alpha * 0.7);
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Screen shake ──
function applyShake(intensity) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
}

function updateShake() {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.86;
  } else {
    shakeX = 0; shakeY = 0; shakeIntensity = 0;
  }
}

// ── Enhanced explosions ──
function drawExplosions() {
  (store.gameState.explosions || []).forEach(exp => {
    const maxLife = 15;
    const progress = 1 - exp.life / maxLife;
    const r = exp.r * (0.15 + progress * 0.85);
    const alpha = Math.max(0, 1 - progress * 1.05);

    // Main fireball
    ctx.save();
    ctx.shadowBlur = 50;
    ctx.shadowColor = `rgba(255, 100, 0, ${alpha * 0.7})`;
    const grad = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, r);
    grad.addColorStop(0, `rgba(255, 255, 220, ${alpha})`);
    grad.addColorStop(0.1, `rgba(255, 240, 100, ${alpha * 0.95})`);
    grad.addColorStop(0.3, `rgba(255, 120, 10, ${alpha * 0.85})`);
    grad.addColorStop(0.6, `rgba(180, 30, 0, ${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(60, 0, 0, 0)`);
    ctx.beginPath(); ctx.arc(exp.x, exp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    // Double shockwave rings
    for (let ring = 0; ring < 2; ring++) {
      const ringR = r * (1.1 + ring * 0.25);
      const ringAlpha = alpha * (0.3 - ring * 0.12);
      ctx.beginPath(); ctx.arc(exp.x, exp.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 180, 50, ${ringAlpha})`;
      ctx.lineWidth = 3 - ring + progress * 4; ctx.stroke();
    }

    // White core flash
    if (progress < 0.25) {
      const coreAlpha = (1 - progress * 4) * alpha;
      ctx.beginPath(); ctx.arc(exp.x, exp.y, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
      ctx.fill();
    }

    // Debris particles on spawn
    if (exp.life > 13.5) {
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        const hue = 15 + Math.random() * 35;
        addParticle(exp.x, exp.y,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          15 + Math.random() * 20,
          `hsl(${hue}, 100%, ${45 + Math.random() * 35}%)`,
          2 + Math.random() * 5);
      }
      applyShake(14);
    }
  });
}

// ── Neon bullet drawing ──
function drawBullet(b) {
  if (b.explosive) {
    // Grenade projectile — pulsing orb with ring
    const pulse = 1 + Math.sin(frameCount * 0.4) * 0.15;
    const r = 8 * pulse;
    const col = b.isPlayer ? [255, 160, 60] : [255, 80, 80];

    // Glow
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.7)`;

    // Core
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    grad.addColorStop(0, `rgba(255, 255, 200, 0.95)`);
    grad.addColorStop(0.4, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.9)`);
    grad.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0)`);
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();

    // Spinning ring
    ctx.beginPath(); ctx.arc(b.x, b.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.5)`;
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // Trail
    addTrail(b.x, b.y, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.7)`, 5, 10);

    // Sparks
    if (frameCount % 3 === 0) {
      addParticle(b.x + (Math.random()-0.5)*6, b.y + (Math.random()-0.5)*6,
        (Math.random()-0.5)*1.5, (Math.random()-0.5)*1.5,
        8, `hsl(${30 + Math.random()*20}, 100%, 70%)`, 1.5);
    }
  } else {
    // Normal/double/minigun/shotgun bullet — elongated neon projectile
    const col = b.isPlayer ? [160, 140, 255] : [255, 60, 80];
    const angle = Math.atan2(b.vy || 0, b.vx || 0);
    const len = 10;
    const w = 2.5;

    // Glow
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.8)`;

    // Elongated shape
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);

    // Core bright line
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.strokeStyle = `rgba(255, 255, 255, 0.95)`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Outer colored glow
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.6)`;
    ctx.lineWidth = w + 4;
    ctx.stroke();

    ctx.restore();

    // Trail
    addTrail(b.x, b.y, `rgba(${col[0]}, ${col[1]}, ${col[2]}, 0.5)`, 3, 6);
  }
}

// ── Gun barrel (improved with metallic look) ──
function drawGunBarrel(x, y, pr, angle, upgrades, weapon) {
  const gw = 5 + (upgrades[2] || 0);
  const gl = pr + 12 + (upgrades[2] || 0) * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (weapon === 7 && upgrades[7]) {
    // Grenade launcher — fat barrel
    const grad = ctx.createLinearGradient(pr - 4, -(gw+4)/2, pr - 4, (gw+4)/2);
    grad.addColorStop(0, '#cc7a20'); grad.addColorStop(0.5, '#ff9f43'); grad.addColorStop(1, '#cc7a20');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(pr - 4, -(gw+4)/2, gl * 0.78, gw + 4, 3); ctx.fill();
    ctx.fillStyle = '#6b3410';
    ctx.fillRect(pr - 4, -(gw+4)/2, 6, gw + 4);
  } else if (weapon === 6 && upgrades[6]) {
    // Shotgun — triple barrel
    const bGrad = (yOff, h) => {
      const g = ctx.createLinearGradient(0, yOff, 0, yOff + h);
      g.addColorStop(0, '#888'); g.addColorStop(0.5, '#ccc'); g.addColorStop(1, '#888');
      return g;
    };
    ctx.fillStyle = bGrad(-gw/2 - gw - 2, gw * 0.85);
    ctx.beginPath(); ctx.roundRect(pr - 4, -gw/2 - gw - 2, gl * 0.68, gw * 0.85, 2); ctx.fill();
    ctx.fillStyle = bGrad(-gw/2, gw);
    ctx.beginPath(); ctx.roundRect(pr - 4, -gw/2, gl * 0.68, gw, 2); ctx.fill();
    ctx.fillStyle = bGrad(gw/2 + 2, gw * 0.85);
    ctx.beginPath(); ctx.roundRect(pr - 4, gw/2 + 2, gl * 0.68, gw * 0.85, 2); ctx.fill();
  } else {
    // Standard barrel with metallic gradient
    const grad = ctx.createLinearGradient(0, -gw/2, 0, gw/2);
    grad.addColorStop(0, '#999'); grad.addColorStop(0.3, '#e0e0e0'); grad.addColorStop(0.7, '#e0e0e0'); grad.addColorStop(1, '#999');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(pr - 4, -gw/2, gl, gw, 2); ctx.fill();
    // Barrel tip highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(pr + gl - 8, -gw/2, 4, gw);

    if (upgrades[3] || (weapon === 4 && upgrades[4])) {
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(pr - 4, -gw/2 - gw - 2, gl * 0.8, gw, 2); ctx.fill();
    }
    if (weapon === 4 && upgrades[4]) {
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(pr - 4, gw/2 + 2, gl * 0.8, gw, 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ── Cell drawing with membrane effect ──
function drawCell(x, y, radius, hue, isMe, borderCol) {
  const time = frameCount * 0.02;

  // Outer membrane glow
  ctx.save();
  ctx.shadowBlur = isMe ? 30 : 20;
  ctx.shadowColor = `hsla(${hue}, 80%, 55%, 0.5)`;

  // Inner gradient fill
  const grad = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.2, 0, x, y, radius);
  grad.addColorStop(0, `hsl(${hue}, 65%, 70%)`);
  grad.addColorStop(0.7, `hsl(${hue}, 70%, 50%)`);
  grad.addColorStop(1, `hsl(${hue}, 75%, 38%)`);

  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.restore();

  // Membrane border (animated thickness)
  const membraneWidth = 2.5 + Math.sin(time + hue) * 0.5;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = borderCol || '#fff';
  ctx.lineWidth = membraneWidth; ctx.stroke();

  // Specular highlight (top-left)
  const hlGrad = ctx.createRadialGradient(
    x - radius * 0.35, y - radius * 0.35, 0,
    x - radius * 0.2, y - radius * 0.2, radius * 0.6
  );
  hlGrad.addColorStop(0, `rgba(255, 255, 255, ${isMe ? 0.25 : 0.15})`);
  hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hlGrad; ctx.fill();
}

// ── Health bar (rounded, animated) ──
function drawHealthBar(x, y, radius, hp, maxHp, width) {
  const bw = width || radius * 2.4;
  const bh = 4, bx = x - bw / 2, by = y - radius - 14;
  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const hue = hpRatio > 0.6 ? 140 : hpRatio > 0.3 ? 45 : 0;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2); ctx.fill();

  // Fill with gradient
  if (hpRatio > 0) {
    const fillGrad = ctx.createLinearGradient(bx, by, bx + hpRatio * bw, by);
    fillGrad.addColorStop(0, `hsl(${hue}, 90%, 60%)`);
    fillGrad.addColorStop(1, `hsl(${hue}, 80%, 45%)`);
    ctx.fillStyle = fillGrad;
    ctx.beginPath(); ctx.roundRect(bx, by, hpRatio * bw, bh, 2); ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(bx, by, hpRatio * bw, bh / 2, [2, 2, 0, 0]); ctx.fill();
  }
}

// ── Background grid with depth ──
function drawGrid(camX, camY, W, H) {
  const gs = 80;
  const sx = Math.floor(camX / gs) * gs;
  const sy = Math.floor(camY / gs) * gs;

  // Faint grid
  ctx.strokeStyle = 'rgba(80, 70, 160, 0.04)';
  ctx.lineWidth = 1;
  for (let x = sx; x < camX + W + gs; x += gs) {
    ctx.beginPath(); ctx.moveTo(x, camY); ctx.lineTo(x, camY + H); ctx.stroke();
  }
  for (let y = sy; y < camY + H + gs; y += gs) {
    ctx.beginPath(); ctx.moveTo(camX, y); ctx.lineTo(camX + W, y); ctx.stroke();
  }

  // Grid intersections — subtle dots
  ctx.fillStyle = 'rgba(124, 108, 247, 0.06)';
  for (let x = sx; x < camX + W + gs; x += gs) {
    for (let y = sy; y < camY + H + gs; y += gs) {
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // World border
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = 'rgba(124, 108, 247, 0.4)';
  ctx.strokeStyle = 'rgba(124, 108, 247, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, WORLD, WORLD);
  ctx.restore();
}

// ── Food drawing (hexagonal pellets) ──
function drawFood(food) {
  for (const f of food) {
    const r = f.r;
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = `hsl(${f.hue}, 80%, 55%)`;

    // Hexagonal shape
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = f.x + r * Math.cos(angle);
      const py = f.y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    grad.addColorStop(0, `hsl(${f.hue}, 70%, 75%)`);
    grad.addColorStop(1, `hsl(${f.hue}, 80%, 50%)`);
    ctx.fillStyle = grad; ctx.fill();

    ctx.restore();
  }
}

// ═══ MAIN DRAW ═══
function draw() {
  const { gameState, camX, camY, myId, myHue, mx, my, selectedWeapon, myUpgrades } = store;
  const W = canvas.width, H = canvas.height;
  frameCount++;

  updateShake();
  updateTrails();
  updateParticles();

  // Detect damage for screen shake + flash
  const me = gameState.players.find(p => p.id === myId);
  if (me) {
    if (me.hp < prevPlayerHp - 2) {
      applyShake(Math.min(10, (prevPlayerHp - me.hp) * 0.7));
      if (typeof store._onDamage === 'function') store._onDamage();
    }
    prevPlayerHp = me.hp;
  }
  const myMass = me ? me.mass : 20;

  // ── Background ──
  // Dark base with subtle radial gradient (nebula feel)
  const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7);
  bgGrad.addColorStop(0, '#0c0a1a');
  bgGrad.addColorStop(1, '#040408');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-camX + shakeX, -camY + shakeY);

  // Grid
  drawGrid(camX, camY, W, H);

  // Food
  drawFood(gameState.food);

  // Trails (behind bullets)
  drawTrails();

  // Bullets
  gameState.bullets.forEach(drawBullet);

  // Particles
  drawParticles();

  // Explosions
  drawExplosions();

  // ── Bots ──
  gameState.bots.forEach(e => {
    const er = r2m(e.mass);
    const bc = borderColor(e.mass, myMass);

    drawCell(e.x, e.y, er, e.hue, false, bc);

    if (e.gun) {
      // Gold ring for armed bots
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 200, 30, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -frameCount * 0.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, er + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 210, 50, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Barrel
      const nearestP = gameState.players.reduce((best, p) => {
        const d2 = Math.hypot(p.x - e.x, p.y - e.y);
        return (!best || d2 < best.d) ? { p, d: d2 } : best;
      }, null);
      if (nearestP) {
        const ang = Math.atan2(nearestP.p.y - e.y, nearestP.p.x - e.x);
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(ang);
        const bGrad = ctx.createLinearGradient(0, -3.5, 0, 3.5);
        bGrad.addColorStop(0, '#a89000'); bGrad.addColorStop(0.5, '#e8c800'); bGrad.addColorStop(1, '#a89000');
        ctx.fillStyle = bGrad;
        ctx.beginPath(); ctx.roundRect(er - 2, -3.5, er * 0.65 + 8, 7, 2); ctx.fill();
        ctx.restore();
      }
    }

    // Name
    const fs = Math.max(10, er * 0.45);
    ctx.font = `bold ${fs}px 'Share Tech Mono', Courier New`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
    ctx.strokeText(e.name.slice(0, 6), e.x, e.y);
    ctx.fillText(e.name.slice(0, 6), e.x, e.y);

    if (e.maxHp) drawHealthBar(e.x, e.y, er, e.hp, e.maxHp);
  });

  // ── Other players ──
  gameState.players.forEach(p => {
    if (p.id === myId) return;
    const pr = r2m(p.mass);
    const maxHp = p.maxHp || 100;
    const pupgrades = p.upgrades || [0,0,0,0,0,0,0,0];
    const weapon = p.weapon || 0;
    const ga = p.angle || 0;

    drawGunBarrel(p.x, p.y, pr, ga, pupgrades, weapon);
    drawCell(p.x, p.y, pr, p.hue, false, 'rgba(255, 255, 100, 0.7)');

    const fs = Math.max(11, pr * 0.45);
    ctx.font = `bold ${fs}px 'Share Tech Mono', Courier New`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
    ctx.strokeText(p.name.slice(0, 8), p.x, p.y);
    ctx.fillText(p.name.slice(0, 8), p.x, p.y);

    drawHealthBar(p.x, p.y, pr, p.hp, maxHp, pr * 2.6);
  });

  // ── My player ──
  if (me) {
    const pr = r2m(me.mass);
    const wx = mx + camX, wy = my + camY;
    const ga = Math.atan2(wy - me.y, wx - me.x);

    drawGunBarrel(me.x, me.y, pr, ga, myUpgrades, selectedWeapon);
    drawCell(me.x, me.y, pr, myHue, true, '#fff');

    const fs = Math.max(11, pr * 0.45);
    ctx.font = `bold ${fs}px 'Share Tech Mono', Courier New`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeText(me.name.slice(0, 8), me.x, me.y);
    ctx.fillText(me.name.slice(0, 8), me.x, me.y);

    drawHealthBar(me.x, me.y, pr, me.hp, me.maxHp || 100, pr * 2.6);
  }

  ctx.restore();

  // ── Minimap ──
  const mW = 140, mH = 140, mX = W - mW - 14, mY = H - mH - 80;

  // Minimap background with border
  ctx.save();
  ctx.globalAlpha = 0.8;

  ctx.fillStyle = 'rgba(5, 5, 25, 0.75)';
  ctx.beginPath(); ctx.roundRect(mX - 3, mY - 3, mW + 6, mH + 6, 10); ctx.fill();

  // Border gradient
  ctx.strokeStyle = 'rgba(124, 108, 247, 0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(mX - 3, mY - 3, mW + 6, mH + 6, 10); ctx.stroke();

  ctx.globalAlpha = 1;

  // Clip to minimap region
  ctx.beginPath(); ctx.roundRect(mX, mY, mW, mH, 8); ctx.clip();

  const sc = mW / WORLD;

  // Food (very faint)
  ctx.globalAlpha = 0.3;
  gameState.food.forEach(f => {
    ctx.fillStyle = `hsl(${f.hue}, 70%, 55%)`;
    ctx.fillRect(mX + f.x * sc - 0.5, mY + f.y * sc - 0.5, 1, 1);
  });
  ctx.globalAlpha = 1;

  // Bots
  gameState.bots.forEach(e => {
    ctx.beginPath(); ctx.arc(mX + e.x * sc, mY + e.y * sc, 2, 0, Math.PI * 2);
    ctx.fillStyle = borderColor(e.mass, myMass); ctx.fill();
  });

  // Players
  gameState.players.forEach(p => {
    const isMe = p.id === myId;
    ctx.beginPath(); ctx.arc(mX + p.x * sc, mY + p.y * sc, isMe ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? '#7c6cf7' : '#ffff44'; ctx.fill();
    if (isMe) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  });

  // Explosions
  (gameState.explosions || []).forEach(exp => {
    ctx.beginPath(); ctx.arc(mX + exp.x * sc, mY + exp.y * sc, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 120, 0, 0.7)'; ctx.fill();
  });

  ctx.restore();
}

function loop() {
  if (store.running) draw();
  animFrameId = requestAnimationFrame(loop);
}

function resize() {
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  animFrameId = requestAnimationFrame(loop);
}

export function destroyRenderer() {
  window.removeEventListener('resize', resize);
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  canvas = null;
  ctx = null;
}
