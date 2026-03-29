// ============================================================
// AVA Kroton — Express API Server + SSE Logs
// ============================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const auto = require('./automation');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'user.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SSE: Clientes conectados ────────────────────────────────
let sseClients = [];

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  sseClients.forEach((res) => {
    try { res.write(`data: ${msg}\n\n`); } catch {}
  });
}

function emit(type, data) {
  broadcast(type, data);
}

// ── SSE Endpoint ────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', data: 'SSE conectado' })}\n\n`);
  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

// ── Estado da sessão ────────────────────────────────────────
let currentSession = null;
let currentDisciplina = null; // Guardará o título da disciplina selecionada

// ── Config (persistência) ───────────────────────────────────
app.get('/api/config', (req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return res.json({ saved: true, login: data.login });
    }
  } catch {}
  res.json({ saved: false });
});

app.post('/api/config', (req, res) => {
  const { login, senha } = req.body;
  const data = {
    login,
    senha: Buffer.from(senha).toString('base64'),
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

app.delete('/api/config', (req, res) => {
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
  res.json({ success: true });
});

// ── Login ───────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    let { login, senha, save } = req.body;

    // Se não veio senha, tentar carregar do config
    if (!senha && fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (cfg.login === login) {
        senha = Buffer.from(cfg.senha, 'base64').toString('utf-8');
      }
    }

    if (!login || !senha) return res.status(400).json({ error: 'Login e senha obrigatórios.' });

    // Salvar se solicitado
    if (save) {
      const data = { login, senha: Buffer.from(senha).toString('base64'), savedAt: new Date().toISOString() };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
      emit('log', `💾 Credenciais salvas em user.json.`);
    }

    // Criar sessão se não existir
    if (!currentSession) {
      const showBrowser = req.body.showBrowser !== undefined ? req.body.showBrowser : true;
      const rotateUA = req.body.rotateUA || false;
      const liteMode = req.body.liteMode || false;
      currentSession = await auto.createSession(emit, showBrowser, { rotateUA, liteMode });
    }

    const result = await auto.login(currentSession, { login, senha }, emit);
    res.json(result);
  } catch (err) {
    emit('log', `❌ Erro no login: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Disciplinas ─────────────────────────────────────────────
app.get('/api/disciplinas', async (req, res) => {
  try {
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    const list = await auto.getDisciplinas(currentSession, emit);
    res.json({ disciplinas: list });
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Selecionar disciplina ───────────────────────────────────
app.post('/api/disciplina', async (req, res) => {
  try {
    const { targetInfo } = req.body; // targetInfo = { id, titulo }
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    currentDisciplina = targetInfo.titulo;
    const result = await auto.selectDisciplina(currentSession, targetInfo, emit);
    res.json(result);
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Unidades ────────────────────────────────────────────────
app.get('/api/unidades', async (req, res) => {
  try {
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    const list = await auto.getUnidades(currentSession, emit);
    res.json({ unidades: list });
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Seções ──────────────────────────────────────────────────
app.post('/api/seccoes', async (req, res) => {
  try {
    const { unidade } = req.body;
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    const list = await auto.getSeccoes(currentSession, unidade, emit);
    res.json({ seccoes: list });
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Atividades ──────────────────────────────────────────────
app.post('/api/atividades', async (req, res) => {
  try {
    const { secao } = req.body;
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    const list = await auto.getAtividades(currentSession, secao, emit);
    res.json({ atividades: list });
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Clicar em item ──────────────────────────────────────────
app.post('/api/click', async (req, res) => {
  try {
    const { name } = req.body;
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });
    const result = await auto.clickItem(currentSession, name, emit);
    res.json(result);
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Resolver atividade ──────────────────────────────────────
app.post('/api/resolver', async (req, res) => {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(400).json({ error: 'GROQ_API_KEY não configurada no .env' });
    if (!currentSession) return res.status(400).json({ error: 'Faça login primeiro.' });

    const disciplina = req.body.disciplina || currentDisciplina || 'Geral';
    const result = await auto.resolverAtividade(currentSession, disciplina, groqKey, emit);
    res.json(result);
  } catch (err) {
    emit('log', `❌ Erro: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Encerrar sessão ─────────────────────────────────────────
app.post('/api/logout', async (req, res) => {
  try {
    if (currentSession) {
      await auto.destroySession(currentSession, emit);
      currentSession = null;
      currentDisciplina = null;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║  ⚡ Studio Oryon — Automação Educacional        ║');
  console.log(`  ║  🌐 http://localhost:${PORT}                        ║`);
  console.log('  ║  🧠 Powered By Studio Oryon                     ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});
