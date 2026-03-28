// ============================================================
// AVA Kroton — Automação Inteligente de Questionários
// Playwright + Groq API (LLaMA 3 70B)
// Dashboard Visual + Persistência + Navegação Dinâmica
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const Groq = require('groq-sdk');
const chalk = require('chalk');
const Table = require('cli-table3');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// ══════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════

const ui = {
  banner() {
    console.log('');
    console.log(chalk.bgCyan.black.bold('                                                        '));
    console.log(chalk.bgCyan.black.bold('   🎓  AVA KROTON — AUTOMAÇÃO DE QUESTIONÁRIOS          '));
    console.log(chalk.bgCyan.black.bold('   🤖  Powered by Groq AI (LLaMA 3 70B)                '));
    console.log(chalk.bgCyan.black.bold('                                                        '));
    console.log('');
  },

  status(label, value, icon = '•') {
    console.log(chalk.gray(`  ${icon} `) + chalk.white.bold(label + ': ') + chalk.cyan(value));
  },

  success(msg) { console.log(chalk.green('  ✅ ') + chalk.green.bold(msg)); },
  info(msg) { console.log(chalk.cyan('  ℹ  ') + chalk.white(msg)); },
  warn(msg) { console.log(chalk.yellow('  ⚠  ') + chalk.yellow(msg)); },
  error(msg) { console.log(chalk.red('  ❌ ') + chalk.red.bold(msg)); },

  question(n, total, text, answer) {
    const progress = chalk.gray(`[${n}/${total || '?'}]`);
    const q = chalk.white(text.substring(0, 65));
    const a = chalk.green.bold(answer);
    console.log(`  ${progress} ${q}... → ${a}`);
  },

  divider() { console.log(chalk.gray('  ' + '─'.repeat(54))); },

  table(title, items) {
    console.log('');
    const table = new Table({
      head: [chalk.cyan.bold('#'), chalk.cyan.bold(title)],
      colWidths: [6, 54],
      style: { head: [], border: ['gray'] },
    });
    items.forEach((item, i) => {
      table.push([chalk.yellow.bold(String(i + 1)), item.substring(0, 52)]);
    });
    console.log(table.toString());
    console.log('');
  },

  scoreCard(score, time, total) {
    console.log('');
    console.log(chalk.bgGreen.black.bold('                                                        '));
    console.log(chalk.bgGreen.black.bold(`   ✅  AUTOMAÇÃO CONCLUÍDA                              `));
    console.log(chalk.bgGreen.black.bold(`   📊  Aproveitamento: ${(score + '                    ').substring(0, 20)}              `));
    console.log(chalk.bgGreen.black.bold(`   ⏱   Tempo: ${time} | Questões: ${total}                       `.substring(0, 56)));
    console.log(chalk.bgGreen.black.bold('                                                        '));
    console.log('');
  },
};

