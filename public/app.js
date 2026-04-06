// ============================================================
// AVA Kroton — Frontend Logic (Auth + Dashboard + Automation)
// ============================================================

// ── Variables ───────────────────────────────────────────────
let sseSource = null;
let currentDisciplina = null;
let currentUnidade = null;
let currentUser = null;
let currentLicense = null;
let countdownInterval = null;
let authMode = 'login'; // 'login' ou 'register'

// ── DOM Elements ────────────────────────────────────────────
const els = {
  viewAuth: document.getElementById('viewAuth'),
  viewDashboard: document.getElementById('viewDashboard'),
  viewAutomation: document.getElementById('viewAutomation'),

  inputLogin: document.getElementById('inputLogin'),
  inputSenha: document.getElementById('inputSenha'),
  checkSave: document.getElementById('checkSave'),
  btnLogin: document.getElementById('btnLogin'),
  
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  btnLogout: document.getElementById('btnLogout'),
  logConsole: document.getElementById('logConsole'),
  
  steps: document.querySelectorAll('.step'),
  sectionLogin: document.getElementById('sectionLogin'),
  sectionDisciplinas: document.getElementById('sectionDisciplinas'),
  sectionNav: document.getElementById('sectionNav'),
  sectionResult: document.getElementById('sectionResult'),
  
  disciplinasList: document.getElementById('disciplinasList'),
  unidadesList: document.getElementById('unidadesList'),
  seccoesList: document.getElementById('seccoesList'),
  atividadesList: document.getElementById('atividadesList'),
  
  loadingDisciplinas: document.getElementById('loadingDisciplinas'),
  loadingUnidades: document.getElementById('loadingUnidades'),
  
  cardUnidades: document.getElementById('cardUnidades'),
  cardSeccoes: document.getElementById('cardSeccoes'),
  cardAtividades: document.getElementById('cardAtividades'),
  btnResolver: document.getElementById('btnResolver'),
  
  scoreCard: document.getElementById('scoreCard'),
  scoreValue: document.getElementById('scoreValue'),
};

// ── Init & Auth ────────────────────────────────────────────
window.onload = async () => {
  connectSSE();
  
  // Tentar restaurar sessão
  const res = await window.electronAPI.invoke('auth:session');
  if (res && res.success) {
    currentUser = res.user;
    showView('dashboard');
    loadDashboard();
  } else {
    showView('auth');
  }
  setupMascot();

  // Carregar credenciais locais se houver
  try {
    const creds = await window.electronAPI.storeGet('credentials');
    if (creds && creds.login) {
      els.inputLogin.value = creds.login;
      els.inputSenha.placeholder = "Senha salva (protegida)";
    }
    const groqKey = await window.electronAPI.storeGet('groqKey');
    if (groqKey && document.getElementById('inputGroqKey')) {
      document.getElementById('inputGroqKey').value = groqKey;
    }
    const showBrowser = await window.electronAPI.storeGet('showBrowser');
    if (showBrowser !== undefined && document.getElementById('checkShowBrowser')) {
      document.getElementById('checkShowBrowser').checked = showBrowser;
    }
    const rotateUA = await window.electronAPI.storeGet('rotateUserAgent');
    if (rotateUA !== undefined && document.getElementById('checkRotateUserAgent')) {
      document.getElementById('checkRotateUserAgent').checked = rotateUA;
    }
    const liteMode = await window.electronAPI.storeGet('liteMode');
    if (liteMode !== undefined && document.getElementById('checkLiteMode')) {
      document.getElementById('checkLiteMode').checked = liteMode;
    }
  } catch (err) {}
};

function showView(viewId) {
  els.viewAuth.style.display = 'none';
  els.viewDashboard.style.display = 'none';
  els.viewAutomation.style.display = 'none';
  
  if (viewId === 'auth') {
    els.viewAuth.style.display = 'flex';
    if (!currentUser) loadNews();
  }
  if (viewId === 'dashboard') els.viewDashboard.style.display = 'block';
  if (viewId === 'automation') els.viewAutomation.style.display = 'block';
}

// ── Dashboard Tab Switcher ──────────────────────────────────
function switchDashTab(tabId) {
  // Hide all sections
  document.getElementById('dashSectionOverview').style.display = 'none';
  document.getElementById('dashSectionNews').style.display = 'none';
  document.getElementById('dashSectionSettings').style.display = 'none';

  // Remove active from all nav items
  document.querySelectorAll('.dash-nav-item').forEach(el => el.classList.remove('active'));

  if (tabId === 'Overview') {
    document.getElementById('dashSectionOverview').style.display = 'block';
    document.getElementById('navVisaoGeral').classList.add('active');
  } else if (tabId === 'News') {
    document.getElementById('dashSectionNews').style.display = 'block';
    document.getElementById('navNovidades').classList.add('active');
    loadDashNews();
  } else if (tabId === 'Settings') {
    document.getElementById('dashSectionSettings').style.display = 'block';
    document.getElementById('navAjustes').classList.add('active');
  }
}

