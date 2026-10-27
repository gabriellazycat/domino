// Trailer v4 (YouTube, pasta "marketing 4"): corta as tomadas brutas em um clipe por cena para a
// composição HyperFrames em "marketing 4/composition" e grava a tabela de cenas (scenes.json).
// node e2e/trailer/trailer4.mjs            → clipes + quadros congelados + scenes.json
// node e2e/trailer/trailer4.mjs arc        → imprime o ARC da trilha (takes.mjs music) para esta montagem
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { here, FFMPEG } from './lib.mjs';

export const COMP = path.resolve(here, '..', '..', '..', 'marketing 4', 'composition');
const RAW = { r3: path.join(here, 'raw3'), r4: path.join(here, 'raw4') };

// Cena: { id, src, raw, in (s na tomada), dur (s de SAÍDA tocando), speed, gain (som da tomada), freeze (s parado no último quadro) }
const S = (id, src, inn, dur, o = {}) => ({ id, src, raw: 'r3', in: inn, dur, speed: 1, gain: 1, freeze: 0, ...o });
export const SCENES = [
  S('faces', 'hero-front', 9.15, 2.1, { speed: 0.5 }),          // gancho: rostos dos dominós em pânico
  S('kaboom', 'hero-front', 10.2, 1.2, { speed: 0.5 }),         // a Explosiva acerta o General (flash em +0.4)
  S('sweep', 'sweep', 0.0, 2.7),                                // a mão do Dono varre a mesa
  S('ident', 'sweep', 3.2, 2.0, { gain: 0.3 }),                 // mesa vazia sob o título
  S('plan', 'draw', 0.6, 3.0),                                  // 01 o cursor traça a trilha
  S('build', 'hero-wide', 0.8, 1.5, { speed: 1.45 }),           // montagem relâmpago da corrente herói
  S('push', 'draw', 3.9, 1.5),                                  // 02 o cursor aperta FIRE!
  S('wave', 'hero-game', 4.0, 4.5),                             // 03 a câmera do jogo persegue a onda
  S('trick', 'hero-cine', 4.8, 1.5),                            // a Torre cai rumo à trifurcação
  S('trifork', 'hero-cine', 6.3, 0.4, { freeze: 1.6 }),
  S('hopper', 'hero-cine', 6.7, 0.7, { freeze: 1.8 }),
  S('rocket', 'runner', 1.5, 0.8, { freeze: 1.7 }),
  S('blast', 'hero-cine', 9.95, 0.4, { freeze: 1.6 }),
  S('boom', 'hero-cine', 10.35, 1.5, { speed: 0.5 }),           // descongela na explosão
  S('ogre', 'enemies', 2.6, 3.0),
  S('general', 'hero-front', 4.2, 2.5),
  S('shop', 'ev-shop', 0.5, 3.0, { gain: 0.5 }),
  S('press', 'ev-press', 0.5, 3.0, { raw: 'r4', gain: 0.5 }),
  S('altar', 'ev-mystic', 0.5, 3.0, { gain: 0.5 }),
  S('gift', 'ev-curse', 0.5, 3.0, { raw: 'r4', gain: 0.5 }),
  S('c1', 'enemies', 7.0, 1.5),                                 // clímax: vários ângulos no tempo da música
  S('c2', 'hero-wide', 6.5, 1.5, { speed: 2 }),
  S('c3', 'hero-game', 10.2, 1.5, { speed: 0.5 }),
  S('c4', 'hero-game', 12.3, 2.5),
  S('end', 'hero-wide', 13.4, 7.0, { speed: 0.5, gain: 0.25 }), // fundo da tela final
];
let t = 0;
for (const s of SCENES) { s.start = +t.toFixed(3); t += s.dur + s.freeze; s.end = +t.toFixed(3); }
export const TOTAL = +t.toFixed(3);

