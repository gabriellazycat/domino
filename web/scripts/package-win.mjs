// Empacota o build (dist/) + electron/ num TOPPLE.exe autossuficiente e gera o zip para a Steam.
// Uso: npm run dist:win  →  release/TOPPLE-win32-x64/ (pasta do jogo) e release/TOPPLE-win32-x64.zip
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
  name: 'TOPPLE',
  executableName: 'TOPPLE',
  platform: 'win32',
  arch: 'x64',
  overwrite: true,
  asar: true,
  prune: false,
  ignore: (p) => p !== '' && !keep.test(p.replace(/\\/g, '/')),
  win32metadata: { ProductName: 'TOPPLE', FileDescription: 'TOPPLE', CompanyName: 'Gamonga' },
});

const zip = `${dir}.zip`;
rmSync(zip, { force: true });
// tar do Windows 10+ (bsdtar) gera .zip com -a; o zip contém o conteúdo da pasta (TOPPLE.exe na raiz)
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); // não o tar do Git Bash
execFileSync(tar,['-a', '-c', '-f', zip, '-C', dir, '.'], { stdio: 'inherit' });
console.log(`\npasta: ${dir}\nzip:   ${zip}\nNa Steam: suba o conteúdo e configure o launch como TOPPLE.exe`);
