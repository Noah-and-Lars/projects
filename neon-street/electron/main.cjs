// Electron shell for Neon Street: a launcher window, then the game served
// from the built `dist/` folder over a private app:// scheme (fetch and
// WebGPU both need a secure, non-file origin).
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(1);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);

// GPU switches must be set before the app is ready, so a "no vsync" choice
// in the launcher relaunches the app with --nosync.
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
if (has('nosync')) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
if (has('smoke')) {
  // Headless self-test on a machine without a GPU (software WebGPU).
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('use-vulkan', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROOTS = {
  game: path.join(__dirname, '..', 'dist'),
  launcher: __dirname,
};

function serve(request) {
  const url = new URL(request.url);
  const root = ROOTS[url.host];
  if (!root) return new Response('not found', { status: 404 });
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    show: false,
    title: 'Neon Street',
    backgroundColor: '#05050a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F10') { showLauncher(); event.preventDefault(); }
  });
  win.on('closed', () => { win = null; });
}

function showLauncher() {
  if (win.isFullScreen()) win.setFullScreen(false);
  win.loadURL('app://launcher/launcher.html');
}

function launchGame(opts) {
  const query = opts.query || '';
  if (opts.width && opts.height && !opts.fullscreen) {
    win.setFullScreen(false);
    win.setContentSize(opts.width, opts.height);
    win.center();
  }
  if (opts.fullscreen) win.setFullScreen(true);
  win.loadURL(`app://game/index.html${query ? '?' + query : ''}`);
}

app.whenReady().then(() => {
  protocol.handle('app', serve);
  createWindow();

  const direct = flag('launch');
  if (direct !== undefined) launchGame({ query: direct, fullscreen: !has('windowed') });
  else showLauncher();

  if (has('smoke')) {
    const seconds = Number(flag('smoke-seconds') || 40);
    const errors = [];
    win.webContents.on('console-message', (_e, level, message) => {
      // The CSP warning is dev-only noise (it is not shown once packaged).
      if (level >= 2 && !message.includes('Electron Security Warning')) errors.push(message);
      console.log(`[renderer] ${message.slice(0, 400)}`);
    });
    setTimeout(async () => {
      try {
        const state = await win.webContents.executeJavaScript('JSON.stringify(window.__neon ? window.__neon.inspect() : {noGame:true})');
        console.log(`[smoke] ${state.slice(0, 300)}`);
        const out = flag('smoke-out');
        if (out) {
          const image = await win.webContents.capturePage();
          require('fs').writeFileSync(out, image.toPNG());
          console.log(`[smoke] wrote ${out}`);
        }
      } catch (e) { console.log(`[smoke] inspect failed: ${e.message}`); }
      console.log(`[smoke] errors: ${errors.length}`);
      app.exit(errors.length ? 1 : 0);
    }, seconds * 1000);
  }
});

ipcMain.handle('neon:launch', (_e, opts) => {
  const wantNosync = !!opts.nosync;
  if (wantNosync !== has('nosync')) {
    // Relaunch with the matching GPU switches, straight into the game.
    const keep = args.filter((a) => a !== '--nosync' && !a.startsWith('--launch=') && a !== '--windowed');
    const extra = [`--launch=${opts.query || ''}`];
    if (wantNosync) extra.push('--nosync');
    if (!opts.fullscreen) extra.push('--windowed');
    app.relaunch({ args: [...keep, ...extra] });
    app.exit(0);
    return;
  }
  launchGame(opts);
});
ipcMain.handle('neon:fullscreen', (_e, on) => { win.setFullScreen(on ?? !win.isFullScreen()); return win.isFullScreen(); });
ipcMain.handle('neon:launcher', () => showLauncher());
ipcMain.handle('neon:quit', () => app.quit());
ipcMain.handle('neon:info', () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, nosync: has('nosync') }));

app.on('window-all-closed', () => app.quit());
