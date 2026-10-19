// DOMINOTION desktop: abre o build do Vite (dist/) numa janela própria, sem precisar de Node nem navegador.
// O jogo é servido pelo protocolo app:// (origem fixa: módulos ES funcionam e o save no localStorage persiste).
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Os saves ficam na pasta de dados do app. Ela continua sendo %APPDATA%\TOPPLE (nome de antes do rename), para o save não sumir.
app.setPath('userData', path.join(app.getPath('appData'), 'TOPPLE'));

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: true,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    title: 'DOMINOTION',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  // F11 / Alt+Enter alternam tela cheia
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  // links externos abrem no navegador do sistema, nunca dentro do jogo
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  // a origem app://topple é fixa de propósito: é ela que guarda o localStorage (saves). Não trocar sem migrar.
  win.loadURL('app://topple/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
