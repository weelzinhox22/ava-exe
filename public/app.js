// ============================================================
// AVA Kroton — Frontend Dashboard Logic
// ============================================================

// ── Variables ───────────────────────────────────────────────
let sseSource = null;
let currentDisciplina = null;
let currentUnidade = null;

// ── DOM Elements ────────────────────────────────────────────
const els = {
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  btnLogout: document.getElementById('btnLogout'),
  logConsole: document.getElementById('logConsole'),
  
  steps: document.querySelectorAll('.step'),
  sectionLogin: document.getElementById('sectionLogin'),
  sectionDisciplinas: document.getElementById('sectionDisciplinas'),
  sectionNav: document.getElementById('sectionNav'),
  sectionResult: document.getElementById('sectionResult'),
  
  inputLogin: document.getElementById('inputLogin'),
  inputSenha: document.getElementById('inputSenha'),
  checkSave: document.getElementById('checkSave'),
  btnLogin: document.getElementById('btnLogin'),
  
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

// ── Init ────────────────────────────────────────────────────
window.onload = async () => {
  connectSSE();
  checkCookies();
  try {
    const creds = await window.electronAPI.storeGet('credentials');
    if (creds && creds.login) {
      els.inputLogin.value = creds.login;
      els.inputSenha.placeholder = "Senha salva (protegida)";
      addLog('[ORYON] Credenciais carregadas do cofre. Motor 120B pronto.');
    }
    const groqKey = await window.electronAPI.storeGet('groqKey');
    if (groqKey) {
      document.getElementById('inputGroqKey').placeholder = "Chave da API salva no Desktop";
    }
    const showBrowser = await window.electronAPI.storeGet('showBrowser');
    if (showBrowser !== undefined) {
      document.getElementById('checkShowBrowser').checked = showBrowser;
    }
    
    const licenseKey = await window.electronAPI.storeGet('licenseKey');
    if (licenseKey) {
      document.getElementById('inputLicense').value = licenseKey;
      addLog('[ORYON] Verificando licença salva em background...');
      const lic = await window.electronAPI.invoke('auto:validateLicense', licenseKey);
      if (lic && lic.success) {
        document.getElementById('licenseBadge').style.display = 'flex';
        document.getElementById('licenseText').innerText = `Premium (Até ${lic.expires_at})`;
        document.getElementById('btnRenovar').style.display = 'block';
      } else {
        addLog('[ORYON] Licença de background inválida ou expirada.');
      }
    }
  } catch (err) {
    console.error('Falha carregando config nativa:', err);
  }
};

// ── Cookies & LGPD ────────────────────────────────────────────
async function checkCookies() {
  const accepted = await window.electronAPI.storeGet('lgpd_accepted');
  if (accepted) {
    document.getElementById('cookieBar').style.display = 'none';
  }
}

async function acceptCookies() {
  await window.electronAPI.storeSet('lgpd_accepted', true);
  document.getElementById('cookieBar').style.display = 'none';
  addLog('[ORYON] Consentimento LGPD registrado.');
}

// ── Link Privacidade IPC ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const linkPrivacidade = document.getElementById('link-privacidade');
  if (linkPrivacidade) {
    linkPrivacidade.addEventListener('click', (e) => {
      e.preventDefault();
      window.electronAPI.send('open-privacy');
    });
  }
});

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

// ── Auto-Updater UI ───────────────────────────────────
// Estado interno do updater
let _updaterState = 'idle'; // idle | available | downloading | downloaded

function handleUpdaterEvent(data) {
  const bar      = document.getElementById('updateBar');
  const title    = document.getElementById('updateBarTitle');
  const sub      = document.getElementById('updateBarSub');
  const progress = document.getElementById('updateProgress');
  const progText = document.getElementById('updateProgressText');
  const progBar  = document.getElementById('updateProgressBar');
  const btnLabel = document.getElementById('btnUpdateLabel');
  const btn      = document.getElementById('btnUpdate');
  if (!bar) return;

  if (data.status === 'available') {
    _updaterState = 'available';
    title.textContent = `⚡ Nova versão v${data.version} disponível!`;
    sub.textContent   = 'Baixe e instale agora sem precisar fechar o software.';
    progress.style.display = 'none';
    btnLabel.textContent   = 'Atualizar Agora';
    btn.disabled = false;
    bar.style.display = 'flex';
    addLog(`[ORYON] ⚡ Atualização disponível: v${data.version}. Clique em "Atualizar Agora" na barra acima.`);

  } else if (data.status === 'downloading') {
    _updaterState = 'downloading';
    title.textContent = `⏬ Baixando v... ${data.percent}%`;
    sub.textContent   = `${data.transferred} MB / ${data.total} MB — ${data.speed} KB/s`;
    progress.style.display = 'block';
    progText.textContent   = `${data.percent}% — ${data.transferred}/${data.total} MB`;
    progBar.style.width    = `${data.percent}%`;
    btnLabel.textContent   = 'Baixando...';
    btn.disabled = true;
    bar.style.display = 'flex';

  } else if (data.status === 'downloaded') {
    _updaterState = 'downloaded';
    title.textContent = `✅ Versão v${data.version} pronta!`;
    sub.textContent   = 'Download concluído. Clique para instalar e reiniciar o app.';
    progBar.style.width    = '100%';
    progText.textContent   = 'Concluído!';
    btnLabel.textContent   = 'Instalar e Reiniciar';
    btn.disabled = false;
    bar.style.display = 'flex';
    addLog('[ORYON] ✅ Download da atualização concluído! Clique em "Instalar e Reiniciar" quando quiser.');

  } else if (data.status === 'error') {
    _updaterState = 'idle';
    addLog(`[AVISO] Falha no updater: ${data.message}`);
  }
}

