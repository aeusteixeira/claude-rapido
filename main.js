// Claude Rápido: uma barra flutuante que fica rodando em segundo plano. O atalho global
// chama `claude-rapido`, que reabre este app; a segunda instância só pede pra janela
// aparecer — por isso abre na hora depois da primeira vez.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// No Wayland a janela não escolhe a própria posição nem pode pegar o foco sozinha;
// pelo XWayland ela aparece centralizada e já com o cursor no campo
if (process.platform === 'linux' && !process.argv.some((a) => a.startsWith('--ozone-platform'))) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] });
  app.exit(0);
  return;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const ROOT = process.env.PROJETOS_ROOT || path.join(os.homedir(), 'Documentos', 'Projetos');
const STATE_DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'claude-rapido');
const HISTORY = path.join(STATE_DIR, 'historico.json');
const MAX_HISTORY = 50;
const WIDTH = 720;
const HEIGHT = 520; // espaço pra lista de projetos; a parte vazia é transparente

let win = null;

function projects() {
  const out = [];
  let cats = [];
  try {
    cats = fs.readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.'));
  } catch {
    return out;
  }
  for (const c of cats) {
    try {
      for (const p of fs.readdirSync(path.join(ROOT, c.name), { withFileTypes: true })) {
        if (!p.isDirectory() || p.name.startsWith('.') || p.name === 'node_modules') continue;
        const full = path.join(ROOT, c.name, p.name);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {}
        out.push({ name: p.name, category: c.name, path: full, mtime });
      }
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function readHistory() {
  try {
    const h = JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

function remember(entry) {
  const h = readHistory().filter((x) => x.text !== entry.text || x.path !== entry.path);
  h.unshift(entry);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(HISTORY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}

// o app pode ter sido aberto pelo atalho do KDE, sem o PATH do terminal
function claudeBin() {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.claude', 'local')];
  for (const d of dirs) {
    const c = path.join(d, 'claude');
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {}
  }
  return null;
}

function launch({ text, path: dir }) {
  const claude = claudeBin();
  if (!claude) return { ok: false, error: 'Não encontrei o comando claude. Instale o Claude Code.' };
  // um texto começando com "-" seria lido como opção do claude
  const prompt = text.startsWith('-') ? ` ${text}` : text;
  const cwd = dir && fs.existsSync(dir) ? dir : os.homedir();
  // se a barra foi iniciada de dentro de um Claude, as variáveis dele não podem vazar
  // pro novo (senão ele se acha uma sessão filha e não salva o histórico)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDECODE'));
  try {
    spawn('konsole', ['--workdir', cwd, '-e', claude, prompt], { detached: true, stdio: 'ignore', env }).unref();
  } catch (e) {
    return { ok: false, error: `Não consegui abrir o Konsole: ${e.message}` };
  }
  remember({ text, path: dir || null, ts: Date.now() });
  return { ok: true };
}

function show() {
  if (!win) return;
  // sempre no centro do monitor onde está o mouse, um pouco acima do meio
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setBounds({ x: Math.round(d.x + (d.width - WIDTH) / 2), y: Math.round(d.y + d.height * 0.22), width: WIDTH, height: HEIGHT });
  win.webContents.send('open', { projects: projects(), history: readHistory() });
  win.show();
  win.focus();
}

function hide() {
  if (!win || !win.isVisible()) return;
  win.webContents.send('close');
  setTimeout(() => win && win.hide(), 140); // deixa a animação de saída terminar
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('blur', hide);
  win.webContents.once('did-finish-load', () => {
    // aberto pelo atalho (não pelo autostart com --oculto): já mostra
    if (!process.argv.includes('--oculto')) show();
  });

  ipcMain.handle('launch', (_e, payload) => {
    const r = launch(payload);
    if (r.ok) hide();
    return r;
  });
  ipcMain.on('hide', hide);
  ipcMain.on('forget', (_e, i) => {
    const h = readHistory();
    h.splice(i, 1);
    fs.writeFileSync(HISTORY, JSON.stringify(h));
  });

  app.on('second-instance', show);
});

// a janela só esconde; o app fica vivo pra abrir na hora no próximo atalho
app.on('window-all-closed', (e) => e.preventDefault());