async function loadDashNews() {
  const container = document.getElementById('dashNewsList');
  if (!container) return;
  container.innerHTML = '<div class="loading" style="display:block;"><div class="spinner"></div> Carregando patch notes...</div>';
  try {
    const res = await window.electronAPI.invoke('app:getNews');
    if (!res || !res.success || !res.news || res.news.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:40px 0;">Nenhuma novidade publicada ainda.</div>';
      return;
    }
    let html = '';
    res.news.forEach((n, i) => {
      const d = new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const typeLabel = n.type === 'update' ? 'Atualização' : n.type === 'maintenance' ? 'Manutenção' : n.type === 'alert' ? 'Alerta' : 'Novidade';
      const typeClass = n.type || 'feature';
      html += `
        <div class="dash-news-card" style="animation: fadeIn 0.4s ease ${i * 0.08}s both;">
          <div class="dash-news-header">
            <span class="news-tag ${typeClass}">${typeLabel}</span>
            <span style="font-size:12px; color:var(--text-muted);">${d}</span>
          </div>
          <h3 style="font-size:16px; font-weight:700; color:#fff; margin:12px 0 8px;">${n.title}</h3>
          <p style="font-size:14px; color:var(--text-secondary); line-height:1.7; margin:0;">${n.content}</p>
          ${n.link_url ? `<a href="#" onclick="window.electronAPI.send('open-link', '${n.link_url}'); return false;" style="display:inline-flex; align-items:center; gap:6px; margin-top:12px; font-size:13px; color:#60A5FA; text-decoration:none; font-weight:600;"><i class="ph-bold ph-link"></i> Saber mais</a>` : ''}
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div style="color:var(--danger);font-size:14px;text-align:center;padding:40px 0;">Falha ao carregar notícias.</div>';
  }
}

// ── View 1: Auth (Login / Register) ──
function toggleAuthMode() {
  const title = document.getElementById('authTitle');
  const btn = document.getElementById('btnAuth');
  const toggleText = document.getElementById('authToggleText');
  const toggleLink = document.getElementById('authToggleLink');
  const error = document.getElementById('authError');
  error.style.display = 'none';

  if (authMode === 'login') {
    authMode = 'register';
    title.innerText = 'Criar uma conta';
    btn.innerHTML = '<i class="ph-bold ph-user-plus"></i> Registrar';
    toggleText.innerText = 'Já tem uma conta?';
    toggleLink.innerText = 'Entrar';
  } else {
    authMode = 'login';
    title.innerText = 'Entrar na sua conta';
    btn.innerHTML = '<i class="ph-bold ph-sign-in"></i> Entrar';
    toggleText.innerText = 'Não tem uma conta?';
    toggleLink.innerText = 'Criar conta';
  }
}

async function loadNews() {
  const container = document.getElementById('authNewsContainer');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:14px;"><i class="ph ph-spinner-gap ph-spin"></i> Buscando atualizações...</div>';
  try {
    const res = await window.electronAPI.invoke('app:getNews');
    if (!res || !res.success || !res.news || res.news.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:14px;">Nenhuma novidade no momento.</div>';
      return;
    }
    let html = '';
    res.news.forEach(n => {
      const d = new Date(n.created_at).toLocaleDateString('pt-BR');
      html += `
        <div class="news-card">
          <div class="news-meta">
            <span class="news-tag ${n.type}">${n.type === 'update' ? 'Atualização' : n.type === 'maintenance' ? 'Manutenção' : n.type === 'alert' ? 'Alerta' : 'Novidade'}</span>
            <span>${d}</span>
          </div>
          <h3 class="news-title">${n.title}</h3>
          <p class="news-content">${n.content}</p>
          ${n.link_url ? `<a href="${n.link_url}" target="_blank" class="news-link"><i class="ph-bold ph-link"></i> Saber mais</a>` : ''}
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div style="color:var(--danger);font-size:14px;">Falha ao carregar notícias.</div>';
  }
}

function mascotError() {
  const eyes = document.getElementById('mascotEyes');
  if (eyes) {
    document.getElementById('eyeL').setAttribute('fill', '#EF4444');
    document.getElementById('eyeR').setAttribute('fill', '#EF4444');
    eyes.style.transform = 'translateX(-4px)';
    setTimeout(() => { eyes.style.transform = 'translateX(4px)'; }, 100);
    setTimeout(() => { eyes.style.transform = 'translateX(-4px)'; }, 200);
    setTimeout(() => { eyes.style.transform = 'translateX(4px)'; }, 300);
    setTimeout(() => { 
      eyes.style.transform = 'translateX(0)';
      document.getElementById('eyeL').setAttribute('fill', '#60A5FA');
      document.getElementById('eyeR').setAttribute('fill', '#60A5FA');
    }, 1000);
  }
}

function setupMascot() {
  const emailInput = document.getElementById('authEmail');
  const passwordInput = document.getElementById('authPassword');
  const hands = document.getElementById('mascotHands');
  const eyes = document.getElementById('mascotEyes');

  if (!emailInput || !passwordInput || !hands || !eyes) return;

  emailInput.addEventListener('focus', () => {
    hands.style.opacity = '0';
    hands.style.transform = 'translate(0, 30px)';
    eyes.style.transform = 'translate(0, 4px)';
  });
  emailInput.addEventListener('input', (e) => {
    const len = Math.min(e.target.value.length, 30);
    const x = -5 + (len / 30) * 10;
    eyes.style.transform = `translate(${x}px, 4px)`;
  });
  emailInput.addEventListener('blur', () => {
    eyes.style.transform = 'translate(0, 0)';
  });

  passwordInput.addEventListener('focus', () => {
    eyes.style.transform = 'translate(0, -2px)';
    hands.style.opacity = '1';
    hands.style.transform = 'translate(0, 0)';
  });
  passwordInput.addEventListener('blur', () => {
    hands.style.opacity = '0';
    hands.style.transform = 'translate(0, 30px)';
    eyes.style.transform = 'translate(0, 0)';
  });
}

async function doAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorDiv = document.getElementById('authError');
  const btn = document.getElementById('btnAuth');

  errorDiv.style.display = 'none';
  if (!email || !password) {
    errorDiv.innerText = 'Preencha e-mail e senha.';
    errorDiv.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-top-color:white;"></div> Autenticando...';

  try {
    const channel = authMode === 'login' ? 'auth:login' : 'auth:register';
    const res = await window.electronAPI.invoke(channel, { email, password });
    
    if (!res.success) {
      throw new Error(res.error);
    }
    
    currentUser = res.user;
    showView('dashboard');
    loadDashboard();
  } catch (err) {
    mascotError();
    errorDiv.innerText = err.message;
    errorDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = authMode === 'login' ? '<i class="ph-bold ph-sign-in"></i> Entrar' : '<i class="ph-bold ph-user-plus"></i> Registrar';
  }
}

async function doResetPassword() {
  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    alert('Preencha seu e-mail acima para redefinir a senha.');
    return;
  }
  const res = await window.electronAPI.invoke('auth:resetPassword', { email });
  if (res.success) {
    alert('E-mail de redefinição de senha enviado. Verifique sua caixa de entrada.');
  } else {
    alert('Erro: ' + res.error);
  }
}

async function doAuthLogout() {
  await window.electronAPI.invoke('auth:logout');
  currentUser = null;
  currentLicense = null;
  if (countdownInterval) clearInterval(countdownInterval);
  showView('auth');
}

// ── View 2: Dashboard ──
async function loadDashboard() {
  document.getElementById('dashUserEmail').innerText = currentUser.email;
  const btnLaunch = document.getElementById('btnLaunchSystem');
  const noLicenseMsg = document.getElementById('dashNoLicense');
  
  if (countdownInterval) clearInterval(countdownInterval);
  
  btnLaunch.disabled = true;
  btnLaunch.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-top-color:white;"></div> Carregando licença...';
  
  const res = await window.electronAPI.invoke('license:fetch', { 
    email: currentUser.email, 
    userId: currentUser.id 
  });

  btnLaunch.innerHTML = '<i class="ph-bold ph-rocket-launch"></i> Iniciar Sistema Oryon';

  if (!res.success || !res.license) {
    noLicenseMsg.style.display = 'block';
    currentLicense = null;
    document.getElementById('dashPlanBadge').innerText = 'Gratuito';
    document.getElementById('dashPlanBadge').className = 'dash-plan-badge';
    return;
  }

  noLicenseMsg.style.display = 'none';
  currentLicense = res.license;

  // Plan info
  const planBadge = document.getElementById('dashPlanBadge');
  planBadge.innerText = currentLicense.plan_type || 'Estudante';
  planBadge.className = 'dash-plan-badge ' + (currentLicense.plan_type === 'Agência' ? 'gold' : '');

  // Status / Botão
  if (currentLicense.active) {
    btnLaunch.disabled = false;
  } else {
    btnLaunch.disabled = true;
  }

  // RA Anel (Circular Progress)
  const raLimit = currentLicense.ra_limit || 1;
  const raCount = currentLicense.ra_count || 0;
  
  document.getElementById('dashRACount').innerText = raCount;
  document.getElementById('dashRALimit').innerText = raLimit;
  
  const circle = document.getElementById('dashRACircle');
  if (circle) {
    const percent = Math.min(100, (raCount / raLimit) * 100);
    const offset = 100 - percent;
    circle.style.strokeDashoffset = offset;
    
    // Se estourar limite ou chegar a 100%, fica vermelho
    if (percent >= 100) {
      circle.style.stroke = '#EF4444'; 
    } else {
      circle.style.stroke = '#60A5FA';
    }
  }

  // Countdown
  document.getElementById('dashExpiresDate').innerText = `Expira em: ${currentLicense.expires_at_display}`;
  startCountdown(new Date(currentLicense.expires_at));
}

function startCountdown(expirationDate) {
  const f = (n) => n.toString().padStart(2, '0');
  const dEl = document.getElementById('cdDays');
  const hEl = document.getElementById('cdHours');
  const mEl = document.getElementById('cdMins');
  const sEl = document.getElementById('cdSecs');

  const update = () => {
    const diff = expirationDate - new Date();
    if (diff <= 0) {
      clearInterval(countdownInterval);
      dEl.innerText = '00'; hEl.innerText = '00'; mEl.innerText = '00'; sEl.innerText = '00';
      if (currentLicense) currentLicense.active = false;
      document.getElementById('btnLaunchSystem').disabled = true;
      return;
    }
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);
    dEl.innerText = f(d);
    hEl.innerText = f(h);
    mEl.innerText = f(m);
    sEl.innerText = f(s);
  };
  
  update();
  countdownInterval = setInterval(update, 1000);
}

