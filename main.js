// Claude Rápido: uma barra flutuante que fica rodando em segundo plano. O atalho global
// chama `claude-rapido`, que reabre este app; a segunda instância só pede pra janela
// aparecer — por isso abre na hora depois da primeira vez. `claude-rapido --ditado` (Meta+H)
// abre a janela de ditado: fala, o whisper transcreve e o texto vai pra área de transferência.
const { app, BrowserWindow, clipboard, ipcMain, screen } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

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
const DITADO_W = 600;
const DITADO_H = 300;
const MODELO = process.env.WHISPER_MODEL || path.join(os.homedir(), '.local', 'share', 'whisper', 'ggml-small-q5_1.bin');

let win = null;
let ditado = null;

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

function whisperBin() {
  const opcoes = [process.env.WHISPER_CLI, path.join(os.homedir(), '.local', 'bin', 'whisper-cli'), path.join(os.homedir(), '.local', 'src', 'whisper.cpp', 'build', 'bin', 'whisper-cli')];
  for (const c of opcoes) {
    if (!c) continue;
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {}
  }
  return null;
}

function rodar(cmd, args) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout)))
  );
}

// áudio webm da gravação → wav 16 kHz → whisper.cpp, tudo local
async function transcrever(audio) {
  const bin = whisperBin();
  if (!bin) return { ok: false, error: 'Não encontrei o whisper-cli (whisper.cpp).' };
  if (!fs.existsSync(MODELO)) return { ok: false, error: `Falta o modelo de voz em ${MODELO}` };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rapido-'));
  try {
    const webm = path.join(dir, 'fala.webm');
    const wav = path.join(dir, 'fala.wav');
    fs.writeFileSync(webm, Buffer.from(audio));
    await rodar('ffmpeg', ['-loglevel', 'error', '-i', webm, '-ar', '16000', '-ac', '1', '-y', wav]);
    // o whisper sempre processa 30 s (1500 quadros); encurtar pro tamanho da fala deixa
    // frases curtas umas 3x mais rápidas. wav 16 kHz mono 16 bits = 32000 bytes/s
    const segundos = (fs.statSync(wav).size - 44) / 32000;
    const quadros = segundos < 28 ? Math.max(384, Math.ceil(((segundos + 2) / 30) * 1500 / 64) * 64) : 0;
    const out = await rodar(bin, ['-m', MODELO, '-f', wav, '-l', 'pt', '-nt', '-np', '-ac', String(quadros), '-t', String(Math.min(os.cpus().length, 8))]);
    // silêncio vira "[BLANK_AUDIO]", "(música)" etc.
    const text = out.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `A transcrição falhou: ${e.message}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function launch({ text, path: dir }) {
  const claude = claudeBin();
  if (!claude) return { ok: false, error: 'Não encontrei o comando claude. Instale o Claude Code.' };
  // um texto começando com "-" seria lido como opção do claude
  const prompt = text.startsWith('-') ? ` ${text}` : text;
  // sem projeto escolhido abre na pasta de projetos: o Claude nunca memoriza a
  // confiança da pasta pessoal e perguntaria "confia nesta pasta?" toda vez
  const cwd = dir && fs.existsSync(dir) ? dir : fs.existsSync(ROOT) ? ROOT : os.homedir();
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

// cola no app que estava em foco antes do ditado. No Wayland só um teclado virtual
// (ydotool) consegue; Shift+Insert cola tanto em apps comuns quanto no terminal
function colar() {
  const env = { ...process.env, YDOTOOL_SOCKET: process.env.YDOTOOL_SOCKET || '/run/ydotoold/socket' };
  execFile('ydotool', ['key', '42:1', '110:1', '110:0', '42:0'], { env }, () => {});
}

function abrirDitado() {
  if (!ditado) return;
  // Meta+H com a janela aberta para a gravação (ou grava de novo)
  if (ditado.isVisible()) return ditado.webContents.send('ditado:atalho');
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  ditado.setBounds({ x: Math.round(d.x + (d.width - DITADO_W) / 2), y: Math.round(d.y + d.height - DITADO_H - 70), width: DITADO_W, height: DITADO_H });
  ditado.webContents.send('ditado:abrir');
  ditado.show();
  ditado.focus();
}

function esconderDitado() {
  if (!ditado || !ditado.isVisible()) return;
  ditado.webContents.send('close');
  setTimeout(() => ditado && ditado.hide(), 140);
}

function janela(arquivo, largura, altura) {
  const w = new BrowserWindow({
    width: largura,
    height: altura,
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
  w.setAlwaysOnTop(true, 'pop-up-menu');
  w.loadFile(path.join(__dirname, arquivo));
  return w;
}

function abrirPeloArgv(argv) {
  if (argv.includes('--ditado')) abrirDitado();
  else if (!argv.includes('--oculto')) show();
}

app.whenReady().then(() => {
  win = janela('index.html', WIDTH, HEIGHT);
  win.on('blur', hide);
  ditado = janela('ditado.html', DITADO_W, DITADO_H);
  // o ditado decide sozinho se fecha ao perder o foco (não fecha no meio da gravação)
  ditado.on('blur', () => ditado.webContents.send('ditado:blur'));
  let carregadas = 0;
  const pronta = () => ++carregadas === 2 && abrirPeloArgv(process.argv);
  win.webContents.once('did-finish-load', pronta);
  ditado.webContents.once('did-finish-load', pronta);

  ipcMain.handle('launch', (_e, payload) => {
    const r = launch(payload);
    if (r.ok) hide();
    return r;
  });
  ipcMain.on('hide', hide);
  ipcMain.handle('transcrever', (_e, audio) => transcrever(audio));
  ipcMain.on('copiar', (_e, texto) => clipboard.writeText(texto));
  ipcMain.on('ditado:esconder', esconderDitado);
  ipcMain.on('ditado:colar', (_e, texto) => {
    clipboard.writeText(texto);
    esconderDitado();
    setTimeout(colar, 350); // espera a janela sumir e o foco voltar pro app de antes
  });
  ipcMain.handle('ditado:perguntar', (_e, text) => {
    const r = launch({ text, path: null });
    if (r.ok) esconderDitado();
    return r;
  });
  ipcMain.on('forget', (_e, i) => {
    const h = readHistory();
    h.splice(i, 1);
    fs.writeFileSync(HISTORY, JSON.stringify(h));
  });

  app.on('second-instance', (_e, argv) => abrirPeloArgv(argv));
});

// a janela só esconde; o app fica vivo pra abrir na hora no próximo atalho
app.on('window-all-closed', (e) => e.preventDefault());
