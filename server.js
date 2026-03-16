// Cell Shooter — Multiplayer Server (Bun)
// Run: bun server.js

import { join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PORT      = 3000;
const WORLD     = 3000;
const TICK_RATE = 30;

// ─── helpers ─────────────────────────────────────────────────────────────────
const rnd   = (a, b) => a + Math.random() * (b - a);
const dst   = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const r2m   = m => Math.sqrt(m) * 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── game state ──────────────────────────────────────────────────────────────
let players        = new Map();
let bots           = [];
let food           = [];
let bullets        = [];
let explosions     = [];
let portals        = [];
let deathParticles = [];       // ← collectible server-side particles
let nextId         = 1;
let tickCount      = 0;
let nextPortalSpawn = Date.now() + 12000;
const MAX_DEATH_PARTICLES = 150;

const NAMES = ['Goo','Blob','Zap','Nox','Slime','Evo','Boz','Fiz','Krix','Vex','Mog','Driz'];
const CHASE = 1.25;
const FLEE  = 0.80;

// ─── food ────────────────────────────────────────────────────────────────────
function addFood() {
  food.push({ id: nextId++, x: rnd(20,WORLD-20), y: rnd(20,WORLD-20), r: rnd(4,9), hue: Math.random()*360 });
}
for (let i = 0; i < 200; i++) addFood();

// ─── bots ────────────────────────────────────────────────────────────────────
function addBot() {
  const mass = rnd(10, 40);
  bots.push({
    id: 'bot_' + nextId++,
    name: NAMES[Math.floor(rnd(0, NAMES.length))] + Math.floor(rnd(1,99)),
    x: rnd(100,WORLD-100), y: rnd(100,WORLD-100),
    mass, vx:0, vy:0, hp: mass*2, maxHp: mass*2,
    hue: Math.floor(rnd(0,360)),
    gun: Math.random() < 0.28,
    lastShot: 0, wanderAngle: rnd(0,Math.PI*2), wanderTimer: rnd(60,180),
  });
}
for (let i = 0; i < 16; i++) addBot();

// ─── portals ─────────────────────────────────────────────────────────────────
function spawnPortal() {
  portals.push({ id:nextId++, x:rnd(300,WORLD-300), y:rnd(300,WORLD-300), r:45, life:600, hue:Math.floor(rnd(0,360)) });
}

// ─── death particles (collectible, server-side) ───────────────────────────────
function spawnDeathParticles(x, y, mass, score) {
  const count = Math.min(20, Math.floor(Math.sqrt(mass) * 2.2 + score * 0.012));
  for (let i = 0; i < count; i++) {
    if (deathParticles.length >= MAX_DEATH_PARTICLES) break;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 2 + Math.random() * 4.5;
    const pm    = 0.8 + Math.random() * Math.min(4, mass / 10);
    deathParticles.push({
      id:  nextId++,
      x:   x + (Math.random()-0.5) * 14,
      y:   y + (Math.random()-0.5) * 14,
      vx:  Math.cos(angle) * speed,
      vy:  Math.sin(angle) * speed,
      mass: pm,
      r:   Math.max(3, Math.sqrt(pm) * 2.2),
      life: 450 + Math.random() * 350,
      hue:  10 + Math.random() * 55,
    });
  }
}

// ─── bullets ─────────────────────────────────────────────────────────────────
function fireB(ownerId, x, y, tx, ty, isPlayer, dmg, count=1, spread=0, explosive=false) {
  const a = Math.atan2(ty-y, tx-x);
  for (let i = 0; i < count; i++) {
    const ang = a + (i-(count-1)/2)*spread;
    const spd = explosive ? 9 : 13;
    const r   = explosive ? 9 : 4.5;
    const lf  = explosive ? 55 : 75;
    bullets.push({ id:nextId++, ownerId, x, y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, isPlayer, dmg, r, life:lf, explosive });
  }
}

// ─── explosions ──────────────────────────────────────────────────────────────
function triggerExplosion(x, y, ownerId, isPlayer, dmg, now) {
  const expR = 130;
  explosions.push({ id:nextId++, x, y, r:expR, life:15 });
  if (isPlayer) {
    for (let j = bots.length-1; j >= 0; j--) {
      const e = bots[j];
      const d = dst(x,y,e.x,e.y);
      if (d < expR + r2m(e.mass)) {
        const f = Math.max(0, 1 - d/(expR+r2m(e.mass)));
        e.hp -= dmg*1.8*f;
        if (e.hp <= 0) {
          const shooter = players.get(ownerId);
          if (shooter) { shooter.score += Math.floor(e.mass*3); shooter.mass += e.mass*0.2; }
          spawnDeathParticles(e.x, e.y, e.mass, 0);
          bots.splice(j,1); addBot();
        }
      }
    }
    for (const [,p] of players) {
      if (p.id === ownerId) continue;
      const d = dst(x,y,p.x,p.y);
      if (d < expR + r2m(p.mass)) {
        const f = Math.max(0, 1 - d/(expR+r2m(p.mass)));
        p.hp -= dmg*1.8*f; p.lastDamaged = now;
        if (p.hp <= 0) {
          const shooter = players.get(ownerId);
          if (shooter) { shooter.score += Math.floor(p.mass*3); shooter.mass += p.mass*0.3; }
          respawnPlayer(p);
        }
      }
    }
  } else {
    for (const [,p] of players) {
      const d = dst(x,y,p.x,p.y);
      if (d < expR + r2m(p.mass)) {
        const f = Math.max(0, 1 - d/(expR+r2m(p.mass)));
        p.hp -= dmg*1.5*f; p.lastDamaged = now;
      }
    }
  }
}

// ─── bot AI ──────────────────────────────────────────────────────────────────
function botAI(e, dt, now) {
  const er = r2m(e.mass);
  let fx = 0, fy = 0;
  let nearestPlayer = null, nearestDist = Infinity;
  for (const p of players.values()) {
    const d = dst(e.x,e.y,p.x,p.y);
    if (d < nearestDist) { nearestDist=d; nearestPlayer=p; }
  }
  if (nearestPlayer) {
    const ratio = e.mass / nearestPlayer.mass;
    const pd = nearestDist;
    if (ratio >= CHASE) {
      if (e.gun) {
        const opt = 380;
        if (pd>opt+60&&pd<700) { fx+=(nearestPlayer.x-e.x)/(pd+.001); fy+=(nearestPlayer.y-e.y)/(pd+.001); }
        else if (pd<opt-40)   { fx-=(nearestPlayer.x-e.x)/(pd+.001)*.9; fy-=(nearestPlayer.y-e.y)/(pd+.001)*.9; }
      } else if (pd<650) { fx+=(nearestPlayer.x-e.x)/(pd+.001); fy+=(nearestPlayer.y-e.y)/(pd+.001); }
      if (e.gun&&pd<650&&now-e.lastShot>1400) { fireB(e.id,e.x,e.y,nearestPlayer.x,nearestPlayer.y,false,8); e.lastShot=now; }
    } else if (ratio <= FLEE) {
      if (pd<500) { fx-=(nearestPlayer.x-e.x)/(pd+.001)*1.6; fy-=(nearestPlayer.y-e.y)/(pd+.001)*1.6; }
      else        { fx+=Math.cos(e.wanderAngle)*.4; fy+=Math.sin(e.wanderAngle)*.4; }
      if (e.gun&&pd<450&&pd>150&&now-e.lastShot>2000) { fireB(e.id,e.x,e.y,nearestPlayer.x,nearestPlayer.y,false,6); e.lastShot=now; }
    } else {
      let bf=null, bd=300;
      for (const f of food) { const d=dst(f.x,f.y,e.x,e.y); if(d<bd){bd=d;bf=f;} }
      if (bf) { fx+=(bf.x-e.x)/(bd+.001)*.9; fy+=(bf.y-e.y)/(bd+.001)*.9; }
      else    { fx+=Math.cos(e.wanderAngle)*.5; fy+=Math.sin(e.wanderAngle)*.5; }
    }
  } else { fx+=Math.cos(e.wanderAngle)*.5; fy+=Math.sin(e.wanderAngle)*.5; }

  for (const o of bots) {
    if (o===e) continue;
    const od=dst(e.x,e.y,o.x,o.y), minD=er+r2m(o.mass)+8;
    if (od<minD&&od>.1) { const p=(minD-od)/minD; fx-=(o.x-e.x)/od*p*1.3; fy-=(o.y-e.y)/od*p*1.3; }
  }
  e.wanderTimer-=dt;
  if (e.wanderTimer<=0) { e.wanderAngle=rnd(0,Math.PI*2); e.wanderTimer=rnd(60,200); }
  const spd=(3.8)/(0.8+er*.02), len=Math.hypot(fx,fy)+.001;
  e.vx+=(fx/len*spd-e.vx)*.1*dt; e.vy+=(fy/len*spd-e.vy)*.1*dt;
  e.x=clamp(e.x+e.vx*dt,er,WORLD-er); e.y=clamp(e.y+e.vy*dt,er,WORLD-er);
  for (let i=food.length-1;i>=0;i--) {
    const f=food[i];
    if (dst(f.x,f.y,e.x,e.y)<er+f.r) { e.mass+=f.r*.15; food.splice(i,1); addFood(); }
  }
}

// ─── main tick ───────────────────────────────────────────────────────────────
let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const dt  = Math.min((now-lastTick)/16.67, 3);
  lastTick  = now;
  tickCount++;

  // ── portal spawning ──
  if (now >= nextPortalSpawn && portals.length < 3) {
    spawnPortal();
    nextPortalSpawn = now + rnd(15000, 28000);
  }

  // ── tick portals + player-portal collision ──
  for (let i = portals.length-1; i >= 0; i--) {
    portals[i].life -= dt;
    if (portals[i].life <= 0) { portals.splice(i,1); continue; }
    for (const [,p] of players) {
      if (p.snakeMode) continue;
      const portal = portals[i];
      if (portal && dst(p.x,p.y,portal.x,portal.y) < portal.r + r2m(p.mass)*0.5) {
        p.snakeMode=true; p.snakeTimer=700; p.snakeBody=[]; p.snakeCooldown=0;
        portals.splice(i,1); break;
      }
    }
  }

  // ── death particles physics + collection ──
  for (let i = deathParticles.length-1; i >= 0; i--) {
    const dp = deathParticles[i];
    dp.vx *= 0.97; dp.vy *= 0.97;
    dp.x = clamp(dp.x + dp.vx*dt, dp.r, WORLD-dp.r);
    dp.y = clamp(dp.y + dp.vy*dt, dp.r, WORLD-dp.r);
    dp.life -= dt;
    if (dp.life <= 0) { deathParticles.splice(i,1); continue; }
    let eaten = false;
    for (const [,p] of players) {
      if (dst(p.x,p.y,dp.x,dp.y) < r2m(p.mass)+dp.r) {
        p.mass  += dp.mass;
        p.score += Math.max(1, Math.floor(dp.mass * 2));
        deathParticles.splice(i,1); eaten=true; break;
      }
    }
    if (!eaten) {
      for (const e of bots) {
        if (dst(e.x,e.y,dp.x,dp.y) < r2m(e.mass)+dp.r) {
          e.mass += dp.mass * 0.5;
          deathParticles.splice(i,1); break;
        }
      }
    }
  }

  // ── move players ──
  for (const [,p] of players) {
    const pr  = r2m(p.mass);
    const spd = (5.5 + p.upgrades[0]*1.5) / (0.7 + pr*0.018);
    const mvx = p.moveX||0, mvy = p.moveY||0;
    const len = Math.hypot(mvx,mvy);
    if (len > 0) { p.vx+=(mvx/len*spd-p.vx)*.13*dt; p.vy+=(mvy/len*spd-p.vy)*.13*dt; }
    else         { p.vx*=.85; p.vy*=.85; }
    p.x = clamp(p.x+p.vx*dt, pr, WORLD-pr);
    p.y = clamp(p.y+p.vy*dt, pr, WORLD-pr);
    for (let i=food.length-1;i>=0;i--) {
      const f=food[i];
      if (dst(f.x,f.y,p.x,p.y)<pr+f.r) { p.mass+=f.r*.25; p.score+=1; food.splice(i,1); addFood(); }
    }
    // ── snake mode ──
    if (p.snakeMode) {
      const lastPt = p.snakeBody[0];
      if (!lastPt || dst(p.x,p.y,lastPt.x,lastPt.y) >= 18) {
        p.snakeBody.unshift({ x:p.x, y:p.y });
        if (p.snakeBody.length > 18) p.snakeBody.pop();
      }
      p.snakeCooldown -= dt;
      if (p.snakeCooldown <= 0 && p.snakeBody.length >= 2) {
        p.snakeCooldown = 40; // higher cadence
        for (let seg=0; seg<p.snakeBody.length; seg+=3) {
          const s  = p.snakeBody[seg];
          const nx = p.snakeBody[Math.min(seg+1,p.snakeBody.length-1)];
          const ba = Math.atan2(s.y-nx.y, s.x-nx.x);
          const R  = 14;
          const perpL = ba + Math.PI/2, perpR = ba - Math.PI/2;
          const lx = s.x+Math.cos(perpL)*R, ly = s.y+Math.sin(perpL)*R;
          const rx = s.x+Math.cos(perpR)*R, ry = s.y+Math.sin(perpR)*R;
          // fire sideways (perpendicular to body), not at a target
          fireB(p.id, lx, ly, lx+Math.cos(perpL)*200, ly+Math.sin(perpL)*200, true, 5);
          fireB(p.id, rx, ry, rx+Math.cos(perpR)*200, ry+Math.sin(perpR)*200, true, 5);
        }
      }
      p.snakeTimer -= dt;
      if (p.snakeTimer <= 0) { p.snakeMode=false; p.snakeBody=[]; }
    }
  }

  // ── bot AI ──
  for (let i=bots.length-1;i>=0;i--) botAI(bots[i],dt,now);

  // ── bullets ──
  for (let i=bullets.length-1;i>=0;i--) {
    const b=bullets[i];
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    if (b.life<=0||b.x<0||b.x>WORLD||b.y<0||b.y>WORLD) {
      if (b.explosive) triggerExplosion(b.x,b.y,b.ownerId,b.isPlayer,b.dmg,now);
      bullets.splice(i,1); continue;
    }
    let hit=false;
    if (b.isPlayer) {
      for (let j=bots.length-1;j>=0;j--) {
        const e=bots[j];
        if (dst(b.x,b.y,e.x,e.y)<r2m(e.mass)+b.r) {
          if (b.explosive) { triggerExplosion(b.x,b.y,b.ownerId,b.isPlayer,b.dmg,now); }
          else {
            e.hp-=b.dmg;
            if (e.hp<=0) {
              const sh=players.get(b.ownerId);
              if (sh) { sh.score+=Math.floor(e.mass*3); sh.mass+=e.mass*.2; }
              spawnDeathParticles(e.x,e.y,e.mass,0);
              bots.splice(j,1); addBot();
            }
          }
          hit=true; break;
        }
      }
      if (!hit) {
        for (const [,p] of players) {
          if (p.id===b.ownerId) continue;
          if (dst(b.x,b.y,p.x,p.y)<r2m(p.mass)+b.r) {
            if (b.explosive) { triggerExplosion(b.x,b.y,b.ownerId,b.isPlayer,b.dmg,now); }
            else {
              p.hp-=b.dmg; p.lastDamaged=now;
              if (p.hp<=0) {
                const sh=players.get(b.ownerId);
                if (sh) { sh.score+=Math.floor(p.mass*3); sh.mass+=p.mass*.3; }
                respawnPlayer(p);
              }
            }
            hit=true; break;
          }
        }
      }
    } else {
      for (const [,p] of players) {
        if (dst(b.x,b.y,p.x,p.y)<r2m(p.mass)+b.r) {
          if (b.explosive) { triggerExplosion(b.x,b.y,b.ownerId,b.isPlayer,b.dmg,now); }
          else { p.hp-=b.dmg; p.lastDamaged=now; }
          hit=true; break;
        }
      }
    }
    if (hit) bullets.splice(i,1);
  }

  // ── explosions ──
  for (let i=explosions.length-1;i>=0;i--) {
    explosions[i].life-=dt;
    if (explosions[i].life<=0) explosions.splice(i,1);
  }

  // ── player ↔ bot collisions ──
  for (const [,p] of players) {
    const pr=r2m(p.mass);
    for (let i=bots.length-1;i>=0;i--) {
      const e=bots[i]; const er=r2m(e.mass);
      const d=dst(p.x,p.y,e.x,e.y);
      if (d<pr+er-5) {
        if (d+er<pr&&p.mass>e.mass*1.1) {
          p.score+=Math.floor(e.mass*3); p.mass+=e.mass*.7;
          spawnDeathParticles(e.x,e.y,e.mass,0);
          bots.splice(i,1); addBot(); continue;
        }
        if (e.mass>p.mass*1.1)     { p.hp-=0.6*dt; p.mass=Math.max(10,p.mass-.08*dt); p.lastDamaged=now; }
        else if (p.mass>e.mass*1.1){ e.hp-=2*dt; }
        if (e.hp<=0) {
          p.score+=Math.floor(e.mass*3); p.mass+=e.mass*.2;
          spawnDeathParticles(e.x,e.y,e.mass,0);
          bots.splice(i,1); addBot();
        }
      }
    }
    for (const [,p2] of players) {
      if (p2.id<=p.id) continue;
      const pr2=r2m(p2.mass);
      if (dst(p.x,p.y,p2.x,p2.y)<pr+pr2-5) {
        if (p.mass>p2.mass*1.15)      { p2.hp-=.8*dt; p2.lastDamaged=now; }
        else if (p2.mass>p.mass*1.15) { p.hp -=.8*dt; p.lastDamaged=now; }
      }
    }
    if (p.hp<=0) respawnPlayer(p);
  }

  // ── HP regen ──
  for (const [,p] of players) {
    const maxHp=100+(p.upgrades[5]||0)*25; p.maxHp=maxHp;
    if (now-(p.lastDamaged||0)>5000&&p.hp<maxHp)
      p.hp=Math.min(maxHp, p.hp+(1+(p.upgrades[5]||0)*.6)*dt*.065);
  }

  while (bots.length < 16) addBot();

  // ── broadcast state (Bun pub/sub, single serialization) ──
  // Food sent every 5 ticks to save bandwidth; clients cache the last received list
  const sendFood = tickCount % 5 === 0;
  gameServer.publish('game', JSON.stringify({ type:'state', data: buildState(sendFood) }));
}