async function activateKey() {
  const key = document.getElementById('inputActivateKey').value.trim();
  const errDiv = document.getElementById('activateError');
  errDiv.style.display = 'none';

  if (!key) return;

  const btn = document.getElementById('btnActivateKey');
  btn.disabled = true;
  const oldText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-top-color:white;"></div>';

  try {
    const res = await window.electronAPI.invoke('license:activate', {
      key,
      email: currentUser.email,
      userId: currentUser.id
    });
    if (!res.success) throw new Error(res.error);
    
    document.getElementById('inputActivateKey').value = '';
    loadDashboard();
  } catch (err) {
    errDiv.innerText = err.message;
    errDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

async function launchSystem() {
  if (!currentLicense || !currentLicense.active) return;
  
  const btn = document.getElementById('btnLaunchSystem');
  const oldText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div> Processando...';
  btn.disabled = true;

  try {
    // Verificar consentimento legal
    const res = await window.electronAPI.invoke('auto:checkConsent', currentLicense.key);
    if (!res.success) throw new Error(res.error);
    
    if (!res.hasConsent) {
      // Exibir modal de consentimento
      const modal = document.getElementById('modalConsentimento');
      modal.style.display = 'flex';
      // Animação de entrada
      setTimeout(() => { modal.style.opacity = '1'; }, 10);
      return; // Interrompe o lançamento
    }

    // Se tem consentimento, prosseguir
    continueLaunchSystem();
  } catch(err) {
    alert("Erro ao validar termos de uso: " + err.message);
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

function continueLaunchSystem() {
  // Salvar config do painel silenciosamente
  const groqKey = document.getElementById('inputGroqKey').value;
  const showBrowser = document.getElementById('checkShowBrowser').checked;
  const rotateUA = document.getElementById('checkRotateUserAgent').checked;
  const liteMode = document.getElementById('checkLiteMode').checked;
  if (groqKey) window.electronAPI.storeSet('groqKey', groqKey);
  window.electronAPI.storeSet('showBrowser', showBrowser);
  window.electronAPI.storeSet('rotateUserAgent', rotateUA);
  window.electronAPI.storeSet('liteMode', liteMode);

  showView('automation');
  addLog('🟢 Sistema inicializado. Aguardando credenciais do AVA.');
  
  document.getElementById('licenseBadge').style.display = 'flex';
  document.getElementById('licenseText').innerText = currentLicense.plan_type;
}

// ── Lógica do Modal de Consentimento ──
function checkConsentInput() {
  const input = document.getElementById('inputConsent').value.trim().toLowerCase();
  const btn = document.getElementById('btnConfirmConsent');
  const err = document.getElementById('consentError');
  
  if (input === 'aceito') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    err.style.display = 'none';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    if (input.length > 0 && input !== 'aceit' && input !== 'acei' && input !== 'ace' && input !== 'ac' && input !== 'a') {
      err.style.display = 'block';
    } else {
      err.style.display = 'none';
    }
  }
}

function fecharConsentimento() {
  const modal = document.getElementById('modalConsentimento');
  modal.style.opacity = '0';
  setTimeout(() => { modal.style.display = 'none'; }, 400); // Aguarda a transição css
}

async function confirmarConsentimento() {
  const input = document.getElementById('inputConsent').value.trim().toLowerCase();
  if (input !== 'aceito') return;

  const btn = document.getElementById('btnConfirmConsent');
  const oldText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div> Registrando...';
  btn.disabled = true;

  try {
    const res = await window.electronAPI.invoke('auto:saveConsent', {
      licenseKey: currentLicense.key,
      userEmail: currentUser.email,
      typedText: 'aceito'
    });
    if (!res.success) throw new Error(res.error);
    
    // Sucesso, pode fechar e continuar
    fecharConsentimento();
    continueLaunchSystem();
    
  } catch(err) {
    alert("Erro ao registrar consentimento: " + err.message);
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

function backToDashboard() {
  showView('dashboard');
}

// ── View 3: Automation Logic (Fluxo Original) ──

async function doLogin() {
  const login = els.inputLogin.value.trim();
  const senha = els.inputSenha.value;
  const save = els.checkSave.checked;
  const groqKey = document.getElementById('inputGroqKey').value;
  const showBrowser = document.getElementById('checkShowBrowser').checked;
  const rotateUA = document.getElementById('checkRotateUserAgent').checked;
  const liteMode = document.getElementById('checkLiteMode').checked;
  
  if (!login || (!senha && !els.inputSenha.placeholder.includes('salva'))) {
    return alert('Preencha login e senha do portal AVA.');
  }

  if (!currentLicense) return alert('Licença não encontrada no dashboard.');

  els.btnLogin.disabled = true;
  els.btnLogin.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Conectando...';

  try {
    // ── Passo 1: Validar HWID via auto:validateLicense nativo ──
    const lic = await window.electronAPI.invoke('auto:validateLicense', currentLicense.key);
    if (!lic || !lic.success) {
      throw new Error(`Acesso Negado: ${lic ? lic.error : 'Erro desconhecido.'}`);
    }
    
    // ── Passo 2: Login no portal AVA ──
    els.btnLogin.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Autenticando Motor Nativo...';
    addLog('🟢 Iniciando injeção em ambiente Desktop isolado...');
    
    const res = await fetchPost('/api/login', { login, senha, save, showBrowser, rotateUA, liteMode });
    if (res.success) {
      els.btnLogout.style.display = 'block';
    }

    // ── Passo 3: Validar RA capturado ──
    const capturedRA = res.ra;
    if (capturedRA) {
      els.btnLogin.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Verificando identidade acadêmica...';
      addLog(`[ORYON] RA detectado: ${capturedRA}. Validando vínculo com a licença...`);
      
      const licRA = await window.electronAPI.invoke('auto:validateLicense', {
        licenseKey: currentLicense.key,
        capturedRA: capturedRA
      });

      if (!licRA || !licRA.success) {
        if (licRA && licRA.error === 'RA_LIMIT_REACHED') {
          addLog(`❌ [BLOQUEIO] Limite de RAs atingido (${licRA.currentCount}/${licRA.maxCount}). RA ${capturedRA} recusado.`);
          showRABlockModal(capturedRA, 'limit', licRA.currentCount, licRA.maxCount);
          return;
        }
        throw new Error(`Falha na validação de RA: ${licRA ? licRA.error : 'Erro desconhecido.'}`);
      }
      addLog(`[SUCESSO] ✅ Identidade acadêmica confirmada. RA: ${capturedRA}`);
    } else {
      addLog('[AVISO] RA não capturado do portal. Verificação ignorada.');
    }

  } catch (err) {
    addLog(`❌ Falha: ${err.message}`);
    alert(err.message);
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.innerHTML = '<i class="ph-bold ph-play-circle"></i> Conectar ao AVA';
  }
}

// ── SSE Logs ────────────────────────────────────────────────
function connectSSE() {
  els.statusBadge.classList.add('connected');
  els.statusText.textContent = 'Desktop Engine Conectado';
  
  window.electronAPI.onBackendEvent((msg) => {
    try {
      if (msg.type === 'log') {
        addLog(msg.data);
      } else if (msg.type === 'status') {
        if (msg.data === 'logged_in') {
          showStep(2);
          loadDisciplinas();
        }
      } else if (msg.type === 'done') {
        showResult(msg.data);
      } else if (msg.type === 'updater') {
        handleUpdaterEvent(msg.data);
      }
    } catch {}
  });
}

function addLog(text) {
  if (!els.logConsole) return;
  const line = document.createElement('div');
  line.className = 'log-line';
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}]`;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  
  const lower = text.toLowerCase();
  if (lower.includes('[sucesso]') || lower.includes('✅') || text.includes('🏆') || lower.includes('[oryon] resposta processada')) {
    msgSpan.classList.add('success');
  } else if (lower.includes('[erro]') || lower.includes('[aviso]') || lower.includes('falha') || text.includes('❌') || text.includes('⚠️')) {
    msgSpan.classList.add('error');
  } else if (lower.includes('[oryon]') || lower.includes('motor') || text.includes('⚡') || text.includes('🔍')) {
    msgSpan.classList.add('ai');
  }
  
  msgSpan.innerHTML = text;
  line.appendChild(timeSpan);
  line.appendChild(msgSpan);
  els.logConsole.appendChild(line);
  els.logConsole.scrollTop = els.logConsole.scrollHeight;
}

function clearLogs() {
  els.logConsole.innerHTML = '';
}

// ── Funções de Fluxo da Automação ──
async function loadDisciplinas() {
  els.disciplinasList.innerHTML = '';
  els.loadingDisciplinas.style.display = 'flex';
  try {
    const data = await fetchGet('/api/disciplinas');
    els.loadingDisciplinas.style.display = 'none';
    if (!data.disciplinas || data.disciplinas.length === 0) {
      els.disciplinasList.innerHTML = '<div style="color:var(--danger)">Nenhuma disciplina encontrada.</div>';
      return;
    }
    data.disciplinas.forEach((disc, i) => {
      els.disciplinasList.appendChild(createItemCard(disc.titulo, i, async () => {
        currentDisciplina = disc.titulo;
        await fetchPost('/api/disciplina', { targetInfo: disc });
        showStep(3);
        loadUnidades();
      }));
    });
  } catch (err) {
    els.loadingDisciplinas.style.display = 'none';
    addLog(`[ERRO] ${err.message}`);
  }
}

async function loadUnidades() {
  els.unidadesList.innerHTML = '';
  els.seccoesList.innerHTML = '';
  els.atividadesList.innerHTML = '';
  els.cardSeccoes.style.display = 'none';
  els.cardAtividades.style.display = 'none';
  els.btnResolver.style.display = 'none';
  els.loadingUnidades.style.display = 'flex';
  try {
    const data = await fetchGet('/api/unidades');
    els.loadingUnidades.style.display = 'none';
    if (data.unidades.length === 0) {
      els.unidadesList.innerHTML = '<div style="color:var(--warning)">Nenhuma unidade detectada.</div>';
      els.btnResolver.style.display = 'inline-flex';
      return;
    }
    data.unidades.forEach((uni, i) => {
      els.unidadesList.appendChild(createItemCard(uni, i, async () => {
        addLog(`<i class="ph ph-spinner-gap ph-spin"></i> Navegando para ${uni}...`);
        currentUnidade = uni;
        loadSeccoes(uni);
      }));
    });
  } catch (err) {
    els.loadingUnidades.style.display = 'none';
    addLog(`❌ Erro: ${err.message}`);
  }
}

async function loadSeccoes(unidade) {
  els.seccoesList.innerHTML = '';
  els.cardSeccoes.style.display = 'block';
  els.cardAtividades.style.display = 'none';
  els.btnResolver.style.display = 'none';
  addLog(`<i class="ph-bold ph-arrows-clockwise ph-spin"></i> Carregando seções para: ${unidade}...`);
  try {
    const data = await fetchPost('/api/seccoes', { unidade });
    if (data.seccoes.length === 0) {
      els.btnResolver.style.display = 'inline-flex';
      return;
    }
    data.seccoes.forEach((sec, i) => {
      const title = typeof sec === 'object' ? sec.titulo : sec;
      els.seccoesList.appendChild(createItemCard(title, i, async () => {
        await fetchPost('/api/click', { name: sec });
        loadAtividades(title);
      }));
    });
  } catch (err) {}
}

async function loadAtividades(secao) {
  els.atividadesList.innerHTML = '';
  els.cardAtividades.style.display = 'block';
  els.btnResolver.style.display = 'none';
  addLog(`<i class="ph-bold ph-arrows-clockwise ph-spin"></i> Carregando atividades para ${secao}...`);
  try {
    const data = await fetchPost('/api/atividades', { secao });
    if (data.atividades.length === 0) {
      els.btnResolver.style.display = 'inline-flex';
      return;
    }
    data.atividades.forEach((atv, i) => {
      let badgeColor = 'var(--text-muted)';
      if (atv.status === 'CONCLUÍDA') badgeColor = 'var(--success)';
      if (atv.status === 'PENDENTE') badgeColor = 'var(--warning)';
      const statusHtml = `<span style="font-size:10px; padding:2px 8px; border-radius:12px; margin-left:10px; background:${badgeColor}; color:var(--bg-primary); white-space:nowrap; vertical-align:middle; font-weight:700;">${atv.status}</span>`;
      els.atividadesList.appendChild(createItemCard(atv.titulo + statusHtml, i, async () => {
        if (atv.status === 'CONCLUÍDA') {
          if (!confirm('Esta atividade já foi concluída. Deseja refazer?')) {
            els.atividadesList.querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));
            return;
          }
        }
        await fetchPost('/api/click', { name: atv });
        els.btnResolver.style.display = 'inline-flex';
      }));
    });
  } catch (err) {}
}

async function startResolver() {
  els.btnResolver.disabled = true;
  els.btnResolver.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-top-color:white;"></div> Resolvendo...';
  try {
    addLog(`<i class="ph-bold ph-rocket-launch"></i> Iniciando resolução para: ${currentDisciplina}`);
    const res = await fetchPost('/api/resolver', { disciplina: currentDisciplina });
    if (res.status === 'success') {
      showResult({ score: res.aproveitamento, time: res.tempo_execucao, total: res.questoes.length });
    }
  } catch (err) {
    addLog(`[ERRO] Falha fatal: ${err.message}`);
    alert(`Falha: ${err.message}`);
  } finally {
    els.btnResolver.disabled = false;
    els.btnResolver.innerHTML = '<i class="ph-bold ph-robot"></i> Iniciar Motor de Automação';
  }
}

function showResult(data) {
  showStep(4);
  els.scoreCard.classList.add('visible');
  els.scoreValue.textContent = data.score;
  if (data.notas && data.tempoEmpregado) {
    els.scoreCard.innerHTML = `
      <div style="font-size: 40px; margin-bottom: 12px;">🏆</div>
      <div class="score-value">${data.score}</div>
      <div class="score-label">Aproveitamento Final</div>
      <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; margin-top: 20px; text-align: left; font-size: 13px; color: var(--text-secondary);">
        <div style="margin-bottom: 8px;"><strong>Estado:</strong> ${data.status || 'Finalizada'}</div>
        <div style="margin-bottom: 8px;"><strong>Tempo empregado:</strong> ${data.tempoEmpregado}</div>
        <div style="margin-bottom: 8px;"><strong>Notas brutas:</strong> ${data.notas}</div>
        <div><strong>Total de questões respondidas:</strong> ${data.total}</div>
      </div>
      <div class="post-quiz-menu" id="postQuizMenu" style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
        <button class="btn btn-primary" onclick="refazerQuestionario()"><i class="ph-bold ph-arrows-clockwise"></i> Refazer este Questionário</button>
        <button class="btn btn-success" onclick="voltarSeccoes()"><i class="ph-bold ph-arrow-u-up-left"></i> Voltar para Unidade Atual</button>
        <button class="btn btn-ghost" onclick="voltarDisciplinas()"><i class="ph-bold ph-house"></i> Voltar para Disciplinas</button>
      </div>
    `;
  }
}

async function refazerQuestionario() {
  addLog('<i class="ph-bold ph-arrows-clockwise ph-spin"></i> Solicitando nova tentativa...');
  showStep(3);
  els.btnResolver.style.display = 'inline-flex';
}

async function voltarSeccoes() {
  showStep(3);
  if (currentUnidade) loadSeccoes(currentUnidade);
}

async function voltarDisciplinas() {
  await fetchPost('/api/click', { name: 'HOME', url: 'https://www.avaeduc.com.br/' }).catch(() => {});
  showStep(2);
  loadDisciplinas();
}

async function sairFechar() {
  try { await fetchPost('/api/logout', {}); } catch {}
  location.reload();
}

async function logout() {
  try {
    await fetchPost('/api/logout', {});
    await window.electronAPI.storeSet('credentials', null); 
  } catch {}
  location.reload();
}

// ── Funções Utilitárias UI ──
function showStep(stepNum) {
  els.steps.forEach(s => {
    const num = parseInt(s.dataset.step);
    if (num < stepNum) {
      s.classList.add('done'); s.classList.remove('active');
    } else if (num === stepNum) {
      s.classList.add('active'); s.classList.remove('done');
    } else {
      s.classList.remove('active', 'done');
    }
  });

  document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));
  if (stepNum === 1) els.sectionLogin.classList.add('visible');
  if (stepNum === 2) els.sectionDisciplinas.classList.add('visible');
  if (stepNum === 3) els.sectionNav.classList.add('visible');
  if (stepNum === 4) els.sectionResult.classList.add('visible');
}

function createItemCard(text, index, onclick) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.innerHTML = `<div class="item-num">${index + 1}</div><div class="item-name">${text}</div>`;
  let _isLoading = false;
  card.addEventListener('click', async () => {
    if (_isLoading) return;
    const parent = card.parentElement;
    parent.querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    _isLoading = true;
    card.style.opacity = '0.7'; card.style.pointerEvents = 'none';
    try { await onclick(); } finally { _isLoading = false; card.style.opacity = ''; card.style.pointerEvents = ''; }
  });
  return card;
}

function showRABlockModal(detectedRA, type = 'limit', currentCount = 0, maxCount = 1) {
  const modal = document.getElementById('raBlockModal');
  const raDetected = document.getElementById('raDetectedValue');
  const modalCounter = document.getElementById('raBlockCounter');
  if (raDetected) raDetected.textContent = detectedRA;
  if (type === 'limit' && modalCounter) {
    modalCounter.style.display = 'block';
    modalCounter.innerHTML = `<span style="font-size:22px; font-weight:800; color:#f59e0b;">${currentCount}</span><span style="color:var(--text-muted);"> / ${maxCount} slots utilizados</span>`;
  }
  if (modal) modal.style.display = 'flex';
  fetchPost('/api/logout', {}).catch(() => {});
  els.btnLogout.style.display = 'none';
}

async function fetchPost(channel, body = {}) {
  let ipcChannel = channel.startsWith('/api/') ? 'auto:' + channel.split('/').pop() : channel;
  try {
    const result = await window.electronAPI.invoke(ipcChannel, body);
    if (result && result.error) throw new Error(result.error);
    return result;
  } catch (err) {
    let msg = err.message || String(err);
    if (msg.includes('Error invoking remote method')) msg = msg.split(':').slice(2).join(':').trim();
    throw new Error(msg);
  }
}

async function fetchGet(channel) {
  return fetchPost(channel, {});
}

// Event Listeners
if (els.inputLogin) els.inputLogin.addEventListener('keypress', e => { if (e.key === 'Enter') els.inputSenha.focus(); });
if (els.inputSenha) els.inputSenha.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
// Support auto updater GUI
let _updaterState = 'idle';
function handleUpdaterEvent(data) {
  const bar = document.getElementById('updateBar');
  const title = document.getElementById('updateBarTitle');
  const sub = document.getElementById('updateBarSub');
  const progress = document.getElementById('updateProgress');
  const progText = document.getElementById('updateProgressText');
  const progBar = document.getElementById('updateProgressBar');
  const btnLabel = document.getElementById('btnUpdateLabel');
  const btn = document.getElementById('btnUpdate');
  if (!bar) return;

  if (data.status === 'available') {
    _updaterState = 'available';
    title.textContent = `⚡ Nova versão v${data.version} disponível!`; sub.textContent = 'Baixe e instale agora.';
    progress.style.display = 'none'; btnLabel.textContent = 'Atualizar Agora'; btn.disabled = false; bar.style.display = 'flex';
  } else if (data.status === 'up-to-date') {
    _updaterState = 'idle';
    title.textContent = '✅ Você já está na versão mais recente!'; sub.textContent = 'Nenhuma atualização necessária.';
    progress.style.display = 'none'; btn.style.display = 'none'; bar.style.display = 'flex';
    setTimeout(() => { bar.style.display = 'none'; btn.style.display = 'inline-flex'; }, 4000);
  } else if (data.status === 'downloading') {
    _updaterState = 'downloading';
    title.textContent = `⏬ Baixando v... ${data.percent}%`; sub.textContent = `${data.transferred} MB / ${data.total} MB`;
    progress.style.display = 'block'; progText.textContent = `${data.percent}%`; progBar.style.width = `${data.percent}%`;
    btnLabel.textContent = 'Baixando...'; btn.disabled = true; bar.style.display = 'flex';
  } else if (data.status === 'downloaded') {
    _updaterState = 'downloaded';
    title.textContent = `✅ Versão v${data.version} pronta!`; sub.textContent = 'Download concluído. Clique para reiniciar.';
    progBar.style.width = '100%'; progText.textContent = 'Concluído!'; btnLabel.textContent = 'Instalar e Reiniciar'; btn.disabled = false; bar.style.display = 'flex';
  } else if (data.status === 'error') {
    _updaterState = 'idle';
    title.textContent = '⚠️ Erro ao verificar atualizações'; sub.textContent = data.message || 'Tente novamente mais tarde.';
    progress.style.display = 'none'; btn.style.display = 'none'; bar.style.display = 'flex';
    setTimeout(() => { bar.style.display = 'none'; btn.style.display = 'inline-flex'; }, 5000);
  }
}
async function handleUpdate() {
  const btn = document.getElementById('btnUpdate');
  const btnLabel = document.getElementById('btnUpdateLabel');

  if (_updaterState === 'available') {
    // Bloqueia o botão imediatamente para evitar cliques duplos
    btn.disabled = true;
    btnLabel.textContent = 'Iniciando download...';
    _updaterState = 'downloading'; // Antecipa o estado para evitar re-cliques

    try {
      await window.electronAPI.invoke('updater:download');
      // O progresso real virá via handleUpdaterEvent (download-progress / update-downloaded)
    } catch (err) {
      // Se falhar, volta ao estado anterior
      _updaterState = 'available';
      btn.disabled = false;
      btnLabel.textContent = 'Atualizar Agora';
      document.getElementById('updateBarSub').textContent = 'Erro ao baixar. Tente novamente.';
    }

  } else if (_updaterState === 'downloaded') {
    // Instalar e reiniciar — sem confirm() que congela o Electron
    btn.disabled = true;
    btnLabel.textContent = 'Reiniciando...';
    // Pequeno delay para a UI atualizar antes do processo fechar
    setTimeout(() => {
      window.electronAPI.invoke('updater:install');
    }, 300);
  }
}

async function checkForUpdates() {
  const bar = document.getElementById('updateBar');
  const title = document.getElementById('updateBarTitle');
  const sub = document.getElementById('updateBarSub');
  const btn = document.getElementById('btnUpdate');
  const progress = document.getElementById('updateProgress');

  // Mostrar barra temporária de "verificando..."
  title.textContent = '🔄 Verificando atualizações...';
  sub.textContent = 'Aguarde, consultando servidor de releases.';
  progress.style.display = 'none';
  btn.style.display = 'none';
  bar.style.display = 'flex';

  try {
    await window.electronAPI.invoke('updater:check');
    // O resultado real virá via SSE (handleUpdaterEvent)
  } catch (err) {
    title.textContent = '⚠️ Não foi possível verificar';
    sub.textContent = 'Aplicação em modo desenvolvimento ou sem conexão.';
    setTimeout(() => { bar.style.display = 'none'; btn.style.display = 'inline-flex'; }, 4000);
  }
}
