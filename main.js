const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const auto = require('./automation');
const { autoUpdater } = require('electron-updater');

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');

// No esbuild as vars abaixo serão substituídas (String Hardcode). Em dev, usa process.env local.
const SUPABASE_URL = process.env.SUPABASE_URL || "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

let supabase = null;
try {
  if (SUPABASE_URL !== "YOUR_SUPABASE_URL") {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.error("Supabase Init falhou.");
}

// Initialize electron store
const store = new Store();

let mainWindow;
let currentSession = null;
let currentDisciplina = null;

// ── Caminho de dados do usuário (AppData/Roaming/Studio Oryon) ──
const userDataPath = path.join(app.getPath('userData'));
// Garantir que o diretório de histórico exista no AppData
const historicoDir = path.join(userDataPath, 'Historico');
if (!fs.existsSync(historicoDir)) {
  try { fs.mkdirSync(historicoDir, { recursive: true }); } catch(e) { console.error('[ORYON] Falha ao criar pasta Histórico:', e.message); }
}

// ── Higiene de Segurança: remover arquivos legados da raiz do app ──
// (Windows bloqueia escrita na pasta do .exe instalado, e dados sensíveis não devem ficar lá)
try {
  // 1. user.json legado (credenciais em texto plano) — removido, substituído pelo electron-store criptografado
  const legacyUser = path.join(__dirname, 'user.json');
  if (fs.existsSync(legacyUser)) { fs.unlinkSync(legacyUser); console.log('[ORYON] Arquivo legado user.json removido da raiz.'); }

  // 2. historico.json na raiz → migrar para AppData e remover original
  const legacyHist = path.join(__dirname, 'historico.json');
  const newHist    = path.join(userDataPath, 'historico.json');
  if (fs.existsSync(legacyHist)) {
    if (!fs.existsSync(newHist)) {
      fs.copyFileSync(legacyHist, newHist);
      console.log('[ORYON] historico.json migrado para AppData.');
    }
    fs.unlinkSync(legacyHist);
  }
} catch (e) { console.warn('[ORYON] Higiene de arquivos legados falhou (normal no dev):', e.message); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    center: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'public', 'images', 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Emissor de eventos bridge (Backend -> Frontend)
function emit(type, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend-event', { type, data });
  }
}

function emitLog(message) {
  emit('log', message);
  console.log(`[ORYON] ${message}`);
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ── Auto-Updater: verificar silenciosamente 3s após o app abrir ──
  setTimeout(() => setupAutoUpdater(), 3000);
});

// ════════════════════════════════════════════════
// AUTO-UPDATER
// ════════════════════════════════════════════════
function setupAutoUpdater() {
  // Não verificar em modo dev (sem squirrel)
  if (!app.isPackaged) {
    console.log('[UPDATER] Modo dev: verificação de update desativada.');
    return;
  }

  autoUpdater.autoDownload = false;          // Apenas notificar, não baixar sozinho
  autoUpdater.autoInstallOnAppQuit = false;  // Instalar apenas quando o usuário pedir

  // Evento: update disponível
  autoUpdater.on('update-available', (info) => {
    console.log(`[UPDATER] Nova versão disponível: v${info.version}`);
    emit('updater', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || ''
    });
  });

  // Evento: app já é a versão mais recente
  autoUpdater.on('update-not-available', () => {
    console.log('[UPDATER] App está atualizado.');
    emit('updater', { status: 'up-to-date' });
  });

  // Evento: progresso do download
  autoUpdater.on('download-progress', (progress) => {
    emit('updater', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferred: (progress.transferred / 1024 / 1024).toFixed(1),
      total: (progress.total / 1024 / 1024).toFixed(1),
      speed: (progress.bytesPerSecond / 1024).toFixed(0)
    });
  });

  // Evento: download concluído
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[UPDATER] v${info.version} pronto para instalar.`);
    emit('updater', { status: 'downloaded', version: info.version });
  });

  // Evento: erro
  autoUpdater.on('error', (err) => {
    console.error('[UPDATER] Erro:', err.message);
    emit('updater', { status: 'error', message: err.message });
  });

  // Verificar agora
  autoUpdater.checkForUpdates().catch((e) => {
    console.error('[UPDATER] Falha ao verificar:', e.message);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('open-privacy', () => {
  const privWin = new BrowserWindow({
    width: 800, height: 750, center: true, autoHideMenuBar: true,
    icon: path.join(__dirname, 'public', 'images', 'favicon.png')
  });
  privWin.loadFile(path.join(__dirname, 'privacidade.html'));
  emit('log', '[ORYON] Navegação para privacidade corrigida com path.join.');
});

ipcMain.on('open-link', (event, url) => {
  shell.openExternal(url);
});

// IPC Handlers
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle('store:delete', (event, key) => {
  store.delete(key);
  return true;
});

// Automação API Equivalents
ipcMain.handle('auto:login', async (event, data) => {
  try {
    let { login, senha, save, showBrowser } = data;

    // Load from store if not provided
    if (!senha) {
      const cfg = store.get('credentials');
      if (cfg && cfg.login === login) {
        senha = Buffer.from(cfg.senha, 'base64').toString('utf-8');
      }
    }

    if (!login || !senha) throw new Error('Login e senha obrigatórios.');

    if (save) {
      store.set('credentials', { 
        login, 
        senha: Buffer.from(senha).toString('base64'), 
        savedAt: new Date().toISOString() 
      });
      emitLog(`💾 Credenciais salvas no armazenamento seguro Desktop.`);
    }

    if (!currentSession) {
      const vBrowser = showBrowser !== undefined ? showBrowser : store.get('showBrowser', true);
      currentSession = await auto.createSession(emit, vBrowser);
    }

    return await auto.login(currentSession, { login, senha }, emit);
  } catch (err) {
    emit('log', `❌ Erro no login: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('auto:disciplinas', async () => {
  if (!currentSession) throw new Error('Faça login primeiro.');
  const list = await auto.getDisciplinas(currentSession, emit);
  return { disciplinas: list };
});