function respawnPlayer(p) {
  spawnDeathParticles(p.x, p.y, p.mass, p.score);
  p.snakeMode=false; p.snakeBody=[];
  const maxHp=100+(p.upgrades[5]||0)*25;
  p.x=rnd(200,WORLD-200); p.y=rnd(200,WORLD-200);
  p.mass=20; p.vx=0; p.vy=0; p.hp=maxHp; p.maxHp=maxHp;
  p.deaths=(p.deaths||0)+1; p.lastDamaged=0;
}

function buildState(sendFood=true) {
  return {
    players: [...players.values()].map(p=>({
      id:p.id, name:p.name, x:p.x, y:p.y, mass:p.mass, hp:p.hp, maxHp:p.maxHp||100,
      score:p.score, hue:p.hue, upgrades:p.upgrades,
      angle: Math.atan2((p.targetY||0)-p.y, (p.targetX||WORLD/2)-p.x),
      weapon: p.selectedWeapon||0,
      snakeMode: p.snakeMode||false,
      snakeBody: p.snakeMode ? (p.snakeBody||[]) : [],
    })),
    bots: bots.map(b=>({ id:b.id, name:b.name, x:b.x, y:b.y, mass:b.mass, hp:b.hp, maxHp:b.maxHp, hue:b.hue, gun:b.gun })),
    food: sendFood ? food.map(f=>({ id:f.id, x:f.x, y:f.y, r:f.r, hue:f.hue })) : null,
    bullets: bullets.map(b=>({ id:b.id, x:b.x, y:b.y, vx:b.vx, vy:b.vy, isPlayer:b.isPlayer, ownerId:b.ownerId, explosive:b.explosive })),
    explosions: explosions.map(e=>({ id:e.id, x:e.x, y:e.y, r:e.r, life:e.life })),
    portals: portals.map(p=>({ id:p.id, x:p.x, y:p.y, r:p.r, life:p.life, hue:p.hue })),
    deathParticles: deathParticles.map(dp=>({ id:dp.id, x:dp.x, y:dp.y, r:dp.r, hue:dp.hue, life:dp.life })),
  };
}

