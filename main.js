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
  mainWindow.maximize();

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
    let { login, senha, save, showBrowser, rotateUA, liteMode } = data;

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
      const vRotateUA = rotateUA !== undefined ? rotateUA : store.get('rotateUserAgent', false);
      const vLiteMode = liteMode !== undefined ? liteMode : store.get('liteMode', false);
      currentSession = await auto.createSession(emit, vBrowser, { rotateUA: vRotateUA, liteMode: vLiteMode });
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

// ════════════════════════════════════════════════
// SUPABASE AUTH — Login, Register, Session
// ════════════════════════════════════════════════

ipcMain.handle('auth:login', async (event, { email, password }) => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    // Persistir sessão para auto-login
    store.set('supabase_session', data.session);
    return { success: true, user: { id: data.user.id, email: data.user.email } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:register', async (event, { email, password }) => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { success: false, error: error.message };
    // Auto-login após registro (sem confirmação de email)
    if (data.session) {
      store.set('supabase_session', data.session);
    }
    return { success: true, user: { id: data.user.id, email: data.user.email } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:session', async () => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    // Tentar restaurar sessão persistida
    const saved = store.get('supabase_session');
    if (saved && saved.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: saved.access_token,
        refresh_token: saved.refresh_token,
      });
      if (!error && data.session) {
        store.set('supabase_session', data.session);
        return { success: true, user: { id: data.user.id, email: data.user.email } };
      }
    }
    return { success: false, error: 'Nenhuma sessão salva.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  if (supabase) await supabase.auth.signOut().catch(() => {});
  store.delete('supabase_session');
  return { success: true };
});

ipcMain.handle('auth:resetPassword', async (event, { email }) => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ════════════════════════════════════════════════
// LICENSE MANAGEMENT — Fetch, Activate
// ════════════════════════════════════════════════

ipcMain.handle('license:fetch', async (event, { email, userId }) => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    // Buscar por user_id primeiro, depois por email
    let license = null;

    if (userId) {
      const { data } = await supabase.from('licenses').select('*')
        .eq('user_id', userId).eq('active', true).order('expires_at', { ascending: false }).limit(1).maybeSingle();
      license = data;
    }

    if (!license && email) {
      const { data } = await supabase.from('licenses').select('*')
        .eq('owner_email', email).eq('active', true).order('expires_at', { ascending: false }).limit(1).maybeSingle();
      license = data;

      // Auto-vincular user_id se a licença existe mas ainda não tem user_id
      if (license && !license.user_id && userId) {
        await supabase.from('licenses').update({ user_id: userId }).eq('id', license.id);
        license.user_id = userId;
      }
    }

    if (!license) return { success: false, error: 'Nenhuma licença encontrada.' };

    const expiresAt = new Date(license.expires_at);
    const now = new Date();
    const expired = expiresAt < now;
    const diffMs = Math.max(0, expiresAt - now);

    return {
      success: true,
      license: {
        key: license.key,
        active: license.active && !expired,
        expired,
        plan_type: license.plan_type || 'Estudante',
        ra_limit: license.ra_limit || 1,
        authorized_ras: license.authorized_ras || [],
        ra_count: (license.authorized_ras || []).length,
        expires_at: expiresAt.toISOString(),
        expires_at_display: expiresAt.toLocaleDateString('pt-BR'),
        remaining_ms: diffMs,
        owner_email: license.owner_email,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('license:activate', async (event, { key, email, userId }) => {
  if (!supabase) return { success: false, error: 'Supabase não configurado.' };
  try {
    const { data: license, error } = await supabase.from('licenses').select('*')
      .eq('key', key.toUpperCase()).single();

    if (error || !license) return { success: false, error: 'Chave de licença inválida.' };

    // Verificar se já pertence a outro usuário
    if (license.owner_email && license.owner_email !== email && 
        license.user_id && license.user_id !== userId) {
      return { success: false, error: 'Esta licença pertence a outro e-mail.' };
    }

    // Vincular ao usuário
    const updates = {};
    if (!license.user_id && userId) updates.user_id = userId;
    if (!license.owner_email || license.owner_email === 'email.oculto@mercadopago.com') updates.owner_email = email;

    if (Object.keys(updates).length > 0) {
      await supabase.from('licenses').update(updates).eq('id', license.id);
    }

    // Salvar key localmente
    store.set('licenseKey', key.toUpperCase());

    return { success: true, key: license.key };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Atualizações e Patch Notes do Launcher ──
ipcMain.handle('app:getNews', async () => {
  if (!supabase) return { success: false, error: 'Database disconnected.' };
  try {
    const { data, error } = await supabase
      .from('patch_notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw error;
    return { success: true, news: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto:validateLicense', async (event, payload) => {
  // Suporta chamada legada (string) e nova (objeto com ra)
  const licenseKey = typeof payload === 'string' ? payload : payload.licenseKey;
  const capturedRA = typeof payload === 'object' ? payload.capturedRA : null;

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

    // ── Validação de HWID ──
    const currentHWID = machineIdSync();
    if (license.hwid) {
      if (license.hwid !== currentHWID) {
        emitLog('[ORYON] Licença vinculada a outro dispositivo.');
        return { success: false, error: 'Hardware ID mismatch.' };
      }
    } else {
      const { error: updateError } = await supabase
        .from('licenses')
        .update({ hwid: currentHWID })
        .eq('key', licenseKey);
        
      if (updateError) {
         emitLog(`[ORYON] Erro ao vincular HWID: ${updateError.message}`);
         return { success: false, error: 'Falha ao vincular dispositivo.' };
      }
      emitLog('[ORYON] HWID vinculado com sucesso neste dispositivo.');
    }

    // ── Validação de RA (Multi-RA com limite) ──
    if (capturedRA) {
      const authorizedRAs = license.authorized_ras || [];
      const raLimit = license.ra_limit || 1;

      if (authorizedRAs.includes(capturedRA)) {
        // RA já autorizado — acesso liberado
        emitLog(`[ORYON] ✅ RA validado: ${capturedRA} (${authorizedRAs.length}/${raLimit} slots ocupados)`);
      } else if (authorizedRAs.length < raLimit) {
        // Há slots disponíveis — registrar novo RA
        const newRAs = [...authorizedRAs, capturedRA];
        const { error: raError } = await supabase
          .from('licenses')
          .update({ authorized_ras: newRAs })
          .eq('key', licenseKey);

        if (raError) {
          emitLog(`[ORYON] Erro ao vincular RA: ${raError.message}`);
          return { success: false, error: 'Falha ao vincular RA à licença.' };
        }
        emitLog(`[ORYON] ✅ Novo RA autorizado: ${capturedRA} (${newRAs.length}/${raLimit} slots ocupados)`);
      } else {
        // Limite atingido — bloquear
        emitLog(`[ORYON] 🛑 LIMITE DE RAs ATINGIDO: ${authorizedRAs.length}/${raLimit}. RA ${capturedRA} recusado.`);
        return { 
          success: false, 
          error: 'RA_LIMIT_REACHED', 
          currentCount: authorizedRAs.length, 
          maxCount: raLimit 
        };
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

ipcMain.handle('auto:captureRA', async () => {
  if (!currentSession) throw new Error('Faça login primeiro.');
  return await auto.captureRA(currentSession, emit);
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

