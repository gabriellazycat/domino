// Monta os vídeos finais a partir das tomadas brutas (raw/) com ffmpeg.
// node e2e/trailer/build.mjs youtube|reels|gif|all
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { here, RAW, FFMPEG } from './lib.mjs';

const OUT = path.resolve(here, '..', '..', '..', process.env.OUT_DIR ?? 'marketing');
mkdirSync(OUT, { recursive: true });
const OV = path.join(here, process.env.OVL ?? 'overlays');
const raw = (n, ext = 'mp4') => path.join(RAW, `${n}.${ext}`);

/**
 * seg: { src, in, dur (segundos de SAÍDA), speed=1, rev=false, gain=1 (som), blur, dark, zoom }
 * cap: { png, at, dur } — tempos na linha do tempo final
 */
function render(name, { w, h, fps = 60, segs, caps = [], music, musicGain = 1, sfxGain = 1, fadeOut = 0.8, crf = 18, extra = [], gif = null }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const f = [];
  let n = 0;
  const vlabels = [], alabels = [];
  let t = 0;
  for (const s of segs) {
    const speed = s.speed ?? 1;
    const srcDur = s.dur * speed;
    const a = s.rev ? s.in - srcDur : s.in;
    args.push('-ss', a.toFixed(3), '-t', srcDur.toFixed(3), '-i', raw(s.src));
    const vi = n++;
    const hasAudio = existsSync(raw(s.src, 'wav')) && s.gain !== 0;
    let ai = -1;
    if (hasAudio) { args.push('-ss', a.toFixed(3), '-t', srcDur.toFixed(3), '-i', raw(s.src, 'wav')); ai = n++; }
    let v = `[${vi}:v]`;
    const vf = [];
    vf.push(`setpts=(PTS-STARTPTS)/${speed}`, `fps=${fps}`);
    if (s.rev) vf.push('reverse', `setpts=N/(${fps}*TB)`);
    if (s.zoom) vf.push(`scale=iw*${s.zoom}:-1,crop=${w}:${h}`);
    if (s.vcrop !== undefined) vf.push(`crop=ih*${w}/${h}:ih:(iw-ih*${w}/${h})*${s.vcrop}:0`);
    vf.push(`scale=${w}:${h}:flags=lanczos`, 'setsar=1');
    if (s.blur) vf.push(`gblur=sigma=${s.blur}`);
    if (s.dark) vf.push(`eq=brightness=${-s.dark * 0.25}:saturation=${1 - s.dark * 0.4}`);
    vf.push(`trim=duration=${s.dur.toFixed(3)}`, 'setpts=PTS-STARTPTS');
    f.push(`${v}${vf.join(',')}[v${vlabels.length}]`);
    vlabels.push(`[v${vlabels.length}]`);
    if (ai >= 0) {
      const af = [];
      if (s.rev) af.push('areverse');
      if (speed !== 1) af.push(`asetrate=48000*${1 / speed},aresample=48000`);
      af.push(`volume=${(s.gain ?? 1) * sfxGain}`, `apad`, `atrim=duration=${s.dur.toFixed(3)}`, 'asetpts=PTS-STARTPTS');
      f.push(`[${ai}:a]${af.join(',')}[a${alabels.length}]`);
    } else {
      f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${s.dur.toFixed(3)}[a${alabels.length}]`);
    }
    alabels.push(`[a${alabels.length}]`);
    t += s.dur;
  }
  const total = t;
  f.push(`${vlabels.map((v, i) => v + alabels[i]).join('')}concat=n=${segs.length}:v=1:a=1[vc][ac]`);
  // legendas
  let base = '[vc]';
  caps.forEach((c, i) => {
    args.push('-loop', '1', '-t', c.dur.toFixed(3), '-i', path.join(OV, c.png + '.png'));
    const ci = n++;
    const fi = Math.min(0.22, c.dur / 4), fo = Math.min(0.3, c.dur / 4);
    f.push(`[${ci}:v]format=rgba,fade=in:st=0:d=${fi}:alpha=1,fade=out:st=${(c.dur - fo).toFixed(3)}:d=${fo}:alpha=1,setpts=PTS-STARTPTS+${c.at}/TB[c${i}]`);
    f.push(`${base}[c${i}]overlay=eof_action=pass:format=auto[o${i}]`);
    base = `[o${i}]`;
  });
  f.push(`${base}${fadeOut ? `fade=out:st=${(total - fadeOut).toFixed(3)}:d=${fadeOut},` : ''}format=yuv420p[vout]`);
  // som: efeitos + trilha
  if (music) {
    args.push('-ss', String(music.in ?? 0), '-t', total.toFixed(3), '-i', raw(music.src, 'wav'));
    const mi = n++;
    f.push(`[${mi}:a]volume=${musicGain},apad,atrim=duration=${total.toFixed(3)}[mus]`);
    f.push(`[ac][mus]amix=inputs=2:normalize=0[mix]`);
  } else f.push(`[ac]anull[mix]`);
  f.push(`[mix]afade=t=out:st=${(total - fadeOut - 0.3).toFixed(3)}:d=${fadeOut + 0.3},afade=t=in:d=0.05,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
  const graph = path.join(here, 'review', name + '.graph.txt');
  writeFileSync(graph, f.join(';\n'));
  const out = path.join(OUT, name + '.mp4');
  args.push('-/filter_complex', graph, '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-maxrate', '40M', '-bufsize', '80M', '-profile:v', 'high', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', ...extra, out);
  console.log(`== ${name}: ${segs.length} cortes, ${total.toFixed(2)}s`);
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg falhou: ' + name);
  if (gif) {
    const g = path.join(OUT, name + '.gif');
    const vf = `hqdn3d=8:6:10:8,fps=${gif.fps},scale=${gif.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${gif.colors ?? 88}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=${gif.bayer ?? 5}:diff_mode=rectangle`;
    const r2 = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', out, '-filter_complex', vf, '-loop', '0', g], { stdio: 'inherit' });
    if (r2.status !== 0) throw new Error('gif falhou: ' + name);
    // MP4 leve do mesmo trecho (Twitter/Reddit/Discord), sem som — em loop nas redes
    const small = path.join(OUT, name + '.tmp.mp4');
    spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', out, '-vf', 'scale=1280:-2:flags=lanczos', '-c:v', 'libx264', '-crf', '21', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', small], { stdio: 'inherit' });
    renameSync(small, out);
  }
  return out;
}

export { render, OUT };

const { EDL } = await import(process.env.EDL ?? './edl.mjs');
const which = process.argv.slice(2);
for (const [name, spec] of Object.entries(EDL)) {
  if (which.length && !which.includes(name) && !which.includes('all')) continue;
  render(name, spec);
}