function getCooldown(upg, sw=0) {
  if (sw===7&&upg[7]) return Math.max(400,1200-upg[1]*80);
  if (sw===4&&upg[4]) return Math.max(100, 220-upg[1]*12);
  if (sw===6&&upg[6]) return Math.max(300,800 -upg[1]*60);
  return Math.max(60, 420-upg[1]*60);
}

// ─── static file serving ─────────────────────────────────────────────────────
const DIST_DIR = join(__dirname, 'dist');
const HAS_DIST = existsSync(DIST_DIR);

async function serveStatic(pathname) {
  if (!HAS_DIST) return new Response('Run "pnpm run build" first.', { status: 503 });
  const normalized = (pathname === '/' || pathname === '') ? '/index.html' : pathname;
  const filePath   = join(DIST_DIR, normalized);
  const file       = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  // SPA fallback
  const index = Bun.file(join(DIST_DIR, 'index.html'));
  if (await index.exists()) return new Response(index);
  return new Response('Not found', { status: 404 });
}

// ─── Bun HTTP + WebSocket server ─────────────────────────────────────────────
const gameServer = Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const ok = server.upgrade(req, { data: { playerId: null } });
      return ok ? undefined : new Response('WebSocket upgrade failed', { status: 400 });
    }
    return serveStatic(url.pathname);
  },

  websocket: {
    perMessageDeflate: { threshold: 256 }, // compress messages > 256 bytes

    open(ws) {
      ws.subscribe('game');
    },

    message(ws, raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'join') {
        const id  = nextId++;
        const hue = Math.floor(rnd(0,360));
        const player = {
          id, ws, name:(msg.name||'Jugador').slice(0,16),
          x:rnd(300,WORLD-300), y:rnd(300,WORLD-300),
          mass:20, vx:0, vy:0, hp:100, maxHp:100,
          targetX:WORLD/2, targetY:WORLD/2, moveX:0, moveY:0,
          hue, score:0, deaths:0, lastShot:0, lastDamaged:0,
          upgrades:[0,0,0,0,0,0,0,0], selectedWeapon:0,
          snakeMode:false, snakeBody:[], snakeTimer:0, snakeCooldown:0,
        };
        players.set(id, player);
        ws.data.playerId = id;
        ws.send(JSON.stringify({ type:'joined', id, hue }));
        console.log(`[+] ${player.name} joined (id=${id}), total=${players.size}`);
      }

      if (msg.type === 'input') {
        const p = players.get(ws.data.playerId);
        if (!p) return;
        if (msg.tx !== undefined) { p.targetX=msg.tx; p.targetY=msg.ty; }
        if (msg.mvx !== undefined){ p.moveX=msg.mvx; p.moveY=msg.mvy; }
        if (msg.selWeapon !== undefined) {
          const sw=msg.selWeapon;
          if (sw===0||(sw===4&&p.upgrades[4])||(sw===6&&p.upgrades[6])||(sw===7&&p.upgrades[7]))
            p.selectedWeapon=sw;
        }
        if (msg.shoot) {
          const now=Date.now(), sw=p.selectedWeapon||0;
          if (now-p.lastShot >= getCooldown(p.upgrades,sw)) {
            p.lastShot=now;
            const dmg=10+p.upgrades[2]*8;
            let count=1, spread=0, explosive=false;
            if      (sw===7&&p.upgrades[7]) { explosive=true; }
            else if (sw===4&&p.upgrades[4]) { count=1; }           // nerfed: single shots, shorter cooldown
            else if (sw===6&&p.upgrades[6]) { count=6; spread=0.26; }
            else if (p.upgrades[3])         { count=2; spread=0.13; }
            fireB(p.id,p.x,p.y,msg.tx,msg.ty,true,dmg,count,spread,explosive);
          }
        }
      }

      if (msg.type === 'upgrade') {
        const p=players.get(ws.data.playerId); if (!p) return;
        const costs=[50,75,100,200,500,80,300,700];
        const maxes=[5,5,5,1,1,5,1,1];
        const i=msg.index; if(i<0||i>7) return;
        const cost=costs[i]*(p.upgrades[i]+1);
        if (p.upgrades[i]>=maxes[i]||p.score<cost) return;
        p.score-=cost; p.upgrades[i]++;
        if (i===5) { p.maxHp=100+p.upgrades[5]*25; p.hp=Math.min(p.hp+25,p.maxHp); }
        ws.send(JSON.stringify({ type:'upgraded', upgrades:p.upgrades, score:p.score }));
      }
    },

    close(ws) {
      ws.unsubscribe('game');
      const id = ws.data.playerId;
      if (id) {
        const p = players.get(id);
        if (p) console.log(`[-] ${p.name} disconnected`);
        players.delete(id);
      }
    },
  },
});

setInterval(tick, TICK_RATE);
console.log(`\n🎮 Cell Shooter running at http://localhost:${PORT}\n`);
