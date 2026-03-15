// Cell Shooter — Multiplayer Server (Bun)
// Run: bun server.js

const PORT = 3000;
const WORLD = 3000;
const TICK_RATE = 30; // ms per tick (≈33fps server-side)

// ─── helpers ────────────────────────────────────────────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const dst = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const r2m = m => Math.sqrt(m) * 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── game state ─────────────────────────────────────────────────────────────
let players   = new Map(); // id → player object
let bots      = [];
let food      = [];
let bullets   = [];
let explosions= [];
let particles = [];
let nextId    = 1;

const NAMES  = ['Goo','Blob','Zap','Nox','Slime','Evo','Boz','Fiz','Krix','Vex','Mog','Driz'];
const CHASE  = 1.25;
const FLEE   = 0.80;

// ─── food ───────────────────────────────────────────────────────────────────
function addFood() {
  food.push({ id: nextId++, x: rnd(20, WORLD-20), y: rnd(20, WORLD-20), r: rnd(4,9), hue: Math.random()*360 });
}
for (let i = 0; i < 200; i++) addFood();

// ─── bots ────────────────────────────────────────────────────────────────────
function addBot() {
  const mass = rnd(10, 40);
  const x = rnd(100, WORLD-100), y = rnd(100, WORLD-100);
  bots.push({
    id: 'bot_' + nextId++,
    name: NAMES[Math.floor(rnd(0, NAMES.length))] + Math.floor(rnd(1,99)),
    x, y, mass, vx: 0, vy: 0,
    hp: mass*2, maxHp: mass*2,
    hue: Math.floor(rnd(0,360)),
    gun: Math.random() < 0.28,
    lastShot: 0,
    wanderAngle: rnd(0, Math.PI*2),
    wanderTimer: rnd(60,180),
    isBot: true,
  });
}
for (let i = 0; i < 16; i++) addBot();

// ─── bullets ─────────────────────────────────────────────────────────────────
function fireB(ownerId, x, y, tx, ty, isPlayer, dmg, count=1, spread=0, explosive=false) {
  const a = Math.atan2(ty - y, tx - x);
  for (let i = 0; i < count; i++) {
    const ang = a + (i - (count-1)/2) * spread;
    const spd = explosive ? 9 : 13;
    const r   = explosive ? 9 : 4.5;
    const lf  = explosive ? 55 : 75;
    bullets.push({ id: nextId++, ownerId, x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd, isPlayer, dmg, r, life: lf, explosive });
  }
}

// ─── explosions ──────────────────────────────────────────────────────────────
function triggerExplosion(x, y, ownerId, isPlayer, dmg, now) {
  const expR = 130;
  explosions.push({ id: nextId++, x, y, r: expR, life: 15 });

  if (isPlayer) {
    // damage bots
    for (let j = bots.length-1; j >= 0; j--) {
      const e = bots[j];
      const d = dst(x, y, e.x, e.y);
      if (d < expR + r2m(e.mass)) {
        const falloff = Math.max(0, 1 - d / (expR + r2m(e.mass)));
        e.hp -= dmg * 1.8 * falloff;
        if (e.hp <= 0) {
          const shooter = players.get(ownerId);
          if (shooter) { shooter.score += Math.floor(e.mass*3); shooter.mass += e.mass*0.2; }
          bots.splice(j, 1); addBot();
        }
      }
    }
    // damage other players
    for (const [pid, p] of players) {
      if (pid === ownerId) continue;
      const d = dst(x, y, p.x, p.y);
      if (d < expR + r2m(p.mass)) {
        const falloff = Math.max(0, 1 - d / (expR + r2m(p.mass)));
        p.hp -= dmg * 1.8 * falloff;
        p.lastDamaged = now;
        const maxHp = 100 + (p.upgrades[5]||0)*25;
        if (p.hp <= 0) {
          const shooter = players.get(ownerId);
          if (shooter) { shooter.score += Math.floor(p.mass*3); shooter.mass += p.mass*0.3; }
          respawnPlayer(p);
        }
      }
    }
  } else {
    // bot explosion hits players
    for (const [pid, p] of players) {
      const d = dst(x, y, p.x, p.y);
      if (d < expR + r2m(p.mass)) {
        const falloff = Math.max(0, 1 - d / (expR + r2m(p.mass)));
        p.hp -= dmg * 1.5 * falloff;
        p.lastDamaged = now;
      }
    }
  }
}

