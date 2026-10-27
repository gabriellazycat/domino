// Gera os 4 capsules da Steam a partir da arte 5g. uso: node build-steam.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve(import.meta.dirname, '../steam');
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ['steam-header-capsule-920x430.png', 920, 430, 'v=gh&vw=1232&vh=576'],
  ['steam-small-capsule-462x174.png', 462, 174, 'v=gs&vw=924&vh=348'],
  ['steam-main-capsule-1232x706.png', 1232, 706, 'v=g'],
  ['steam-vertical-capsule-748x896.png', 748, 896, 'v=gv'],
];
for (const [name, w, h, q] of jobs) {
  execFileSync('node', [path.join(import.meta.dirname, 'src/render.mjs'), 'spiral', String(w), String(h), path.join(out, name), q], { stdio: 'inherit' });
}