async function handleUpdate() {
  if (_updaterState === 'available') {
    // Iniciar download
    await window.electronAPI.updaterDownload();
    _updaterState = 'downloading';
    document.getElementById('btnUpdateLabel').textContent = 'Baixando...';
    document.getElementById('btnUpdate').disabled = true;

  } else if (_updaterState === 'downloaded') {
    // Instalar e reiniciar
    if (confirm('O app vai reiniciar para aplicar a atualização. Deseja continuar?')) {
      window.electronAPI.updaterInstall();
    }
  }
}

function addLog(text) {
  const line = document.createElement('div');
  line.className = 'log-line';
  
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}]`;
  
  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  
  // Detecção por texto ao invés de emojis
  const lower = text.toLowerCase();
  if (lower.includes('[sucesso]') || lower.includes('✅') || text.includes('🏆') || lower.includes('[oryon] resposta processada')) {
    msgSpan.classList.add('success');
  } else if (lower.includes('[erro]') || lower.includes('[aviso]') || lower.includes('falha') || text.includes('❌') || text.includes('⚠️')) {
    msgSpan.classList.add('error');
  } else if (lower.includes('[oryon]') || lower.includes('motor') || text.includes('⚡') || text.includes('🔍')) {
    msgSpan.classList.add('ai');
  }
  
  msgSpan.innerHTML = text; // Permite renderizar tags <i> do Phosphor
  
  line.appendChild(timeSpan);
  line.appendChild(msgSpan);
  els.logConsole.appendChild(line);
  els.logConsole.scrollTop = els.logConsole.scrollHeight;
}

function clearLogs() {
  els.logConsole.innerHTML = '';
}

// ── UI Helpers ──────────────────────────────────────────────
function showStep(stepNum) {
  els.steps.forEach(s => {
    const num = parseInt(s.dataset.step);
    if (num < stepNum) {
      s.classList.add('done');
      s.classList.remove('active');
    } else if (num === stepNum) {
      s.classList.add('active');
      s.classList.remove('done');
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
  card.innerHTML = `
    <div class="item-num">${index + 1}</div>
    <div class="item-name">${text}</div>
  `;
  let _isLoading = false;
  card.addEventListener('click', async () => {
    if (_isLoading) return; // Guard contra duplo clique durante carregamento
    const parent = card.parentElement;
    parent.querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    _isLoading = true;
    card.style.opacity = '0.7';
    card.style.pointerEvents = 'none';
    try {
      await onclick();
    } finally {
      _isLoading = false;
      card.style.opacity = '';
      card.style.pointerEvents = '';
    }
  });
  return card;
}
// ── API IPC ─────────────────────────────────────────────────
async function fetchPost(channel, body = {}) {
  let ipcChannel = channel;
  if (channel.startsWith('/api/')) {
    ipcChannel = 'auto:' + channel.split('/').pop();
  }
  try {
    const result = await window.electronAPI.invoke(ipcChannel, body);
    if (result && result.error) throw new Error(result.error);
    return result;
  } catch (err) {
    let msg = err.message || String(err);
    if (msg.includes('Error invoking remote method')) {
      msg = msg.split(':').slice(2).join(':').trim();
    }
    throw new Error(msg);
  }
}

async function fetchGet(channel) {
  return fetchPost(channel, {});
}

// ── Flows ───────────────────────────────────────────────────

async function doLogin() {
  const login = els.inputLogin.value.trim();
  const senha = els.inputSenha.value;
  const save = els.checkSave.checked;
  const groqKey = document.getElementById('inputGroqKey').value;
  const showBrowser = document.getElementById('checkShowBrowser').checked;
  const licenseKey = document.getElementById('inputLicense').value.trim();
  
  if (!licenseKey) return alert('Insira a chave de licença do Studio Oryon.');
  
  if (!login || (!senha && !els.inputSenha.placeholder.includes('salva'))) {
    return alert('Preencha login e senha do portal AVA.');
  }

  els.btnLogin.disabled = true;
  els.btnLogin.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Validando Licença...';

  try {
    const lic = await window.electronAPI.invoke('auto:validateLicense', licenseKey);
    if (!lic || !lic.success) {
      throw new Error(`Acesso Negado: ${lic ? lic.error : 'Erro desconhecido.'}`);
    }
    
    await window.electronAPI.storeSet('licenseKey', licenseKey);
    document.getElementById('licenseBadge').style.display = 'flex';
    document.getElementById('licenseText').innerText = `Premium (Até ${lic.expires_at})`;
    document.getElementById('btnRenovar').style.display = 'block';

    if (groqKey) await window.electronAPI.storeSet('groqKey', groqKey);
    await window.electronAPI.storeSet('showBrowser', showBrowser);
    
    els.btnLogin.innerHTML = '<div class="spinner" style="width:14px;height:14px"></div> Autenticando Motor Nativo...';
    addLog('🟢 Iniciando injeção em ambiente Desktop isolado...');
    
    const res = await fetchPost('/api/login', { login, senha, save, showBrowser });
    if (res.success) {
      els.btnLogout.style.display = 'block';
    }
  } catch (err) {
    addLog(`❌ Falha: ${err.message}`);
    alert(err.message);
  } finally {
    els.btnLogin.disabled = false;
    els.btnLogin.innerHTML = '<i class="ph-bold ph-rocket-launch"></i> Iniciar sistema';
  }
}

async function logout() {
  try {
    await fetchPost('/api/logout', {});
    await window.electronAPI.storeSet('credentials', null); 
  } catch {}
  location.reload();
}

// ── Passo 2: Disciplinas ──
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

// ── Passo 3: Unidades / Seções / Atividades ──
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
      els.unidadesList.innerHTML = '<div style="color:var(--warning)">Nenhuma unidade detectada (tente navegar manualmente ou a página é diferente).</div>';
      // Permitir forçar resolução
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
      addLog('[AVISO] Nenhuma seção encontrada.');
      els.btnResolver.style.display = 'inline-flex'; // Talvez a ativ. esteja direto
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
      addLog('[AVISO] Nenhuma atividade identificada. Verifique no painel.');
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
          if (!confirm('Esta atividade já foi concluída. Deseja refazer para tentar melhorar a nota?')) {
            // Deselecionar visualmente (remover a classe selected)
            const cards = els.atividadesList.querySelectorAll('.item-card');
            cards.forEach(c => c.classList.remove('selected'));
            return;
          }
        }
        await fetchPost('/api/click', { name: atv });
        els.btnResolver.style.display = 'inline-flex';
      }));
    });
  } catch (err) {}
}

// ── Passo 4: Automação ──
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
        <button
          id="btnAbrirHistorico"
          onclick="abrirHistorico()"
          style="
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
            padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
            cursor: pointer; border: 1.5px solid rgba(251,191,36,0.45);
            background: linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08));
            color: #fbbf24; transition: all 0.25s ease;
          "
          onmouseover="this.style.background='linear-gradient(135deg,rgba(251,191,36,0.22),rgba(245,158,11,0.16))'; this.style.borderColor='rgba(251,191,36,0.7)'; this.style.transform='translateY(-1px)'"
          onmouseout="this.style.background='linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08))'; this.style.borderColor='rgba(251,191,36,0.45)'; this.style.transform=''"
        >
          <i class="ph-bold ph-folder-open" style="font-size:15px;"></i>
          Ver Histórico Salvo (AppData)
        </button>
      </div>
    `;
  }
}