// ══════════════════════════════════════════════════════════════
// PERSISTÊNCIA (config.json)
// ══════════════════════════════════════════════════════════════

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveConfig(login, senha) {
  // Encoding básico — NÃO é criptografia real, apenas ofuscação
  const data = {
    login,
    senha: Buffer.from(senha).toString('base64'),
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function decodePassword(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function safeWait(page, timeout = 15000) {
  try { await page.waitForLoadState('networkidle', { timeout }); } catch {}
  await page.waitForLoadState('domcontentloaded');
}

async function clickByText(page, text, { retries = 3, delayMs = 3000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try { const b = page.getByRole('button', { name: text }); await b.waitFor({ timeout: 8000 }); await b.click(); return; } catch {}
    try { const l = page.getByRole('link', { name: text }); await l.waitFor({ timeout: 3000 }); await l.click(); return; } catch {}
    try { await page.click(`text="${text}"`, { timeout: 3000 }); return; } catch {
      if (i < retries - 1) await delay(delayMs);
    }
  }
  throw new Error(`Elemento não encontrado: "${text}"`);
}

async function screenshotOnError(page, name = 'error_nav') {
  try {
    const p = path.join(__dirname, `${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    ui.warn(`Screenshot salvo: ${p}`);
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// GROQ API
// ══════════════════════════════════════════════════════════════

async function askGroq(groqClient, disciplina, questionText, alternatives) {
  const prompt = `Você é um especialista acadêmico na disciplina "${disciplina}". Analise a pergunta e alternativas. Responda APENAS com a letra correta no formato: "Resposta: X"

Pergunta: ${questionText}

Alternativas:
${alternatives.join('\n')}`;

  try {
    const res = await groqClient.chat.completions.create({
      model: 'llama3-70b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 50,
    });
    const answer = res.choices[0]?.message?.content || '';
    const m = answer.match(/Resposta:\s*([A-Ea-e])/i) || answer.match(/^([A-Ea-e])\b/i);
    return m ? m[1].toLowerCase() : 'a';
  } catch { return 'a'; }
}

// ══════════════════════════════════════════════════════════════
// ETAPA 1: LOGIN
// ══════════════════════════════════════════════════════════════

async function doLogin(page, userAuth) {
  ui.info('Acessando portal de login Kroton...');
  await page.goto('https://login.kroton.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await safeWait(page);

  // Campo de usuário
  const userSels = [
    'input[id="username"]', 'input[name="username"]', 'input[name="login"]',
    'input[name="email"]', 'input[type="email"]', '#username',
    'input[placeholder*="RA"]', 'input[placeholder*="CPF"]',
  ];
  let userField = null;
  for (const s of userSels) {
    try { userField = await page.waitForSelector(s, { timeout: 4000 }); if (userField) break; } catch {}
  }
  if (!userField) userField = await page.locator('input:visible').first();
  await userField.fill(userAuth.login);
  ui.status('Usuário', userAuth.login, '👤');

  // Senha (pode ser 2 etapas)
  const passSels = ['input[type="password"]', 'input[name="password"]', 'input[id="password"]'];
  let passField = null;
  for (const s of passSels) {
    try { passField = await page.waitForSelector(s, { timeout: 3000 }); if (passField) break; } catch {}
  }
  if (!passField) {
    ui.info('Login em 2 etapas — avançando...');
    try { await page.click('button[type="submit"]', { timeout: 5000 }); } catch { await userField.press('Enter'); }
    await safeWait(page);
    await delay(2000);
    for (const s of passSels) {
      try { passField = await page.waitForSelector(s, { timeout: 5000 }); if (passField) break; } catch {}
    }
  }
  if (!passField) throw new Error('Campo de senha não encontrado.');
  await passField.fill(userAuth.senha);
  ui.status('Senha', '••••••••', '🔑');

  // Submit
  try { await page.click('button[type="submit"]', { timeout: 5000 }); } catch { await passField.press('Enter'); }

  // Aguardar SSO
  ui.info('Aguardando SSO Kroton...');
  try { await page.waitForURL('**/cursos**', { timeout: 30000, waitUntil: 'networkidle' }); }
  catch { ui.warn(`SSO redireciou para: ${page.url()}`); }

  ui.info('Estabilizando sessão (5s)...');
  await delay(5000);
  await safeWait(page);
  ui.success(`Login OK → ${page.url()}`);
}

// ══════════════════════════════════════════════════════════════
// ETAPA 2: CLICAR EM "ESTUDAR" (Navegar ao AVA)
// ══════════════════════════════════════════════════════════════

async function clickEstudar(page) {
  ui.info('Procurando botão "Estudar"...');
  await delay(3000);
  await safeWait(page);

  // Estratégia 1: Texto direto
  try {
    const btn = page.locator('text=/Estudar/i').first();
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    ui.success('Botão "Estudar" clicado.');
    await delay(5000);
    await safeWait(page);
    return;
  } catch {}

  // Estratégia 2: Role button/link
  try {
    const btn = page.getByRole('link', { name: /estudar/i });
    await btn.waitFor({ timeout: 5000 });
    await btn.click();
    ui.success('"Estudar" (link) clicado.');
    await delay(5000);
    await safeWait(page);
    return;
  } catch {}

  // Estratégia 3: title attribute
  try {
    await page.click('[title="Estudar"], [title="estudar"]', { timeout: 5000 });
    ui.success('"Estudar" (title) clicado.');
    await delay(5000);
    await safeWait(page);
    return;
  } catch {}

  // Estratégia 4: href com /ava ou /lms
  try {
    await page.click('a[href*="ava"], a[href*="lms"], a[href*="estudar"]', { timeout: 5000 });
    ui.success('"Estudar" (href) clicado.');
    await delay(5000);
    await safeWait(page);
    return;
  } catch {}

  // Falhou — screenshot + fallback URL
  ui.warn('"Estudar" não encontrado. Tirando screenshot...');
  await screenshotOnError(page, 'error_estudar');
  ui.info('Fallback: navegando via URL direta...');
  await page.goto('https://www.avaeduc.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(5000);
  await safeWait(page);
}

// ══════════════════════════════════════════════════════════════
// ETAPA 3: DESCOBERTA DINÂMICA (Disciplinas, Unidades, Seções)
// ══════════════════════════════════════════════════════════════

async function discoverDisciplines(page) {
  ui.info('Carregando disciplinas (8s)...');
  await delay(8000);
  await safeWait(page);

  const disciplines = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const sels = [
      '.course-card .course-title', '.course-card .title', '.course-card h4', '.course-card h3',
      '.course-card a', '.card .card-title', '.card-title a', '.coursename', '.course_title',
      '.multiline', 'h3.coursename a', 'h4.coursename a', '.dashboard-card .card-title',
    ];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = el.textContent.trim();
        if (t.length > 10 && t.length < 200 && !seen.has(t)) { seen.add(t); results.push(t); }
      });
    }
    if (results.length === 0) {
      document.querySelectorAll('a').forEach((a) => {
        const t = a.textContent.trim();
        const h = a.href || '';
        if (t.length > 15 && t.length < 200 && !t.match(/Sair|Perfil|Página inicial|Painel/i) &&
            (h.includes('course') || h.includes('disciplina') || t.match(/[A-ZÀ-Ú].*[a-zà-ú]/))) {
          if (!seen.has(t)) { seen.add(t); results.push(t); }
        }
      });
    }
    return results;
  });

  ui.success(`${disciplines.length} disciplina(s) encontrada(s).`);
  return disciplines;
}

async function discoverItems(page, pattern, label) {
  await delay(3000);
  await safeWait(page);
  const items = await page.evaluate((pat) => {
    const results = [];
    const seen = new Set();
    const re = new RegExp(pat, 'i');
    document.querySelectorAll('a, button, h3, h4, h5, span, div, li').forEach((el) => {
      const t = el.textContent.trim();
      if (re.test(t) && t.length > 3 && t.length < 150 && !seen.has(t)) {
        seen.add(t);
        results.push(t);
      }
    });
    return results;
  }, pattern);
  ui.success(`${items.length} ${label} encontrada(s).`);
  return items;
}

async function clickOnItem(page, name) {
  try {
    const loc = page.locator(`text=${name}`).first();
    await loc.waitFor({ timeout: 10000 });
    await loc.click();
  } catch {
    const kw = name.split(/\s+/).filter((w) => w.length > 2)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    await page.locator(`text=/${kw}/i`).first().click();
  }
  await safeWait(page);
  await delay(2000);
}

async function selectDiscipline(page, name) {
  ui.info(`Acessando: "${name}"...`);
  await clickOnItem(page, name);
  await delay(2000);
  ui.info('Clicando em "ACESSAR A DISCIPLINA"...');
  await clickByText(page, 'ACESSAR A DISCIPLINA');
  await safeWait(page);
  await delay(3000);
  ui.success('Disciplina acessada.');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 4: RESOLVER QUESTÕES
// ══════════════════════════════════════════════════════════════

async function solveQuiz(page, groqClient, disciplina) {
  const log = [];
  await delay(2000);
  await safeWait(page);

  const allQue = await page.locator('.que').all();

  const processQuestion = async (container, n, total) => {
    let text = '';
    try { text = (await container.locator('.qtext').first().innerText()).trim(); } catch {}
    if (!text) try { text = (await container.locator('.formulation p').first().innerText()).trim(); } catch {}
    if (!text) return;

    const alts = [];
    for (const l of await container.locator('.answer label').all()) {
      const t = await l.innerText(); if (t.trim()) alts.push(t.trim());
    }
    if (!alts.length) return;

    const letter = await askGroq(groqClient, disciplina, text, alts);
    ui.question(n, total, text, letter.toUpperCase());

    const idx = letter.charCodeAt(0) - 97;
    const radios = await container.locator('input[type="radio"]').all();
    if (radios.length > idx) await radios[idx].click({ force: true });
    else if (radios.length > 0) await radios[0].click({ force: true });

    log.push({ question: n, text: text.substring(0, 120), answer: letter.toUpperCase() });
  };

  if (allQue.length > 1) {
    ui.info(`${allQue.length} questões na página.`);
    ui.divider();
    for (let i = 0; i < allQue.length; i++) {
      await processQuestion(allQue[i], i + 1, allQue.length);
    }
  } else {
    ui.info('Formato paginado.');
    ui.divider();
    let n = 0;
    while (true) {
      n++;
      await delay(2000);
      await safeWait(page);
      const text = await (async () => {
        try { return (await page.locator('.qtext').first().innerText()).trim(); } catch { return ''; }
      })();
      if (!text) { ui.info('Fim das questões.'); break; }
      await processQuestion(page, n, null);
      try {
        const next = page.locator(
          'input[type="submit"][value*="Próxima"], input[value*="próxima"], ' +
          'input[name="next"], button:has-text("Próxima"), ' +
          'button:has-text("Avançar"), input[value*="Avançar"]'
        ).first();
        if (await next.isVisible().catch(() => false)) { await next.click(); await safeWait(page); }
        else break;
      } catch { break; }
    }
  }

  ui.divider();
  return log;
}

// ══════════════════════════════════════════════════════════════
// ETAPA 5: FINALIZAÇÃO
// ══════════════════════════════════════════════════════════════

async function finishQuiz(page) {
  ui.info('Finalizando questionário...');
  await delay(2000);

  ui.status('Passo', '1/3 — Finalizar tentativa', '📝');
  try { await clickByText(page, 'Finalizar tentativa'); }
  catch { await page.click('input[type="submit"][value*="Finalizar"], button:has-text("Finalizar")', { timeout: 10000 }); }
  await safeWait(page); await delay(2000);

  ui.status('Passo', '2/3 — Enviar tudo e terminar', '📝');
  try { await clickByText(page, 'Enviar tudo e terminar'); }
  catch { await page.click('text=/Enviar tudo e terminar/i', { timeout: 10000 }); }
  await safeWait(page); await delay(2000);

  ui.status('Passo', '3/3 — Confirmação no modal', '📝');
  try {
    await page.waitForSelector('.modal, .moodle-dialogue, [role="dialog"]', { timeout: 8000 });
    const btn = page.locator(
      '.modal button:has-text("Enviar tudo e terminar"), ' +
      '[role="dialog"] button:has-text("Enviar tudo e terminar"), ' +
      '.moodle-dialogue button:has-text("Enviar tudo e terminar")'
    ).first();
    await btn.waitFor({ timeout: 5000 });
    await btn.click();
  } catch {
    const btns = await page.locator('button:has-text("Enviar tudo e terminar")').all();
    if (btns.length) await btns[btns.length - 1].click();
    else await page.click('input[type="submit"][value*="Enviar tudo"]', { timeout: 5000 });
  }
  await safeWait(page); await delay(3000);
  ui.success('Questionário enviado!');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 6: NOTA
// ══════════════════════════════════════════════════════════════

async function captureScore(page) {
  await delay(3000); await safeWait(page);
  for (const sel of ['.grade', '.overallgrade', '.quizgradefeedback', 'th:has-text("Nota") + td']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) return (await el.innerText()).trim();
    } catch {}
  }
  try {
    const body = await page.locator('body').innerText();
    const m = body.match(/(\d+[,.]\d+)\s*(?:de|\/)\s*(\d+[,.]\d+)/i);
    if (m) return `${m[1]} de ${m[2]}`;
    const p = body.match(/(\d+[,.]\d+)\s*%/);
    if (p) return `${p[1]}%`;
  } catch {}
  return 'Não identificado';
}

// ══════════════════════════════════════════════════════════════
// FUNÇÃO EXPORTÁVEL (para Express / Next.js)
// ══════════════════════════════════════════════════════════════

async function runAutomation(userAuth, targetData, apiKey, options = {}) {
  const { headless = true, silent = false, slowMo = 0 } = options;
  const startTime = Date.now();
  const groqClient = new Groq({ apiKey });
  let browser;
  try {
    browser = await chromium.launch({ headless, slowMo });
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);

    await doLogin(page, userAuth);
    await clickEstudar(page);
    await selectDiscipline(page, targetData.nomeDisciplina);
    if (targetData.unidade) await clickOnItem(page, targetData.unidade);
    if (targetData.secao) await clickOnItem(page, targetData.secao);
    if (targetData.atividade) await clickOnItem(page, targetData.atividade);

    await clickByText(page, 'TENTAR RESPONDER O QUESTIONÁRIO AGORA');
    await safeWait(page);

    const answers = await solveQuiz(page, groqClient, targetData.nomeDisciplina);
    await finishQuiz(page);
    const score = await captureScore(page);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return { status: 'success', aproveitamento: score, tempo_execucao: `${elapsed}s`, questoes: answers };
  } catch (err) {
    return { status: 'error', aproveitamento: '0%', tempo_execucao: `${((Date.now() - startTime) / 1000).toFixed(1)}s`, erro: err.message, questoes: [] };
  } finally {
    if (browser) { await delay(2000); await browser.close(); }
  }
}

module.exports = { runAutomation, doLogin, clickEstudar, discoverDisciplines, discoverItems };

// ══════════════════════════════════════════════════════════════
// MODO CLI — Fluxo Interativo com Persistência
// ══════════════════════════════════════════════════════════════

if (require.main === module) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(chalk.yellow('  → ') + q, r));

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) { ui.error('Configure GROQ_API_KEY no .env'); process.exit(1); }

  (async () => {
    ui.banner();

    // ── PERSISTÊNCIA: Verificar config.json ──
    let login, senha;
    const saved = loadConfig();

    if (saved && saved.login) {
      ui.status('Conta salva', saved.login, '💾');
      const useSaved = await ask(`Logar como ${chalk.cyan.bold(saved.login)}? (S/n): `);
      if (!useSaved || useSaved.toLowerCase() === 's' || useSaved.toLowerCase() === 'sim' || useSaved === '') {
        login = saved.login;
        senha = decodePassword(saved.senha);
        ui.success('Credenciais carregadas.');
      } else {
        login = await ask('Login (RA/Email): ');
        senha = await ask('Senha: ');
      }
    } else {
      login = await ask('Login (RA/Email): ');
      senha = await ask('Senha: ');
    }

    if (!login || !senha) { ui.error('Login e senha obrigatórios.'); process.exit(1); }

    // Salvar credenciais?
    if (!saved || saved.login !== login) {
      const wantSave = await ask('Salvar credenciais para próximos acessos? (S/n): ');
      if (!wantSave || wantSave.toLowerCase() === 's' || wantSave.toLowerCase() === 'sim' || wantSave === '') {
        saveConfig(login, senha);
        ui.success('Credenciais salvas em config.json');
      }
    }

    console.log('');
    ui.divider();
    ui.info('Iniciando navegador...');
    ui.divider();

    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);

    try {
      // ── 1. LOGIN ──
      await doLogin(page, { login, senha });

      // ── 2. CLICAR EM "ESTUDAR" ──
      await clickEstudar(page);

      // ── 3. DESCOBRIR E SELECIONAR DISCIPLINA ──
      const disciplines = await discoverDisciplines(page);
      if (!disciplines.length) {
        ui.error('Nenhuma disciplina encontrada.');
        await screenshotOnError(page, 'error_disciplinas');
        process.exit(1);
      }
      ui.table('Disciplinas', disciplines);

      const discN = await ask('Número da disciplina: ');
      const discIdx = parseInt(discN, 10) - 1;
      if (isNaN(discIdx) || discIdx < 0 || discIdx >= disciplines.length) {
        ui.error('Número inválido.'); process.exit(1);
      }
      const chosenDisc = disciplines[discIdx];
      ui.success(`Disciplina: ${chosenDisc}`);

      await selectDiscipline(page, chosenDisc);

      // ── 4. DESCOBRIR E SELECIONAR UNIDADE ──
      const units = await discoverItems(page, 'Unidade.*Ensino.*\\d+|U\\d+\\s*[-–]', 'unidade(s)');
      let chosenUnit = null;
      if (units.length > 0) {
        ui.table('Unidades', units);
        const unitN = await ask('Número da unidade: ');
        const unitIdx = parseInt(unitN, 10) - 1;
        if (unitIdx >= 0 && unitIdx < units.length) {
          chosenUnit = units[unitIdx];
          ui.success(`Unidade: ${chosenUnit}`);
          await clickOnItem(page, chosenUnit);
        }
      }

      // ── 5. DESCOBRIR E SELECIONAR SEÇÃO ──
      let chosenSection = null;
      if (chosenUnit) {
        const sections = await discoverItems(page, 'U\\d+.*Seção|Seção\\s*\\d+', 'seção(ões)');
        if (sections.length > 0) {
          ui.table('Seções', sections);
          const secN = await ask('Número da seção: ');
          const secIdx = parseInt(secN, 10) - 1;
          if (secIdx >= 0 && secIdx < sections.length) {
            chosenSection = sections[secIdx];
            ui.success(`Seção: ${chosenSection}`);
            await clickOnItem(page, chosenSection);
          }
        }
      }

      // ── 6. DESCOBRIR E SELECIONAR ATIVIDADE ──
      let chosenActivity = null;
      if (chosenSection) {
        const activities = await discoverItems(page, 'Atividade|Questionário|Quiz|Avaliação|Diagnóstic', 'atividade(s)');
        if (activities.length > 0) {
          ui.table('Atividades', activities);
          const actN = await ask('Número da atividade: ');
          const actIdx = parseInt(actN, 10) - 1;
          if (actIdx >= 0 && actIdx < activities.length) {
            chosenActivity = activities[actIdx];
            ui.success(`Atividade: ${chosenActivity}`);
            await clickOnItem(page, chosenActivity);
          }
        }
      }

      rl.close();

      // ── 7. DASHBOARD DE STATUS ──
      console.log('');
      ui.divider();
      ui.status('Conexão', 'Ativa', '🟢');
      ui.status('Disciplina', chosenDisc.substring(0, 45), '📚');
      ui.status('Unidade', chosenUnit || 'Auto', '📖');
      ui.status('Seção', chosenSection || 'Auto', '📄');
      ui.status('Atividade', chosenActivity || 'Auto', '🎯');
      ui.status('IA', 'Groq LLaMA 3 70B', '🤖');
      ui.divider();
      console.log('');

      // ── 8. INICIAR QUESTIONÁRIO ──
      ui.info('Iniciando questionário...');
      await clickByText(page, 'TENTAR RESPONDER O QUESTIONÁRIO AGORA');
      await safeWait(page);

      // ── 9. RESOLVER ──
      const groqClient = new Groq({ apiKey: groqKey });
      const answers = await solveQuiz(page, groqClient, chosenDisc);

      // ── 10. FINALIZAR E CAPTURAR NOTA ──
      await finishQuiz(page);
      const score = await captureScore(page);

      ui.scoreCard(score, '—', answers.length);

      console.log(chalk.gray('\n  📋 Resultado JSON:'));
      console.log(chalk.gray(JSON.stringify({
        status: 'success', disciplina: chosenDisc,
        aproveitamento: score, questoes: answers,
      }, null, 2)));

    } catch (err) {
      ui.error(`${err.message}`);
      console.error(err.stack);
      await screenshotOnError(page, 'error_fatal');
    } finally {
      await delay(3000);
      await browser.close();
      process.exit(0);
    }
  })();
}
