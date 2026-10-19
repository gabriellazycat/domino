// Injetado antes do jogo (addInitScript): relógio virtual + áudio offline, para gravar quadro a quadro
// sem perder nenhum frame e com o som do jogo sincronizado ao vídeo.
// Fase "auto": tudo anda em tempo real (carregar, montar a cena). __cap.begin() congela o relógio;
// __cap.step(ms) avança o tempo virtual (timers + rAF) e o áudio (OfflineAudioContext) junto.
(() => {
  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now;
  const realSetTimeout = window.setTimeout.bind(window);
  const dateBase = realDateNow() - realNow();
  let manual = false, vt = 0;
  const now = () => (manual ? vt : realNow());
  performance.now = now;
  Date.now = () => Math.floor(dateBase + now());

  let rafId = 1, rafQ = [];
  window.requestAnimationFrame = (cb) => { const id = rafId++; rafQ.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafQ = rafQ.filter((r) => r.id !== id); };
  const flushRAF = (t) => { const q = rafQ; rafQ = []; for (const r of q) { try { r.cb(t); } catch (e) { console.error(e); } } };

  let tid = 1; const timers = new Map();
  const add = (fn, ms, args, rep) => { const id = tid++; timers.set(id, { fn, at: now() + Math.max(0, +ms || 0), ms: Math.max(1, +ms || 0), args, rep }); return id; };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  const runTimers = (upTo) => {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null, bid = 0;
      for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best.at)) { best = t; bid = id; }
      if (!best) return;
      if (best.rep) best.at += best.ms; else timers.delete(bid);
      try { typeof best.fn === 'function' ? best.fn(...best.args) : eval(best.fn); } catch (e) { console.error(e); }
    }
  };
  // bomba de tempo real enquanto não está gravando
  const pump = () => { if (!manual) { runTimers(realNow()); flushRAF(realNow()); } realRAF(pump); };
  realRAF(pump);
  const tick = () => { if (!manual) runTimers(realNow()); realSetTimeout(tick, 4); };
  realSetTimeout(tick, 4);

  // ---------- áudio offline ----------
  const SR = 48000;
  const LEN = (window.__CAP_AUDIO_SECONDS || 90) * SR;
  let actx = null, gate = null, rendering = null, audioT0 = 0;
  const RealOAC = window.OfflineAudioContext;
  class CapCtx extends RealOAC {
    constructor() {
      super(2, LEN, SR);
      actx = this;
      gate = super.createGain();
      gate.gain.value = 0;
      gate.connect(super.destination);
    }
    get destination() { return gate; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = CapCtx;
  window.webkitAudioContext = CapCtx;

  const audioSuspend = (t) => RealOAC.prototype.suspend.call(actx, t);
  const audioResume = () => RealOAC.prototype.resume.call(actx);
  let pendingSuspend = null;

  window.__cap = {
    get t() { return vt; },
    hasAudio: () => !!actx,
    /** congela o relógio e começa a renderizar o áudio daqui para frente */
    async begin() {
      vt = realNow();
      manual = true;
      audioT0 = vt;
      if (actx) {
        // tudo que foi agendado antes (cliques do menu etc.) cai no t=0: entra mudo e abre em 0,25 s
        gate.gain.setValueAtTime(0, 0);
        gate.gain.linearRampToValueAtTime(1, 0.25);
        pendingSuspend = new Promise((res) => { audioSuspend(1 / 120).then(res); });
        rendering = actx.startRendering();
        await pendingSuspend;
      }
    },
    /** avança `ms` de tempo virtual em sub-passos, depois roda um quadro (rAF) */
    async step(ms) {
      const target = vt + ms;
      // timers pelo caminho, na ordem
      runTimers(target);
      vt = target;
      flushRAF(vt);
      if (actx) {
        const at = (vt - audioT0) / 1000 + 1 / 120;
        if (at * SR < LEN - 256) {
          const p = new Promise((res) => { audioSuspend(Math.ceil(at * SR / 128) * 128 / SR).then(res); });
          await audioResume();
          await p;
        }
      }
    },
    /** volta ao tempo real (para navegar em menus entre takes) — o áudio para de ser gravado */
    resumeReal() { manual = false; },
    /** termina o áudio e devolve WAV 16-bit em base64 (em pedaços) do trecho gravado */
    async finishAudio() {
      if (!actx) return null;
      const durS = (vt - audioT0) / 1000;
      await audioResume();
      const buf = await rendering;
      const n = Math.min(buf.length, Math.floor(durS * SR));
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const data = new DataView(new ArrayBuffer(44 + n * 4));
      const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
      data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
      data.setUint32(24, SR, true); data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
      w(36, 'data'); data.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      const bytes = new Uint8Array(data.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      window.__capWav = btoa(s);
      return window.__capWav.length;
    },
  };
})();