// ─── bot AI ──────────────────────────────────────────────────────────────────
function botAI(e, dt, now) {
  const allCells = [...players.values(), ...bots.filter(b => b !== e)];
  const er = r2m(e.mass);
  let fx = 0, fy = 0;

  let nearestPlayer = null, nearestDist = Infinity;
  for (const p of players.values()) {
    const d = dst(e.x, e.y, p.x, p.y);
    if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
  }

  if (nearestPlayer) {
    const ratio = e.mass / nearestPlayer.mass;
    const pd = nearestDist;
    if (ratio >= CHASE) {
      if (e.gun) {
        const opt = 380;
        if (pd > opt+60 && pd < 700) { fx += (nearestPlayer.x-e.x)/(pd+0.001); fy += (nearestPlayer.y-e.y)/(pd+0.001); }
        else if (pd < opt-40)         { fx -= (nearestPlayer.x-e.x)/(pd+0.001)*0.9; fy -= (nearestPlayer.y-e.y)/(pd+0.001)*0.9; }
      } else if (pd < 650) {
        fx += (nearestPlayer.x-e.x)/(pd+0.001); fy += (nearestPlayer.y-e.y)/(pd+0.001);
      }
      if (e.gun && pd < 650 && now - e.lastShot > 1400) {
        fireB(e.id, e.x, e.y, nearestPlayer.x, nearestPlayer.y, false, 8);
        e.lastShot = now;
      }
    } else if (ratio <= FLEE) {
      if (pd < 500) { fx -= (nearestPlayer.x-e.x)/(pd+0.001)*1.6; fy -= (nearestPlayer.y-e.y)/(pd+0.001)*1.6; }
      else           { fx += Math.cos(e.wanderAngle)*0.4; fy += Math.sin(e.wanderAngle)*0.4; }
      if (e.gun && pd < 450 && pd > 150 && now - e.lastShot > 2000) {
        fireB(e.id, e.x, e.y, nearestPlayer.x, nearestPlayer.y, false, 6);
        e.lastShot = now;
      }
    } else {
      let bf = null, bd = 300;
      for (const f of food) { const d = dst(f.x,f.y,e.x,e.y); if (d<bd){bd=d;bf=f;} }
      if (bf) { fx += (bf.x-e.x)/(bd+0.001)*0.9; fy += (bf.y-e.y)/(bd+0.001)*0.9; }
      else     { fx += Math.cos(e.wanderAngle)*0.5; fy += Math.sin(e.wanderAngle)*0.5; }
    }
  } else {
    fx += Math.cos(e.wanderAngle)*0.5; fy += Math.sin(e.wanderAngle)*0.5;
  }

  for (const o of bots) {
    if (o === e) continue;
    const od = dst(e.x, e.y, o.x, o.y);
    const minD = er + r2m(o.mass) + 8;
    if (od < minD && od > 0.1) { const p=(minD-od)/minD; fx-=(o.x-e.x)/od*p*1.3; fy-=(o.y-e.y)/od*p*1.3; }
  }

  e.wanderTimer -= dt;
  if (e.wanderTimer <= 0) { e.wanderAngle = rnd(0,Math.PI*2); e.wanderTimer = rnd(60,200); }

  const spd = (3.8) / (0.8 + er*0.02);
  const len = Math.hypot(fx,fy)+0.001;
  e.vx += (fx/len*spd - e.vx)*0.1*dt;
  e.vy += (fy/len*spd - e.vy)*0.1*dt;
  e.x = clamp(e.x + e.vx*dt, er, WORLD-er);
  e.y = clamp(e.y + e.vy*dt, er, WORLD-er);

  for (let i = food.length-1; i >= 0; i--) {
    const f = food[i];
    if (dst(f.x,f.y,e.x,e.y) < er+f.r) { e.mass += f.r*0.15; food.splice(i,1); addFood(); }
  }
}