ipcMain.handle('auto:validateLicense', async (event, licenseKey) => {
  emitLog('[ORYON] Validando licença nos servidores de nuvem...');
  if (!supabase) {
    emitLog('[ORYON] ERRO: Supabase não configurado (Falta .env).');
    return { success: false, error: 'Supabase não configurado.' };
  }
  
  try {
    const { data: license, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', licenseKey)
      .single();

    if (error || !license) {
      emitLog('[ORYON] Acesso Negado: Assinatura inexistente ou expirada.');
      return { success: false, error: 'Licença inexistente.' };
    }
    
    if (!license.active) {
      emitLog('[ORYON] Acesso Negado: Assinatura desativada.');
      return { success: false, error: 'Licença desativada.' };
    }
    
    const expiresAt = new Date(license.expires_at);
    if (expiresAt < new Date()) {
      emitLog('[ORYON] Acesso Negado: Assinatura expirada.');
      return { success: false, error: 'Licença expirada.' };
    }

    const currentHWID = machineIdSync();
    if (license.hwid) {
      if (license.hwid !== currentHWID) {
        emitLog('[ORYON] Licença vinculada a outro dispositivo.');
        return { success: false, error: 'Hardware ID mismatch.' };
      }
    } else {
      // Registrar no HWID na primeira vez
      const { error: updateError } = await supabase
        .from('licenses')
        .update({ hwid: currentHWID })
        .eq('key', licenseKey);
        
      if (updateError) {
         emitLog(`[ORYON] Erro ao vincular HWID: ${updateError.message}`);
         return { success: false, error: 'Falha ao vincular dispositivo.' };
      }
    }

    emitLog(`[ORYON] Conectado ao Supabase Cloud. Assinatura ativa.`);
    return { 
      success: true, 
      owner_email: license.owner_email, 
      expires_at: expiresAt.toLocaleDateString('pt-BR') 
    };

  } catch (err) {
    emitLog(`[ORYON] Erro de rede validando licença: ${err.message}`);
    return { success: false, error: 'Falha na conexão com a nuvem ORYON.' };
  }
});

ipcMain.handle('auto:disciplina', async (event, data) => {
  const { targetInfo } = data;
  if (!currentSession) throw new Error('Faça login primeiro.');
  currentDisciplina = targetInfo.titulo;
  const result = await auto.selectDisciplina(currentSession, targetInfo, emit);
  return result;
});

ipcMain.handle('auto:unidades', async () => {
  if (!currentSession) throw new Error('Faça login primeiro.');
  const list = await auto.getUnidades(currentSession, emit);
  return { unidades: list };
});

ipcMain.handle('auto:seccoes', async (event, data) => {
  const { unidade } = data;
  if (!currentSession) throw new Error('Faça login primeiro.');
  const list = await auto.getSeccoes(currentSession, unidade, emit);
  return { seccoes: list };
});

ipcMain.handle('auto:atividades', async (event, data) => {
  const { secao } = data;
  if (!currentSession) throw new Error('Faça login primeiro.');
  const list = await auto.getAtividades(currentSession, secao, emit);
  return { atividades: list };
});

ipcMain.handle('auto:click', async (event, data) => {
  const { name, url } = data;
  if (!currentSession) throw new Error('Faça login primeiro.');
  const item = url ? { name, url } : name; // suportar chamada retrocompatível
  const result = await auto.clickItem(currentSession, item, emit);
  return result;
});

ipcMain.handle('auto:resolver', async (event, data) => {
  let groqKey = store.get('groqKey');
  if (!groqKey) {
    // Fallback pra env se o user usar em .env mas no build n vai ter
    require('dotenv').config();
    groqKey = process.env.GROQ_API_KEY;
  }
  
  if (!groqKey) throw new Error('GROQ_API_KEY não configurada no painel Desktop.');
  if (!currentSession) throw new Error('Faça login primeiro.');

  const disciplina = data.disciplina || currentDisciplina || 'Geral';
  return await auto.resolverAtividade(currentSession, disciplina, groqKey, emit, userDataPath);
});

ipcMain.handle('auto:logout', async () => {
  if (currentSession) {
    await auto.destroySession(currentSession, emit);
    currentSession = null;
    currentDisciplina = null;
  }
  return { success: true };
});

// Abre a pasta de Histórico no Explorer do Windows
ipcMain.handle('shell:openHistorico', async () => {
  const folderPath = path.join(userDataPath, 'Historico');
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  await shell.openPath(folderPath);
  return { success: true };
});

// ── IPC: Updater ──────────────────────────────────────────────
ipcMain.handle('updater:check', async () => {
  if (!app.isPackaged) return { status: 'dev-mode' };
  try {
    await autoUpdater.checkForUpdates();
    return { status: 'checking' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    autoUpdater.downloadUpdate();
    return { status: 'started' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
});

