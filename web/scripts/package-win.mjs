// Empacota o build (dist/) + electron/ num DOMINOTION.exe autossuficiente e gera o zip para a Steam.
// Uso: npm run dist:win  →  release/DOMINOTION-win32-x64/ (pasta do jogo) e release/DOMINOTION-win32-x64.zip
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'release');
if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('rode "npm run build" antes');

// só entram no app o package.json, electron/ e dist/ (o jogo não tem dependências em runtime fora do bundle)
const keep = /^\/(package\.json|electron(\/.*)?|dist(\/.*)?)?$/;
const [dir] = await packager({
  dir: root,
  out,
  name: 'DOMINOTION',
  executableName: 'DOMINOTION',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: true,
  prune: false,
  ignore: (p) => p !== '' && !keep.test(p.replace(/\\/g, '/')),
  win32metadata: { ProductName: 'DOMINOTION', FileDescription: 'DOMINOTION', CompanyName: 'Gamonga' },
});

const zip = `${dir}.zip`;
rmSync(zip, { force: true });
// zip com os arquivos direto na raiz (DOMINOTION.exe na raiz, sem "./" na frente: o tar do Windows grava assim e o
// Explorer cria uma pasta "." ao extrair). Feito pelo .NET do próprio Windows, que não põe o diretório base.
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${dir}', '${zip}', 'Optimal', $false)`,
], { stdio: 'inherit' });
console.log(`\npasta: ${dir}\nzip:   ${zip}\nNa Steam: suba o conteúdo e configure o launch como DOMINOTION.exe`);