// ─── main tick ───────────────────────────────────────────────────────────────
let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick)/16.67, 3);
  lastTick = now;

  // ── move players ──
  for (const [id, p] of players) {
    const pr = r2m(p.mass);
    const spd = (5.5 + p.upgrades[0]*1.5) / (0.7 + pr*0.018);
    const wx = p.targetX, wy = p.targetY;
    const dx = wx-p.x, dy = wy-p.y, dl = Math.hypot(dx,dy)+0.001;
    if (dl > pr+5) {
      p.vx += (dx/dl*spd - p.vx)*0.13*dt;
      p.vy += (dy/dl*spd - p.vy)*0.13*dt;
    } else { p.vx *= 0.85; p.vy *= 0.85; }
    p.x = clamp(p.x + p.vx*dt, pr, WORLD-pr);
    p.y = clamp(p.y + p.vy*dt, pr, WORLD-pr);

    // eat food
    for (let i = food.length-1; i >= 0; i--) {
      const f = food[i];
      if (dst(f.x,f.y,p.x,p.y) < pr+f.r) {
        p.mass += f.r*0.25; p.score += 1;
        food.splice(i,1); addFood();
      }
    }
  }

  // ── bot AI ──
  for (let i = bots.length-1; i >= 0; i--) botAI(bots[i], dt, now);

  // ── bullets ──
  for (let i = bullets.length-1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx*dt; b.y += b.vy*dt; b.life -= dt;
    if (b.life<=0||b.x<0||b.x>WORLD||b.y<0||b.y>WORLD) {
      if (b.explosive) triggerExplosion(b.x, b.y, b.ownerId, b.isPlayer, b.dmg, now);
      bullets.splice(i,1); continue;
    }

    let hit = false;
    if (b.isPlayer) {
      // hit bots
      for (let j = bots.length-1; j >= 0; j--) {
        const e = bots[j];
        if (dst(b.x,b.y,e.x,e.y) < r2m(e.mass)+b.r) {
          if (b.explosive) {
            triggerExplosion(b.x, b.y, b.ownerId, b.isPlayer, b.dmg, now);
          } else {
            e.hp -= b.dmg;
            if (e.hp <= 0) {
              const shooter = players.get(b.ownerId);
              if (shooter) { shooter.score += Math.floor(e.mass*3); shooter.mass += e.mass*0.2; }
              bots.splice(j,1); addBot();
            }
          }
          hit=true; break;
        }
      }
      // hit other players
      if (!hit) {
        for (const [pid, p] of players) {
          if (pid === b.ownerId) continue;
          if (dst(b.x,b.y,p.x,p.y) < r2m(p.mass)+b.r) {
            if (b.explosive) {
              triggerExplosion(b.x, b.y, b.ownerId, b.isPlayer, b.dmg, now);
            } else {
              p.hp -= b.dmg;
              p.lastDamaged = now;
              if (p.hp <= 0) {
                const shooter = players.get(b.ownerId);
                if (shooter) { shooter.score += Math.floor(p.mass*3); shooter.mass += p.mass*0.3; }
                respawnPlayer(p);
              }
            }
            hit=true; break;
          }
        }
      }
    } else {
      // bot bullet hits players
      for (const [pid, p] of players) {
        if (dst(b.x,b.y,p.x,p.y) < r2m(p.mass)+b.r) {
          if (b.explosive) {
            triggerExplosion(b.x, b.y, b.ownerId, b.isPlayer, b.dmg, now);
          } else {
            p.hp -= b.dmg;
            p.lastDamaged = now;
          }
          hit=true; break;
        }
      }
    }
    if (hit) bullets.splice(i,1);
  }

  // ── tick explosions ──
  for (let i = explosions.length-1; i >= 0; i--) {
    explosions[i].life -= dt;
    if (explosions[i].life <= 0) explosions.splice(i, 1);
  }

  // ── player ↔ bot collisions ──
  for (const [id, p] of players) {
    const pr = r2m(p.mass);
    for (let i = bots.length-1; i >= 0; i--) {
      const e = bots[i];
      const er = r2m(e.mass);
      const d = dst(p.x, p.y, e.x, e.y);
      if (d < pr+er-5) {
        // agario: instant eat if bot is completely inside player
        if (d + er < pr && p.mass > e.mass * 1.1) {
          p.score += Math.floor(e.mass * 3); p.mass += e.mass * 0.7;
          bots.splice(i, 1); addBot(); continue;
        }
        if (e.mass > p.mass*1.1)      { p.hp -= 0.6*dt; p.mass = Math.max(10,p.mass-0.08*dt); p.lastDamaged = now; }
        else if (p.mass > e.mass*1.1) { e.hp -= 2*dt; }
        if (e.hp <= 0) { p.score += Math.floor(e.mass*3); p.mass += e.mass*0.2; bots.splice(i,1); addBot(); }
      }
    }
    // player ↔ player
    for (const [id2, p2] of players) {
      if (id2 <= id) continue;
      const pr2 = r2m(p2.mass);
      if (dst(p.x,p.y,p2.x,p2.y) < pr+pr2-5) {
        if (p.mass > p2.mass*1.15)       { p2.hp -= 0.8*dt; p2.lastDamaged = now; }
        else if (p2.mass > p.mass*1.15)  { p.hp  -= 0.8*dt; p.lastDamaged = now; }
      }
    }
    if (p.hp <= 0) respawnPlayer(p);
  }

  // ── HP regen ──
  for (const [id, p] of players) {
    const maxHp = 100 + (p.upgrades[5]||0)*25;
    p.maxHp = maxHp;
    const timeSinceDmg = now - (p.lastDamaged||0);
    if (timeSinceDmg > 5000 && p.hp < maxHp) {
      const rate = (1 + (p.upgrades[5]||0)*0.6) * dt * 0.065; // ~2-5 HP/sec
      p.hp = Math.min(maxHp, p.hp + rate);
    }
  }

  // ── ensure enough bots ──
  while (bots.length < 16) addBot();

  // ── broadcast state ──
  const state = buildState();
  const msg = JSON.stringify({ type:'state', data: state });
  for (const [id, p] of players) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(msg);
    }
  }
}

