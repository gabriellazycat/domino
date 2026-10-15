// Áudio 100% sintetizado (WebAudio). "O som é metade da satisfação": clique de dominó que sobe
// na escala a cada peça da corrente, pancada grave nos tombos, explosão com sub-grave, moedas.
const PENTA = [0, 2, 4, 7, 9];

function noteFreq(semi: number): number { return 261.63 * Math.pow(2, semi / 12); }
function scaleNote(i: number): number {
  const oct = Math.floor(i / PENTA.length);
  return noteFreq(PENTA[i % PENTA.length] + 12 * oct);
}

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicOn = false;
  private musicIntensity = 0;
  private nextBeat = 0;
  private beat = 0;
  volumes = { master: 0.8, sfx: 0.9, music: 0.45 };
  private lastClick = 0;

  /** Precisa de gesto do usuário (política dos navegadores). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    setInterval(() => this.scheduleMusic(), 50);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music * 0.5;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(type: OscillatorType, f: number, t: number, peak: number, dec: number, dest: AudioNode, glideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dec);
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dec);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dec + 0.05);
  }

  private noise(t: number, dur: number, peak: number, filt: BiquadFilterType, f: number, q: number, dest: AudioNode, fTo?: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = filt; bp.frequency.setValueAtTime(f, t); bp.Q.value = q;
    if (fTo) bp.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.003, peak, dur);
    s.connect(bp).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  /** Clique de dominó; `chain` sobe a nota na escala pentatônica. */
  clack(chain: number, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastClick < 0.012) return;
    this.lastClick = t;
    const f = scaleNote(Math.min(chain, 22) + 5);
    this.noise(t, 0.05, 0.5 * vol, 'bandpass', 2400 + Math.random() * 800, 2.5, this.sfx);
    this.tone('triangle', f, t, 0.22 * vol, 0.16, this.sfx);
    this.tone('sine', f * 2, t, 0.06 * vol, 0.09, this.sfx);
  }

  place(i: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.03, 0.25, 'bandpass', 3200, 3, this.sfx);
    this.tone('sine', scaleNote((i % 10) + 3), t, 0.06, 0.06, this.sfx);
  }

  knock(combo: number, big: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', big ? 120 : 190, t, big ? 0.7 : 0.5, big ? 0.35 : 0.2, this.sfx, big ? 45 : 70);
    this.noise(t, 0.12, 0.45, 'lowpass', 1800, 1, this.sfx, 300);
    // "boing" cartunesco que sobe com o combo
    const f = scaleNote(Math.min(combo, 14) + 7);
    this.tone('square', f, t + 0.02, 0.05, 0.12, this.sfx, f * 1.5);
    this.tone('triangle', f * 1.5, t + 0.07, 0.12, 0.2, this.sfx);
  }

  clang() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [523, 1187, 1730, 2310]) this.tone('sine', f, t, 0.08, 0.5, this.sfx);
    this.noise(t, 0.06, 0.3, 'highpass', 3000, 1, this.sfx);
  }

  boom() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 110, t, 1.0, 0.9, this.sfx, 28);
    this.noise(t, 1.1, 0.9, 'lowpass', 2400, 0.7, this.sfx, 120);
    this.noise(t, 0.25, 0.5, 'bandpass', 900, 1, this.sfx);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.45, 0.35, 'bandpass', 600, 4, this.sfx, 3500);
  }

  coin(i = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + i * 0.06;
    this.tone('square', 987.8, t, 0.06, 0.07, this.sfx);
    this.tone('square', 1318.5, t + 0.06, 0.06, 0.2, this.sfx);
  }

  ui(kind: 'hover' | 'click' | 'deny' | 'pick' = 'click') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'hover') this.tone('sine', 1400, t, 0.03, 0.04, this.sfx);
    else if (kind === 'click') { this.tone('triangle', 660, t, 0.12, 0.08, this.sfx); this.noise(t, 0.02, 0.15, 'highpass', 4000, 1, this.sfx); }
    else if (kind === 'deny') { this.tone('square', 180, t, 0.08, 0.15, this.sfx, 120); }
    else { [0, 4, 7].forEach((s, i) => this.tone('triangle', noteFreq(s + 12), t + i * 0.05, 0.12, 0.25, this.sfx)); }
  }

  fire() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sawtooth', 220, t, 0.12, 0.3, this.sfx, 660);
    this.noise(t, 0.2, 0.2, 'bandpass', 1500, 2, this.sfx, 4000);
  }

  win() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => {
      this.tone('triangle', noteFreq(s), t + i * 0.075, 0.2, 0.45, this.sfx);
      this.tone('sine', noteFreq(s + 12), t + i * 0.075, 0.06, 0.3, this.sfx);
    });
    this.noise(t + 0.5, 0.8, 0.15, 'highpass', 6000, 1, this.sfx);
  }

  lose() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [7, 6, 5, 0].forEach((s, i) => this.tone('triangle', noteFreq(s - 5), t + i * 0.22, 0.18, i === 3 ? 0.8 : 0.25, this.sfx));
  }

  stars(n: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('triangle', noteFreq(12 + n * 4), t, 0.18, 0.4, this.sfx);
    this.tone('sine', noteFreq(24 + n * 4), t, 0.08, 0.6, this.sfx);
  }

  // ---------- música generativa (calma no plano, cresce na simulação) ----------
  setMusic(on: boolean, intensity = 0) {
    this.musicOn = on;
    this.musicIntensity = intensity;
  }

  private scheduleMusic() {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    const spb = 60 / (92 + this.musicIntensity * 28) / 2; // colcheias
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    const chords = [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]]; // Am F C G
    while (this.nextBeat < c.currentTime + 0.2) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % 4;
      const ch = chords[bar];
      const step = this.beat % 8;
      if (step === 0) {
        // baixo + pad suave
        this.tone('sine', noteFreq(ch[0] - 24), t, 0.22, spb * 7, this.music);
        for (const s of ch) this.tone('triangle', noteFreq(s - 12), t, 0.025, spb * 7.5, this.music);
      }
      // marimba arpejada
      const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
      const note = ch[pattern[step]] + (step >= 4 ? 12 : 0);
      if (step % 2 === 0 || this.musicIntensity > 0.3) this.tone('sine', noteFreq(note), t, 0.07, 0.35, this.music);
      if (this.musicIntensity > 0.3 && step % 2 === 1) this.noise(t, 0.03, 0.06 * this.musicIntensity, 'highpass', 7000, 1, this.music);
      if (this.musicIntensity > 0.6 && step % 4 === 0) this.tone('sine', 70, t, 0.25, 0.18, this.music, 40);
      this.nextBeat += spb;
      this.beat++;
    }
  }
}

export const audio = new Audio();
