// Sound system — extracted verbatim from client.html (Web Audio API)

import { store } from './state.js';

let audioCtx = null;

export function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function makeNoiseBuffer(ac, duration) {
  const len = Math.floor(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function playShoot(weapon) {
  if (store.muted) return;
  try {
    const ac = getAudio();
    const t = ac.currentTime;
    if (weapon === 'Metralleta') {
      const src = ac.createBufferSource();
      src.buffer = makeNoiseBuffer(ac, 0.04);
      const flt = ac.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 1000;
      const g = ac.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(flt); flt.connect(g); g.connect(ac.destination);
      src.start(t);
    } else if (weapon === 'Escopeta') {
      const src = ac.createBufferSource();
      src.buffer = makeNoiseBuffer(ac, 0.18);
      const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2500;
      const g = ac.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(flt); flt.connect(g); g.connect(ac.destination);
      src.start(t);
      const osc = ac.createOscillator(); const og = ac.createGain();
      osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      og.gain.setValueAtTime(0.45, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(og); og.connect(ac.destination); osc.start(t); osc.stop(t + 0.12);
    } else if (weapon === 'Granadas') {
      const osc = ac.createOscillator(); const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(ac.destination); osc.start(t); osc.stop(t + 0.22);
    } else {
      const src = ac.createBufferSource();
      src.buffer = makeNoiseBuffer(ac, 0.07);
      const flt = ac.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1400; flt.Q.value = 0.6;
      const g = ac.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      src.connect(flt); flt.connect(g); g.connect(ac.destination);
      src.start(t);
      const osc = ac.createOscillator(); const og = ac.createGain();
      osc.frequency.setValueAtTime(420, t); osc.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      og.gain.setValueAtTime(0.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(og); og.connect(ac.destination); osc.start(t); osc.stop(t + 0.07);
    }
  } catch (e) { }
}

export function playExplosion() {
  if (store.muted) return;
  try {
    const ac = getAudio();
    const t = ac.currentTime;
    const dur = 0.65;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(ac, dur);
    const flt = ac.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 380;
    const g = ac.createGain(); g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(ac.destination);
    src.start(t);
    const osc = ac.createOscillator(); const og = ac.createGain();
    osc.frequency.setValueAtTime(85, t); osc.frequency.exponentialRampToValueAtTime(18, t + 0.45);
    og.gain.setValueAtTime(0.55, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(og); og.connect(ac.destination); osc.start(t); osc.stop(t + 0.5);
  } catch (e) { }
}

export function playHeal() {
  if (store.muted) return;
  try {
    const ac = getAudio();
    const t = ac.currentTime;
    [440, 550, 660].forEach((freq, i) => {
      const osc = ac.createOscillator(); const g = ac.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.07, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.18);
    });
  } catch (e) { }
}

export function toggleMute() {
  store.update({ muted: !store.muted });
}