function respawnPlayer(p) {
  const maxHp = 100 + (p.upgrades[5]||0)*25;
  p.x = rnd(200, WORLD-200); p.y = rnd(200, WORLD-200);
  p.mass = 20; p.vx = 0; p.vy = 0; p.hp = maxHp;
  p.maxHp = maxHp;
  p.deaths = (p.deaths||0)+1;
  p.lastDamaged = 0;
}

function buildState() {
  return {
    players: [...players.values()].map(p=>({
      id:p.id, name:p.name, x:p.x, y:p.y, mass:p.mass, hp:p.hp, maxHp: p.maxHp||100,
      score:p.score, hue:p.hue, upgrades:p.upgrades,
    })),
    bots: bots.map(b=>({
      id:b.id, name:b.name, x:b.x, y:b.y, mass:b.mass, hp:b.hp, maxHp:b.maxHp,
      hue:b.hue, gun:b.gun,
    })),
    food: food.map(f=>({id:f.id,x:f.x,y:f.y,r:f.r,hue:f.hue})),
    bullets: bullets.map(b=>({id:b.id,x:b.x,y:b.y,isPlayer:b.isPlayer,ownerId:b.ownerId,explosive:b.explosive})),
    explosions: explosions.map(e=>({id:e.id,x:e.x,y:e.y,r:e.r,life:e.life})),
  };
}