// Intensidade da trilha (perc, tensão) por trecho, nos tempos desta montagem.
export function arc() {
  const at = (id) => SCENES.find((s) => s.id === id).start;
  return [
    [0, 0.8, 1, 0], [at('kaboom'), 0, 0.7, 0], [at('sweep'), 0, 0.3, 0], [at('plan'), 0.4, 0.5, 0],
    [at('push'), 0.6, 0.7, 0], [at('wave'), 1, 0.9, 0], [at('trick'), 0.7, 0.7, 0], [at('ogre'), 1, 1, 0],
    [at('shop'), 0, 0.45, 0], [at('c1'), 1, 1, 0], [at('c4'), 0.5, 0.8, 0], [at('end'), 0, 0.3, 0],
  ].map((k) => k.map((v) => +v.toFixed(2)));
}

function ff(args) {
  const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg falhou: ' + args.join(' '));
}

function cut(s) {
  const raw = RAW[s.raw];
  const mp4 = path.join(raw, s.src + '.mp4'), wav = path.join(raw, s.src + '.wav');
  const srcDur = s.dur * s.speed;
  const out = path.join(COMP, 'assets', 'shots', s.id + '.mp4');
  const args = ['-ss', s.in.toFixed(3), '-t', srcDur.toFixed(3), '-i', mp4];
  const hasWav = existsSync(wav) && s.gain > 0;
  if (hasWav) args.push('-ss', s.in.toFixed(3), '-t', srcDur.toFixed(3), '-i', wav);
  const vf = [`setpts=(PTS-STARTPTS)/${s.speed}`, 'fps=60', 'scale=1920:1080:flags=lanczos', 'setsar=1', `trim=duration=${s.dur.toFixed(3)}`, 'setpts=PTS-STARTPTS', 'format=yuv420p'];
  args.push('-filter_complex', `[0:v]${vf.join(',')}[v]` + (hasWav
    ? `;[1:a]${s.speed !== 1 ? `asetrate=48000*${s.speed},aresample=48000,` : ''}volume=${s.gain},apad,atrim=duration=${s.dur.toFixed(3)},asetpts=PTS-STARTPTS[a]`
    : `;anullsrc=r=48000:cl=stereo,atrim=duration=${s.dur.toFixed(3)}[a]`));
  args.push('-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-g', '30', '-r', '60',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out);
  ff(args);
  if (s.freeze) {
    // quadro seguinte ao último tocado: a imagem parada continua exatamente de onde o clipe parou
    ff(['-ss', (s.in + srcDur).toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '2', path.join(COMP, 'assets', 'stills', s.id + '.jpg')]);
  }
  console.log(`  ${s.id.padEnd(8)} ${s.start.toFixed(2).padStart(6)} → ${s.end.toFixed(2).padStart(6)}  ${s.src}@${s.in}${s.speed !== 1 ? ` ×${s.speed}` : ''}${s.freeze ? ` +${s.freeze}s parado` : ''}`);
}

const cmd = process.argv[2] ?? 'shots';
if (cmd === 'arc') {
  console.log(JSON.stringify(arc()));
} else if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  for (const d of ['shots', 'stills']) mkdirSync(path.join(COMP, 'assets', d), { recursive: true });
  const only = process.argv.slice(3);
  for (const s of SCENES) if (!only.length || only.includes(s.id)) cut(s);
  // a trilha sai do jogo ~13 dB abaixo dos efeitos (pico −14 dBFS): sobe para ficar no nível das tomadas
  mkdirSync(path.join(COMP, 'assets', 'music'), { recursive: true });
  if (!only.length || only.includes('music')) ff(['-i', path.join(RAW.r4, 'music-yt4.wav'), '-af', 'volume=13dB', '-c:a', 'pcm_s16le', path.join(COMP, 'assets', 'music', 'music-yt4.wav')]);
  writeFileSync(path.join(COMP, 'scenes.json'), JSON.stringify({ total: TOTAL, scenes: SCENES }, null, 1));
  console.log(`total ${TOTAL}s`);
}