// ── Pós-Questionário: Ações ──
async function refazerQuestionario() {
  addLog('<i class="ph-bold ph-arrows-clockwise ph-spin"></i> Solicitando nova tentativa...');
  showStep(3); // Volta para a tela de Seções onde o botão Iniciar Automação está
  els.btnResolver.style.display = 'inline-flex';
}

async function abrirHistorico() {
  const btn = document.getElementById('btnAbrirHistorico');
  if (btn) {
    btn.innerHTML = '<i class="ph-bold ph-spinner-gap" style="animation:spin 0.8s linear infinite;font-size:15px;"></i> Abrindo...';
    btn.style.pointerEvents = 'none';
  }
  try {
    await window.electronAPI.openHistorico();
    addLog('[ORYON] 📂 Pasta de Histórico aberta no Explorer.');
  } catch (e) {
    addLog(`[ERRO] Não foi possível abrir a pasta: ${e.message}`);
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="ph-bold ph-folder-open" style="font-size:15px;"></i> Ver Histórico Salvo (AppData)';
      btn.style.pointerEvents = '';
    }
  }
}

async function voltarSeccoes() {
  addLog('<i class="ph-bold ph-arrow-u-up-left"></i> Retornando para a lista de seções da unidade...');
  showStep(3);
  if (currentUnidade) {
    loadSeccoes(currentUnidade);
  } else {
    addLog('[AVISO] Unidade não encontrada em memória. Volte para disciplinas.');
  }
}

async function voltarDisciplinas() {
  addLog('<i class="ph-bold ph-house"></i> Retornando para a seleção de disciplinas...');
  await fetchPost('/api/click', { name: 'HOME', url: 'https://www.avaeduc.com.br/' }).catch(() => {});
  showStep(2);
  loadDisciplinas();
}

async function sairFechar() {
  addLog('<i class="ph-bold ph-sign-out"></i> Encerrando a sessão segura...');
  try {
    await fetchPost('/api/logout', {});
  } catch {}
  location.reload();
}

// ── Suporte à tecla Enter ──
els.inputLogin.addEventListener('keypress', e => { if (e.key === 'Enter') els.inputSenha.focus(); });
els.inputSenha.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