// ─── WebSocket server ────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const ok = server.upgrade(req);
      if (!ok) return new Response('WS upgrade failed', { status: 500 });
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file('./client.html'), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404 });
  },

  websocket: {
    open(ws) {
      ws._tempId = 'tmp_' + nextId++;
    },

    message(ws, raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join') {
        const id = nextId++;
        const hue = Math.floor(rnd(0,360));
        const player = {
          id, ws,
          name: (msg.name||'Jugador').slice(0,16),
          x: rnd(300, WORLD-300), y: rnd(300, WORLD-300),
          mass: 20, vx:0, vy:0, hp:100, maxHp:100,
          targetX: WORLD/2, targetY: WORLD/2,
          hue, score:0, deaths:0,
          lastShot: 0,
          lastDamaged: 0,
          // speed, cadence, damage, double, minigun, health, shotgun, grenade
          upgrades: [0,0,0,0,0,0,0,0],
          selectedWeapon: 0, // 0=pistol/doble, 4=minigun, 6=shotgun, 7=grenade
        };
        players.set(id, player);
        ws._playerId = id;
        ws.send(JSON.stringify({ type:'joined', id, hue }));
        console.log(`[+] ${player.name} joined (id=${id}), total=${players.size}`);
      }

      if (msg.type === 'input') {
        const p = players.get(ws._playerId);
        if (!p) return;
        if (msg.tx !== undefined) { p.targetX = msg.tx; p.targetY = msg.ty; }

        // weapon selection — validate player owns the gun
        if (msg.selWeapon !== undefined) {
          const sw = msg.selWeapon;
          if (sw === 0 || (sw === 4 && p.upgrades[4]) || (sw === 6 && p.upgrades[6]) || (sw === 7 && p.upgrades[7])) {
            p.selectedWeapon = sw;
          }
        }

        if (msg.shoot) {
          const now = Date.now();
          const sw = p.selectedWeapon || 0;
          const cd = getCooldown(p.upgrades, sw);
          if (now - p.lastShot >= cd) {
            p.lastShot = now;
            const dmg = 10 + p.upgrades[2]*8;
            let count = 1, spread = 0, explosive = false;
            if      (sw === 7 && p.upgrades[7]) { count = 1; explosive = true; }
            else if (sw === 4 && p.upgrades[4]) { count = 3; spread = 0.13; }
            else if (sw === 6 && p.upgrades[6]) { count = 6; spread = 0.26; }
            else if (p.upgrades[3])             { count = 2; spread = 0.13; }
            fireB(p.id, p.x, p.y, msg.tx, msg.ty, true, dmg, count, spread, explosive);
          }
        }
      }

      if (msg.type === 'upgrade') {
        const p = players.get(ws._playerId);
        if (!p) return;
        const costs = [50, 75, 100, 200, 500, 80, 300, 700];
        const maxes = [5, 5, 5, 1, 1, 5, 1, 1];
        const i = msg.index;
        if (i < 0 || i > 7) return;
        const cost = costs[i] * (p.upgrades[i]+1);
        if (p.upgrades[i] >= maxes[i]) return;
        if (p.score < cost) return;
        p.score -= cost;
        p.upgrades[i]++;
        // immediately update maxHp if health upgraded
        if (i === 5) {
          p.maxHp = 100 + p.upgrades[5]*25;
          p.hp = Math.min(p.hp + 25, p.maxHp); // heal on upgrade
        }
        ws.send(JSON.stringify({ type:'upgraded', upgrades: p.upgrades, score: p.score }));
      }
    },

    close(ws) {
      const id = ws._playerId;
      if (id) {
        const p = players.get(id);
        if (p) console.log(`[-] ${p.name} disconnected`);
        players.delete(id);
      }
    },
  },
});

function getCooldown(upg, sw=0) {
  if (sw === 7 && upg[7]) return Math.max(400, 1200 - upg[1]*80); // grenade
  if (sw === 4 && upg[4]) return Math.max(50,  100  - upg[1]*10); // minigun
  if (sw === 6 && upg[6]) return Math.max(300, 800  - upg[1]*60); // shotgun
  return Math.max(60, 420 - upg[1]*60);                           // pistol/double
}

// start tick loop
setInterval(tick, TICK_RATE);

console.log(`\n🎮 Cell Shooter running at http://localhost:${PORT}\n`);
