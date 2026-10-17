// Áudio 100% sintetizado (WebAudio). "O som é metade da satisfação": clique de dominó que sobe
// na escala a cada peça da corrente, pancada grave nos tombos, explosão com sub-grave, moedas.
// Mix: cada efeito tem posição (pan pela coluna na mesa), entra numa reverb de sala gerada por código
// (IR ruidosa com cauda escura), e por baixo tem um "ambiente" de sala com chiado de vela.
const PENTA = [0, 2, 4, 7, 9];

function noteFreq(semi: number): number { return 261.63 * Math.pow(2, semi / 12); }
function scaleNote(i: number): number {
  const oct = Math.floor(i / PENTA.length);
  return noteFreq(PENTA[i % PENTA.length] + 12 * oct);
}

/** Posições de pan pré-criadas (cada efeito usa a mais próxima de onde aconteceu). */
const PAN_STEPS = [-0.85, -0.45, 0, 0.45, 0.85];
/** Acordes da música (graus em semitons a partir de C4): Am F C G, e o tema sombrio do chefe (Em C D Em). */
const CHORDS = [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]];
const BOSS_CHORDS = [[-8, -5, -1], [-12, -8, -5], [-10, -6, -3], [-8, -5, -1]];

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private verbIn!: GainNode;
  private pans: StereoPannerNode[] = [];
  private musicLP!: BiquadFilterNode;
  private musicOn = false;
  private musicIntensity = 0;
  private nextBeat = 0;
  private beat = 0;
  private heartOn = false;
  private nextHeart = 0;
  private droneG!: GainNode;
  private tension = 0;
  private perc = 0;
  private boss = false;
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
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    // música passa por um filtro que escurece (abre um pouco na simulação)
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 2200; this.musicLP.Q.value = 0.4;
    this.music = c.createGain();
    this.music.connect(this.musicLP).connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // reverb de sala: convolução com uma resposta gerada (ruído com cauda que escurece)
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.42;
    const verb = c.createConvolver(); verb.buffer = this.roomIR(c, 2.6);
    const verbOut = c.createGain(); verbOut.gain.value = 0.85;
    this.sfx.connect(this.verbIn);
    this.verbIn.connect(verb).connect(verbOut).connect(this.master);

    // panoramas fixos para o efeito (a coluna do tabuleiro vai de um lado ao outro)
    this.pans = PAN_STEPS.map((p) => {
      const sp = c.createStereoPanner(); sp.pan.value = p; sp.connect(this.sfx); return sp;
    });

    this.startRoomTone();
    this.startDrone();
    this.applyVolumes();
    setInterval(() => this.scheduleMusic(), 50);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music * 0.5;
  }

  /** Resposta de sala: ruído com pré-atraso e cauda que perde agudos com o tempo. */
  private roomIR(c: AudioContext, dur: number): AudioBuffer {
    const len = Math.floor(c.sampleRate * dur);
    const pre = Math.floor(c.sampleRate * 0.018);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const env = Math.pow(1 - t, 3.2);
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.45 * t);
        d[i] = lp * env * 0.9;
      }
    }
    return buf;
  }

  /** Canal de pan mais próximo de uma posição x do mundo (tabuleiro ~16 m de largura). */
  private panFor(x: number): StereoPannerNode {
    const p = Math.max(-1, Math.min(1, x / 8)) * 0.85;
    let best = this.pans[0];
    for (const sp of this.pans) if (Math.abs(sp.pan.value - p) < Math.abs(best.pan.value - p)) best = sp;
    return best;
  }

  /** Zumbido de sala (ruído marrom grave) + chiado de vela (estalinhos), sempre por baixo de tudo. */
  private startRoomTone() {
    const c = this.ctx!;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = c.createGain(); g.gain.value = 0.16;
    src.connect(lp).connect(g).connect(this.music);
    src.start();
  }

  /** Zumbido grave em camadas (duas serras desafinadas + uma quinta), liga e desliga com a tensão. */
  private startDrone() {
    const c = this.ctx!;
    this.droneG = c.createGain();
    this.droneG.gain.value = this.tension * 0.9;
    this.droneG.connect(this.music);
    for (const [f, det] of [[55, -7], [55.4, 7], [82.5, 0]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0.05;
      o.connect(lp).connect(g).connect(this.droneG);
      o.start();
    }
  }

  /** Tensão (0 = calmo, 1 = cascata correndo): o zumbido sobe e a música ganha peso. */
  setTension(level: number) {
    this.tension = Math.max(0, Math.min(1, level));
    if (this.ctx) this.droneG.gain.setTargetAtTime(this.tension * 0.9, this.ctx.currentTime, 0.6);
  }

  /** Percussão (0–1), ligada pelo combo: chutão nas batidas e chiado de chimbal. */
  setPerc(level: number) { this.perc = Math.max(0, Math.min(1, level)); }

  /** Tema do chefe: outro acorde, um pouco mais rápido. */
  setBoss(on: boolean) { this.boss = on; }

  /** Entrada do chefe: acorde grave de serras com o filtro abrindo, e um baque de tambor. */
  bossStinger() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(220, t + 2.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    lp.connect(g).connect(this.sfx);
    for (const f of [61.7, 82.4, 123.5, 164.8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = 0.12;
      o.connect(og).connect(lp);
      o.start(t); o.stop(t + 2.7);
    }
    this.noise(t, 0.6, 0.6, 'lowpass', 300, 1, this.sfx, 60);
  }

  /**
   * Impacto medido pela física: volume e timbre seguem a velocidade real do choque.
   * Madeira: tóc seco com tom que cai. Ferro (Pesada/Torre): clangor com parciais inarmônicas.
   * Soldadinho: tóc oco e curto.
   */
  impact(speed: number, x = 0, material: 'wood' | 'metal' | 'toy' = 'wood') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.panFor(x);
    const v = Math.max(0.1, Math.min(1, speed / 3.2));
    if (material === 'metal') {
      for (const [f, a] of [[1180, 0.6], [1870, 0.4], [2740, 0.25]]) {
        this.tone('sine', f * (0.97 + Math.random() * 0.06), t, 0.16 * v * a, 0.5 + 0.4 * v, d);
      }
      this.noise(t, 0.04, 0.3 * v, 'highpass', 4000, 1, d);
    } else if (material === 'toy') {
      this.tone('triangle', 420 + Math.random() * 120, t, 0.2 * v, 0.09, d, 260);
      this.noise(t, 0.03, 0.2 * v, 'bandpass', 1800, 2, d);
    } else {
      this.noise(t, 0.035, 0.45 * v, 'bandpass', 1400 + Math.random() * 600, 3, d);
      this.tone('sine', 220 + Math.random() * 60, t, 0.14 * v, 0.07, d, 150);
    }
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

  /** Clique de dominó; `chain` sobe a nota na escala pentatônica; `x` é a posição na mesa (pan). */
  clack(chain: number, vol = 1, x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastClick < 0.012) return;
    this.lastClick = t;
    const d = this.panFor(x);
    const f = scaleNote(Math.min(chain, 22) + 5);
    this.noise(t, 0.05, 0.5 * vol, 'bandpass', 2400 + Math.random() * 800, 2.5, d);
    this.tone('triangle', f, t, 0.22 * vol, 0.16, d);
    this.tone('sine', f * 2, t, 0.06 * vol, 0.09, d);
  }

  place(i: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.03, 0.25, 'bandpass', 3200, 3, this.sfx);
    this.tone('sine', scaleNote((i % 10) + 3), t, 0.06, 0.06, this.sfx);
  }

  knock(combo: number, big: boolean, x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.panFor(x);
    this.tone('sine', big ? 120 : 190, t, big ? 0.7 : 0.5, big ? 0.35 : 0.2, d, big ? 45 : 70);
    this.noise(t, 0.12, 0.45, 'lowpass', 1800, 1, d, 300);
    // "boing" cartunesco que sobe com o combo
    const f = scaleNote(Math.min(combo, 14) + 7);
    this.tone('square', f, t + 0.02, 0.05, 0.12, d, f * 1.5);
    this.tone('triangle', f * 1.5, t + 0.07, 0.12, 0.2, d);
  }

  clang() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [523, 1187, 1730, 2310]) this.tone('sine', f, t, 0.08, 0.5, this.sfx);
    this.noise(t, 0.06, 0.3, 'highpass', 3000, 1, this.sfx);
  }

  boom(x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 110, t, 1.0, 0.9, this.sfx, 28);
    this.noise(t, 1.1, 0.9, 'lowpass', 2400, 0.7, this.sfx, 120);
    this.noise(t, 0.25, 0.5, 'bandpass', 900, 1, this.panFor(x));
    // a música abaixa por um instante (a explosão "ocupa" o mix)
    const g = this.music.gain, base = this.volumes.music * 0.5;
    g.cancelScheduledValues(t);
    g.setValueAtTime(base, t);
    g.linearRampToValueAtTime(base * 0.35, t + 0.03);
    g.linearRampToValueAtTime(base, t + 1.1);
  }

  alarm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('square', 880, t, 0.05, 0.08, this.sfx, 1500);
    this.tone('square', 1100, t + 0.07, 0.04, 0.08, this.sfx, 1800);
  }

  /** Carta deslizando (compra/descarte): estalo curto de papel. */
  card(delay = 0, soft = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    this.noise(t, 0.05, soft ? 0.14 : 0.24, 'bandpass', 2600 + Math.random() * 1400, 1.4, this.sfx);
    this.noise(t + 0.012, 0.09, soft ? 0.06 : 0.1, 'lowpass', 900, 0.8, this.sfx);
  }

  /** Sininho de balcão. */
  ding() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, k] of [[1760, 0.18], [2637, 0.08], [3520, 0.04]] as const) this.tone('sine', f, t, k, 1.2, this.sfx);
  }

  /** Carrilhão místico (bênção do altar). */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone('sine', noteFreq(s + 12), t + i * 0.07, 0.09, 1.4, this.sfx));
    this.noise(t, 1.2, 0.08, 'highpass', 7000, 1, this.sfx);
  }

  /** Peça quebrando na bigorna. */
  crunch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.25, 0.7, 'bandpass', 1800, 0.8, this.sfx, 400);
    for (let i = 0; i < 7; i++) this.noise(t + 0.03 + Math.random() * 0.25, 0.04, 0.25, 'bandpass', 2500 + Math.random() * 2500, 2, this.sfx);
    this.tone('sine', 140, t, 0.5, 0.25, this.sfx, 60);
  }

  /** Prensa descendo e batendo: ferro contra ferro. */
  stamp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 90, t, 0.9, 0.5, this.sfx, 40);
    this.noise(t, 0.3, 0.6, 'lowpass', 1200, 0.8, this.sfx, 200);
    for (const f of [420, 980, 1460]) this.tone('triangle', f, t, 0.07, 0.6, this.sfx);
  }

  /** Embaralhar: rajada de estalos de papel. */
  shuffle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 16; i++) this.noise(t + i * 0.026 + Math.random() * 0.01, 0.03, 0.16, 'bandpass', 2400 + Math.random() * 2200, 1.8, this.sfx);
    this.noise(t + 0.43, 0.08, 0.22, 'lowpass', 700, 0.8, this.sfx);
  }

  /** Peça pegando fogo na tocha: "fuuush" de chama + estalinhos de madeira queimando. */
  ignite(x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.6, 0.5, 'bandpass', 400, 1.2, this.panFor(x), 1600);
    this.noise(t, 0.9, 0.25, 'lowpass', 700, 0.7, this.sfx, 200);
    for (let i = 0; i < 6; i++) this.noise(t + 0.08 + Math.random() * 0.6, 0.03, 0.18, 'bandpass', 2000 + Math.random() * 2500, 2, this.sfx);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.45, 0.35, 'bandpass', 600, 4, this.sfx, 3500);
  }

  /** A mão pousando na mesa: baque grave e abafado. */
  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone('sine', 72, t, 0.9, 0.6, this.sfx, 30);
    this.noise(t, 0.4, 0.6, 'lowpass', 500, 0.7, this.sfx, 90);
  }

  /** A mão varrendo a mesa: arrasto de pele na madeira + chocalho de peças. */
  scrape(dur = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, dur, 0.4, 'bandpass', 260, 1.2, this.sfx, 900);
    this.noise(t + 0.05, dur * 0.9, 0.18, 'highpass', 2600, 0.8, this.sfx);
    for (let i = 0; i < 9; i++) {
      const ti = t + 0.08 + Math.random() * dur * 0.85;
      this.noise(ti, 0.04, 0.3, 'bandpass', 2200 + Math.random() * 1600, 2.5, this.sfx);
    }
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

  /** Batida do coração (tensão antes do disparo). Liga/desliga; o ritmo fica no agendador. */
  setHeartbeat(on: boolean) { this.heartOn = on; if (on) this.nextHeart = 0; }

  // ---------- música generativa (calma no plano, cresce na simulação) ----------
  setMusic(on: boolean, intensity = 0) {
    this.musicOn = on;
    this.musicIntensity = intensity;
    if (this.musicLP && this.ctx) this.musicLP.frequency.setTargetAtTime(1900 + intensity * 2400, this.ctx.currentTime, 0.4);
  }

  private heartbeat(t: number) {
    // duas pancadas graves e curtas (lub-dub), abafadas
    this.tone('sine', 62, t, 0.5, 0.22, this.sfx, 34);
    this.tone('sine', 56, t + 0.19, 0.3, 0.16, this.sfx, 30);
  }

  private scheduleMusic() {
    if (!this.ctx || !this.musicOn) return;
    const c = this.ctx;
    const spb = 60 / (92 + this.musicIntensity * 28 + (this.boss ? 14 : 0)) / 2; // colcheias
    if (this.nextBeat < c.currentTime) this.nextBeat = c.currentTime + 0.05;
    const chords = this.boss ? BOSS_CHORDS : CHORDS;
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
      // percussão do combo: chutão nas batidas fortes e chimbal nas fracas
      if (this.perc > 0.05) {
        if (step % 4 === 0) this.tone('sine', 62, t, 0.42 * this.perc, 0.2, this.music, 38);
        if (step % 2 === 1) this.noise(t, 0.025, 0.09 * this.perc, 'highpass', 7500, 1, this.music);
      }
      this.nextBeat += spb;
      this.beat++;
    }
    // chiado de vela: estalinhos esparsos no ambiente
    if (Math.random() < 0.22) {
      const t = c.currentTime + 0.02 + Math.random() * 0.15;
      this.noise(t, 0.012 + Math.random() * 0.02, 0.05 + Math.random() * 0.05, 'highpass', 2500 + Math.random() * 4000, 2, this.music);
    }
    // coração: sincronizado no relógio do áudio (não atrasa com o tempo do jogo)
    if (this.heartOn) {
      if (this.nextHeart < c.currentTime) this.nextHeart = c.currentTime + 0.05;
      while (this.nextHeart < c.currentTime + 0.2) { this.heartbeat(this.nextHeart); this.nextHeart += 0.95; }
    }
  }
}

export const audio = new Audio();
