// ============================================================
// AVA Kroton — Core Automation Module
// Playwright + Groq SDK (openai/gpt-oss-120b)
// Exportável para Express API / Next.js / qualquer backend
// ============================================================

const { chromium } = require('playwright-core');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// ── Sessões ativas ──────────────────────────────────────────
const sessions = new Map();

function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Sessão não encontrada. Faça login primeiro.');
  return s;
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

async function screenshotToBase64(page) {
  try {
    const buf = await page.screenshot({ fullPage: true });
    return buf.toString('base64');
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
// GROQ SDK (openai/gpt-oss-120b)
// ══════════════════════════════════════════════════════════════

const GROQ_MODEL = 'openai/gpt-oss-120b';

async function askGroq(apiKey, disciplina, questionText, numberedAlts) {
  // Truncar inputs para não estourar o limite de 8000 TPM do plano free
  const questionTruncated = questionText.substring(0, 1000);
  const altsTruncated     = numberedAlts.substring(0, 800);

  const prompt = `Você é um professor de ${disciplina || 'Ensino Superior'}.
QUESTÃO: ${questionTruncated}
OPÇÕES:
${altsTruncated}

INSTRUÇÕES:
1. Identifique a alternativa correta.
2. Forneça uma breve explicação (máx 2 parágrafos).
3. Responda EXATAMENTE no formato abaixo:
RESPOSTA: [texto exato da alternativa]
EXPLICAÇÃO: [sua explicação aqui]`;

  console.log('\n--- PROMPT ENVIADO AO GROQ ---');
  console.log(prompt.substring(0, 400));
  console.log('--- FIM DO PROMPT ---\n');

  try {
    const client = new Groq({ apiKey });

    // openai/gpt-oss-120b REQUER stream:true + reasoning_effort.
    // Aumentado para 1024 tokens para acomodar a explicação.
    const stream = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, // Reduzido para maior precisão técnica
      max_completion_tokens: 1024,
      top_p: 1,
      stream: true,
      reasoning_effort: 'low',
      stop: null,
    });

    let fullText = '';
    for await (const chunk of stream) {
      fullText += chunk.choices[0]?.delta?.content || '';
    }
    
    console.log(`GROQ RAW RESPONSE:\n${fullText.trim()}`);

    // Parsing da resposta estruturada
    let answer = '';
    let explanation = 'Não informada.';

    const lines = fullText.split('\n');
    for (const line of lines) {
      if (line.toUpperCase().startsWith('RESPOSTA:')) {
        answer = line.split(/RESPOSTA:/i)[1].trim();
      } else if (line.toUpperCase().startsWith('EXPLICAÇÃO:')) {
        explanation = line.split(/EXPLICAÇÃO:/i)[1].trim();
      } else if (explanation === 'Não informada.' && answer !== '' && line.trim() !== '') {
        // Se já temos a resposta e a linha não é vazia, pode ser parte da explicação residual
        explanation = line.trim();
      }
    }

    // Se falhou o prefixo, tenta pegar o que vier antes de "EXPLICAÇÃO" como resposta
    if (!answer && fullText.includes('EXPLICAÇÃO:')) {
       answer = fullText.split(/EXPLICAÇÃO:/i)[0].replace(/RESPOSTA:/i, '').trim();
       explanation = fullText.split(/EXPLICAÇÃO:/i)[1].trim();
    }

    return { 
      answer: answer || fullText.trim(), 
      explanation: explanation 
    };
  } catch (e) {
    console.error(`[ERRO GROQ] ${e.message}`);
    return { answer: '', explanation: '' };
  }
}

// ══════════════════════════════════════════════════════════════
// SIMILARIDADE DE TEXTO (Fuzzy Match)
// ══════════════════════════════════════════════════════════════

function calcSimilarity(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!wordsA.length || !wordsB.length) return 0;
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.some(wb => wb.includes(w) || w.includes(wb))) matches++;
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

// ══════════════════════════════════════════════════════════════
// LIMPAR BANNERS, COOKIES E MODAIS
// ══════════════════════════════════════════════════════════════

async function limparBanners(page) {
  try {
    await page.evaluate(() => {
      const sels = ['.aba-cookies', '.modal-backdrop', '.cookie-banner',
        '#CybotCookiebotDialog', '#onetrust-consent-sdk', '.cc-window',
        '.gdpr-banner', '[class*="cookie"]', '[id*="cookie"]'];
      sels.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
      document.querySelectorAll('button, a, input[type="button"]').forEach(btn => {
        const t = (btn.textContent || btn.value || '').trim().toLowerCase();
        if (t === 'ok' || t === 'aceitar' || t === 'entendi' || t === 'aceito') btn.click();
      });
    });
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// FECHAR MODAL DE COMUNICADOS DO AVA (OPCIONAL / SAZONAL)
// O modal nem sempre aparece. A função faz uma verificação rápida:
// se nenhum botão for encontrado em até 5s, prossegue normalmente.
// Se o modal existir, navega pelos slides e fecha no final.
// ══════════════════════════════════════════════════════════════

async function fecharModalComunicados(page, emit = () => {}) {
  try {
    emit('log', '[ORYON] Verificando modal de comunicados do AVA (opcional)...');

    // Seletor para o botão "Próximo comunicado" (visível apenas quando há mais slides)
    const btnProximo = 'button.ng-scope[ng-click="c.nextSlide()"]';
    // Seletor para o botão de fechar (visível apenas no último slide)
    const btnFechar  = 'button.ng-scope[ng-click="c.closeModal()"]';

    // ── Detecção rápida: aguarda até 5s por QUALQUER um dos dois botões ──
    // Se nenhum aparecer, o modal não existe hoje → prossegue sem perder tempo.
    const modalPresente = await Promise.race([
      page.locator(btnProximo).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
      page.locator(btnFechar).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
    ]);

    if (!modalPresente) {
      emit('log', '[ORYON] Modal de comunicados não detectado. Prosseguindo normalmente.');
      return;
    }

    emit('log', '[ORYON] Modal de comunicados detectado! Navegando pelos slides...');

    // ── Loop pelos slides ──
    let tentativas = 0;
    const maxTentativas = 20; // Segurança: máximo de slides possíveis

    while (tentativas < maxTentativas) {
      // Tenta clicar em "Próximo comunicado" se visível
      const proximo = page.locator(btnProximo).first();
      const proximo_visivel = await proximo.isVisible().catch(() => false);

      if (proximo_visivel) {
        emit('log', `[ORYON] Modal: avançando slide (${tentativas + 1})...`);
        await proximo.click({ force: true });
        await delay(800);
        tentativas++;
        continue;
      }

      // Tenta clicar no botão de fechar (último slide)
      const fechar = page.locator(btnFechar).first();
      const fechar_visivel = await fechar.isVisible().catch(() => false);

      if (fechar_visivel) {
        emit('log', '[ORYON] Modal: último slide — fechando.');
        await fechar.click({ force: true });
        await delay(500);
        emit('log', '[SUCESSO] Modal de comunicados fechado. Prosseguindo.');
        return;
      }

      // Nenhum botão visível (modal fechou sozinho ou sumiu)
      emit('log', '[ORYON] Modal encerrado. Prosseguindo.');
      return;
    }

    emit('log', '[AVISO] Modal: limite de slides atingido. Prosseguindo mesmo assim.');
  } catch (e) {
    // Nunca bloqueia o fluxo principal por causa do modal
    emit('log', `[ORYON] Modal de comunicados ignorado (não encontrado ou erro): ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// GOOGLE SEARCH — Pesquisa Externa (Nova Aba)
// ══════════════════════════════════════════════════════════════

async function searchGoogle(context, questionText, optionsMap, emit) {
  // Limpar texto para URL
  const cleanQuery = questionText
    .replace(/\n/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 150);

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
  emit('log', `[BUSCA] [ORYON] Analisando contexto: "${cleanQuery.substring(0, 60)}..."`);

  let searchPage = null;
  try {
    searchPage = await context.newPage();
    await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await searchPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Extrair snippets de todas as fontes conhecidas do Google
    const snippets = await searchPage.evaluate(() => {
      const results = [];
      // Seletores de snippets do Google (Featured Snippet, AI Overview, resultados orgânicos)
      const sels = [
        '.hgKElc',           // Featured Snippet principal
        '.LGOjsb',          // AI Overview / SGE
        '.IZ6rdc',          // AI Overview texto
        '.V3FYCf',          // Snippet de resultado
        '.VwiC3b',          // Descrição de resultado orgânico
        '.xpdopen .ifM9O',  // Painel expandido
        '[data-attrid="wa:/description"]', // Knowledge panel
        '.LGOjsb span',    // Spans dentro do AI Overview
        '.wDYxhc',         // Knowledge card
        '.ILfuVd',         // Respostas diretas
        '.Z0LcW',          // Calculadora/resposta direta
        '.kCrYT',          // Resultado mobile
      ];
      sels.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const t = el.innerText?.trim();
          if (t && t.length > 10 && t.length < 2000) results.push(t);
        });
      });
      // Fallback: pegar os primeiros 3 resultados orgânicos
      if (results.length === 0) {
        document.querySelectorAll('#search .g').forEach((g, i) => {
          if (i < 3) {
            const t = g.innerText?.trim();
            if (t) results.push(t);
          }
        });
      }
      return results;
    });

    const allSnippetText = snippets.join(' ').toLowerCase();
    console.log(`\n--- ORYON SEARCH (${snippets.length} encontrados) ---`);
    snippets.forEach((s, i) => console.log(`  [${i}] ${s.substring(0, 100)}`));
    console.log('--- FIM ORYON SEARCH ---\n');

    // Tentar match de cada opção contra os snippets
    let bestOpt = null;
    let bestScore = 0;

    for (const opt of optionsMap) {
      // Match direto: o snippet contém o texto da opção
      if (allSnippetText.includes(opt.textoLimpo)) {
        const score = opt.textoLimpo.length / 10; // Bonus por match direto
        if (score > bestScore) {
          bestScore = score;
          bestOpt = opt;
        }
      }
      // Fuzzy match por palavras
      const simScore = calcSimilarity(opt.textoLimpo, allSnippetText);
      if (simScore > bestScore) {
        bestScore = simScore;
        bestOpt = opt;
      }
    }

    emit('log', `[BUSCA] [ORYON] Melhor validação: "${bestOpt?.textoOriginal?.substring(0, 50) || 'NENHUM'}" (score: ${(bestScore*100).toFixed(1)}%)`);

    if (bestOpt && bestScore >= 0.3) {
      return { source: 'oryon-search', answer: bestOpt, score: bestScore };
    }
    return { source: 'oryon-search', answer: null, score: 0 };

  } catch (e) {
    emit('log', `[AVISO] [ORYON] Falha na validação: ${e.message}`);
    if (searchPage) await searchPage.close().catch(() => {});
    return { source: 'google', answer: null, score: 0 };
  }
}

// ══════════════════════════════════════════════════════════════
// launchBrowserWithFallback — Tenta navegadores locais do Windows
// Ordem: Chrome → Edge → Brave → Opera
// ══════════════════════════════════════════════════════════════

async function launchBrowserWithFallback(headless, emit = () => {}) {
  const os = require('os');
  const userHome = os.homedir();

  // 1. Navegadores com canal nativo do Playwright (Chrome / Edge)
  const channels = ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      emit('log', `[BROWSER] Tentando canal: ${channel}...`);
      const browser = await chromium.launch({ channel, headless, slowMo: 200 });
      emit('log', `[BROWSER] ✅ Conectado via canal "${channel}".`);
      return browser;
    } catch (e) {
      emit('log', `[BROWSER] ❌ Canal "${channel}" indisponível: ${e.message.split('\n')[0]}`);
    }
  }

  // 2. Navegadores com caminho de executável personalizado (Brave / Opera)
  const customBrowsers = [
    {
      name: 'Brave',
      paths: [
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        path.join(userHome, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      ],
    },
    {
      name: 'Opera',
      paths: [
        path.join(userHome, 'AppData', 'Local', 'Programs', 'Opera', 'launcher.exe'),
        path.join(userHome, 'AppData', 'Local', 'Programs', 'Opera', 'opera.exe'),
        'C:\\Program Files\\Opera\\launcher.exe',
        'C:\\Program Files (x86)\\Opera\\launcher.exe',
      ],
    },
  ];

  for (const { name, paths } of customBrowsers) {
    for (const execPath of paths) {
      if (!fs.existsSync(execPath)) continue;
      try {
        emit('log', `[BROWSER] Tentando ${name} em: ${execPath}...`);
        const browser = await chromium.launch({ executablePath: execPath, headless, slowMo: 200 });
        emit('log', `[BROWSER] ✅ Conectado via ${name}.`);
        return browser;
      } catch (e) {
        emit('log', `[BROWSER] ❌ ${name} falhou: ${e.message.split('\n')[0]}`);
      }
    }
  }

  // 3. Fallback final: Chromium interno do Playwright (download necessário)
  emit('log', '[BROWSER] ⚠️ Nenhum navegador local encontrado. Tentando Chromium interno do Playwright...');
  try {
    const browser = await chromium.launch({ headless, slowMo: 200 });
    emit('log', '[BROWSER] ✅ Conectado via Chromium interno.');
    return browser;
  } catch (e) {
    throw new Error(
      `Nenhum navegador compatível encontrado no sistema.\n` +
      `Instale Google Chrome, Microsoft Edge, Brave ou Opera.\n` +
      `Detalhe técnico: ${e.message.split('\n')[0]}`
    );
  }
}

// ══════════════════════════════════════════════════════════════
// createSession — Inicia o Playwright browser
// ══════════════════════════════════════════════════════════════

// Pool de User-Agents modernos para rotação anti-fingerprint
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80',
];

function getRandomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

async function createSession(emit = () => {}, showBrowser = true, opts = {}) {
  const { rotateUA = false, liteMode = false } = opts;
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  emit('log', '[ORYON] Iniciando sistema central (Browser)...');

  const browser = await launchBrowserWithFallback(!showBrowser, emit);

  const chosenUA = rotateUA ? getRandomUA() : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
  if (rotateUA) {
    emit('log', `[STEALTH] User-Agent rotacionado: ${chosenUA.substring(0, 60)}...`);
  }

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: chosenUA,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  // Lite Mode: Bloqueia mídias pesadas independente de visibilidade
  if (liteMode) {
    await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,ico,bmp,woff,woff2,eot,ttf,otf}', route => route.abort());
    emit('log', '[ULTRA-LITE] Alto desempenho ativado: mídias e fontes bloqueadas.');
  } else if (!showBrowser) {
    // Fallback legacy: headless sem lite mode bloqueia mídias mesmo assim
    await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,css,woff,woff2,eot}', route => route.abort());
    emit('log', '[ORYON] Stealth Mode Ativado: Imagens e estilos bloqueados para otimização extrema.');
  }

  sessions.set(id, { browser, context, page, id });
  emit('log', `[SUCESSO] Sessão criada: ${id}`);
  return id;
}

// ══════════════════════════════════════════════════════════════
// login — Autentica no PDA Kroton e navega ao AVA
// ══════════════════════════════════════════════════════════════

async function login(sessionId, { login: username, senha }, emit = () => {}) {
  const session = getSession(sessionId);
  let { page, context } = session;

  emit('log', '🔐 Acessando portal de login Kroton...');
  await page.goto('https://login.kroton.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await safeWait(page);

  // Campo de usuário
  const userSels = [
    'input[id="username"]', 'input[name="username"]', 'input[name="login"]',
    'input[name="email"]', 'input[type="email"]', '#username',
  ];
  let userField = null;
  for (const s of userSels) {
    try { userField = await page.waitForSelector(s, { timeout: 4000 }); if (userField) break; } catch {}
  }
  if (!userField) userField = await page.locator('input:visible').first();
  await userField.fill(username);
  emit('log', `👤 Usuário: ${username}`);

  // Senha (pode ser 2 etapas)
  const passSels = ['input[type="password"]', 'input[name="password"]', 'input[id="password"]'];
  let passField = null;
  for (const s of passSels) {
    try { passField = await page.waitForSelector(s, { timeout: 3000 }); if (passField) break; } catch {}
  }
  
  if (!passField) {
    emit('log', '[SISTEMA] Login em 2 etapas — avançando...');
    try { await page.click('button[type="submit"]', { timeout: 5000 }); } 
    catch { 
      try { await userField.press('Enter'); } catch (e) { emit('log', `[AVISO] Erro ao pressionar Enter: ${e.message}`); } 
    }
    await delay(3000);
    await safeWait(page);
    for (const s of passSels) {
      try { passField = await page.waitForSelector(s, { timeout: 5000 }); if (passField) break; } catch {}
    }
  }
  if (!passField) throw new Error('Campo de senha não encontrado.');
  await passField.fill(senha);
  emit('log', '🔑 Senha preenchida.');

  // Submit
  try { await page.click('button[type="submit"]', { timeout: 5000 }); } 
  catch { 
    try { await passField.press('Enter'); } catch (e) { emit('log', `[AVISO] Erro final no login: ${e.message}`); } 
  }

  // Aguardar SSO
  emit('log', '⏳ Aguardando SSO Kroton...');
  try { await page.waitForURL('**/cursos**', { timeout: 30000, waitUntil: 'networkidle' }); }
  catch { emit('log', `[AVISO] SSO delay: URL atual é ${page.url()}`); }
  await delay(5000);
  await safeWait(page);
  emit('log', `[SUCESSO] Login OK → ${page.url()}`);

  // ═══ CAPTURAR RA DO PERFIL (PORTAL KROTON — ANTES DE IR AO AVA) ═══
  emit('log', '[ORYON] 🔍 Capturando RA do perfil logado no portal...');
  let capturedRA = null;
  try {
    // 1. Tentar expandir menu de avatar
    const avatarSels = ['#avatar_menu', '.avatar-menu', '[id*="avatar"]', '.user-menu', '.profile-menu'];
    for (const sel of avatarSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click({ timeout: 5000 });
          emit('log', `[ORYON] Menu de perfil expandido via: ${sel}`);
          await delay(1500);
          break;
        }
      } catch {}
    }

    // 2. Extrair RA do DOM
    capturedRA = await page.evaluate(() => {
      // Estratégia 1: Seletor exato (div.ml-3 small.ng-binding)
      const smallEls = document.querySelectorAll('div.ml-3 small.ng-binding, small.ng-binding, .ml-3 small');
      for (const el of smallEls) {
        const text = el.textContent || '';
        const match = text.match(/RA:\s*(\d+)/i);
        if (match) return match[1];
      }
      // Estratégia 2: Busca genérica
      const allEls = document.querySelectorAll('small, span, div, p, li');
      for (const el of allEls) {
        const text = el.textContent || '';
        const match = text.match(/RA:\s*(\d{5,})/i);
        if (match) return match[1];
      }
      // Estratégia 3: Body text
      const bodyMatch = (document.body.innerText || '').match(/RA:\s*(\d{5,})/i);
      return bodyMatch ? bodyMatch[1] : null;
    });

    if (capturedRA) {
      emit('log', `[SUCESSO] RA capturado do portal: ${capturedRA}`);
    } else {
      emit('log', '[AVISO] RA não encontrado no DOM do portal Kroton.');
    }
  } catch (e) {
    emit('log', `[AVISO] Falha ao capturar RA: ${e.message}`);
  }

  // Fechar modal de comunicados no Portal (se existir) antes de clicar em Estudar
  await fecharModalComunicados(page, emit);

  // ═══ CLICAR EM "ESTUDAR" E CAPTURAR NOVA ABA ═══
  emit('log', '[BUSCA] Procurando botão "Estudar"...');
  await delay(3000);
  await safeWait(page);

  let avaPage = null;

  try {
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }),
      (async () => {
        try { await page.click('text=/Estudar/i', { timeout: 8000 }); return; } catch {}
        try { await page.click('[title="Estudar"], [title="estudar"]', { timeout: 3000 }); return; } catch {}
        try { await page.click('a[href*="ava"], a[href*="lms"]', { timeout: 3000 }); return; } catch {}
        const links = await page.locator('a').all();
        for (const l of links) {
          const t = await l.innerText().catch(() => '');
          if (t.toLowerCase().includes('estudar')) { await l.click(); return; }
        }
        throw new Error('"Estudar" não encontrado');
      })(),
    ]);

    emit('log', '🆕 Nova aba detectada! Aguardando AVA carregar...');
    avaPage = newPage;
  } catch {
    emit('log', '[SISTEMA] Sem nova aba. Verificando redirecionamento na mesma aba...');
  }

  if (avaPage) {
    try { await avaPage.waitForURL('**/avaeduc.com.br/**', { timeout: 30000, waitUntil: 'networkidle' }); } catch { await delay(5000); }
    await safeWait(avaPage);
    session.page = avaPage;
    emit('log', `[SUCESSO] AVA aberto na nova aba: ${avaPage.url()}`);
  } else {
    await delay(5000);
    if (!page.url().includes('avaeduc.com.br')) {
      emit('log', '[AVISO] Fallback: navegando direto para o AVA...');
      await page.goto('https://www.avaeduc.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await delay(5000);
    }
    await safeWait(page);
    emit('log', `[SUCESSO] AVA: ${page.url()}`);
  }

  emit('status', 'logged_in');
  return { success: true, url: session.page.url(), ra: capturedRA };
}

// ══════════════════════════════════════════════════════════════
// getDisciplinas — Lista disciplinas reais no AVA
// ══════════════════════════════════════════════════════════════

async function getDisciplinas(sessionId, emit = () => {}) {
  const { page } = getSession(sessionId);

  if (!page.url().includes('avaeduc.com.br')) {
    emit('log', '[AVISO] Não está no AVA. Redirecionando...');
    await page.goto('https://www.avaeduc.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  emit('log', '[SISTEMA] Buscando "Minhas Disciplinas"...');
  await delay(8000);
  await safeWait(page);

  const disciplines = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Novo Alvo: .card-container -> .card-item
    document.querySelectorAll('.card-item').forEach(card => {
      const titleEl = card.querySelector('.card-content-title');
      const actionEl = card.querySelector('.card-action');
      if (titleEl && actionEl) {
        const titulo = titleEl.textContent.trim().replace(/\s+/g, ' ');
        const id = actionEl.getAttribute('data-rel') || `disc_${Date.now()}`;
        if (titulo.length > 5 && !seen.has(titulo)) {
          seen.add(titulo);
          results.push({ id, titulo });
        }
      }
    });

    // Fallback: Antigo sistema em cards genericos (se card-item falhar)
    if (results.length === 0) {
      const sels = ['.course-card', '.dashboard-card', '.card'];
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach(card => {
          const titleEl = card.querySelector('.course-title, .title, .card-title, h3, h4');
          const aEl = card.querySelector('a');
          if (titleEl && aEl) {
            const titulo = titleEl.textContent.trim().replace(/\s+/g, ' ');
            const id = aEl.href;
            if (titulo.length > 5 && titulo.length < 200 && !seen.has(titulo)) {
              seen.add(titulo);
              results.push({ id, titulo });
            }
          }
        });
      }
    }

    return results;
  });

  emit('log', `[SUCESSO] ${disciplines.length} disciplina(s) encontrada(s).`);
  return disciplines;
}

// ══════════════════════════════════════════════════════════════
// selectDisciplina — Clica na disciplina
// ══════════════════════════════════════════════════════════════

async function selectDisciplina(sessionId, targetInfo, emit = () => {}) {
  const { page } = getSession(sessionId);
  const { id, titulo } = targetInfo;

  emit('log', `📖 Acessando: "${titulo}"...`);

  // Estratégia 1: Navegação direta por URL (mais confiável)
  const urlValid = id && (id.includes('course/view') || id.startsWith('http'));
  if (urlValid) {
    try {
      await page.goto(id, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      emit('log', `[AVISO] Falha na navegação direta: ${e.message}`);
    }
  } else {
    // Estratégia 2: Clique no card do AVA
    let clicked = false;

    // 2a: Filtro de card + click no link interno (silencioso)
    try {
      const card = page.locator('.card-item').filter({ hasText: titulo });
      const btn = card.locator('.card-action a, .card-action button, a').first();
      await btn.waitFor({ timeout: 8000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        btn.click({ force: true })
      ]);
      clicked = true;
    } catch {}

    // 2b: Fallback por texto (silencioso — sem log de aviso pro usuário)
    if (!clicked) {
      try {
        const kw = titulo.split(/\s+/).filter((w) => w.length > 3)
          .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).slice(0, 3).join('.*');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          page.locator(`text=/${kw}/i`).first().click({ force: true, timeout: 8000 })
        ]);
      } catch {}
    }
  }

  // Aguardar estabilização e botão de acesso opcional
  await safeWait(page);
  await delay(1500);
  try {
    await clickByText(page, 'ACESSAR A DISCIPLINA');
    emit('log', '[SUCESSO] Acessando disciplina...');
  } catch {}
  await delay(2000);
  return { success: true };
}

// ══════════════════════════════════════════════════════════════
// getUnidades — Descobre unidades + expande accordions
// ══════════════════════════════════════════════════════════════

async function getUnidades(sessionId, emit = () => {}) {
  const { page } = getSession(sessionId);
  emit('log', '[ORYON] Extraindo unidades do menu lateral...');
  await delay(3000);
  await safeWait(page);

  const items = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const groups = document.querySelectorAll('#ctsidebar-container .timeline-item.group');
    
    groups.forEach(group => {
      const link = group.querySelector('a');
      if (link) {
        const text = link.textContent.trim().replace(/\s+/g, ' ');
        if (text && !seen.has(text)) {
          seen.add(text);
          results.push(text);
        }
      }
    });
    return results;
  });

  emit('log', `[ORYON] Unidades carregadas no menu lateral. (${items.length} encontradas)`);
  return items;
}

// ══════════════════════════════════════════════════════════════
// getSeccoes — Clica na unidade e descobre seções
// ══════════════════════════════════════════════════════════════

async function getSeccoes(sessionId, unidadeName, emit = () => {}) {
  const { page } = getSession(sessionId);
  emit('log', `[ORYON] Unidade selecionada: ${unidadeName}. Expandindo...`);

  try {
    // 1. Localizar o item do menu lateral pela div e pelo texto do link interno
    const unitGroup = page.locator('#ctsidebar-container .timeline-item.group').filter({ hasText: unidadeName }).first();
    const unitLink = unitGroup.locator('a').first();

    const timelineMenu = page.locator('#ctsidebar-container .timeline-item').filter({ hasText: unidadeName }).locator('~ .timeline-menu').first();

    // 2. Usar atributo aria-expanded para verificar se já está expandido
    const ariaExpanded = await unitLink.getAttribute('aria-expanded').catch(() => null);
    const isVisible = await timelineMenu.isVisible().catch(() => false);

    if (ariaExpanded !== 'true' && !isVisible) {
      // 3. Clicar para expandir
      await unitLink.click({ force: true, timeout: 5000 });
      
      // 4. Aguardar script de animação do AVA
      await delay(1000); 

      // 5. Garantir que o menu expandiu verificando a visibilidade
      await timelineMenu.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }

    // 6. Captura de seções APENAS da unidade expandida
    const sectionLinks = await timelineMenu.locator('ul li a').all();
    const items = [];
    const seen = new Set();

    for (const link of sectionLinks) {
      const text = (await link.innerText()).trim().replace(/\s+/g, ' ');
      if (text && !seen.has(text)) {
        seen.add(text);
        let url = await link.getAttribute('href').catch(() => '');
        items.push({ titulo: text, url: url });
      }
    }

    emit('log', `[ORYON] Sucesso: ${items.length} seções carregadas para escolha.`);
    return items;

  } catch (e) {
    emit('log', `[ERRO] Falha crítica na abstração do menu lateral: ${e.message}`);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// getAtividades — Clica na seção e descobre atividades com Status
// ══════════════════════════════════════════════════════════════

async function getAtividades(sessionId, secaoName, emit = () => {}) {
  const { page } = getSession(sessionId);
  emit('log', `🎯 Expandindo "${secaoName}" e buscando atividades...`);

  const extractActivities = async () => page.evaluate(() => {
    const results = [];
    const seen = new Set();
    
    // Novo padrão de Busca: Container .ct-list
    document.querySelectorAll('.ct-list').forEach(container => {
      const link = container.querySelector('h3 a');
      if (link) {
        const text = link.textContent.trim().replace(/\s+/g, ' ');
        // Filtro alvo ampliado para contemplar mais variações
        if (text.match(/Atividade|Avaliação|Questionário|Quiz|Situação|Sessão|Prova/i)) {
          if (!seen.has(text)) {
            seen.add(text);
            const url = link.href || '';
            const isDone = !!container.querySelector('i.icon-check_circle');
            const isPending = !!container.querySelector('i.icon-new_releases');
            
            let status = 'DESCONHECIDO';
            if (isDone) status = 'CONCLUÍDA';
            else if (isPending || !isDone) status = 'PENDENTE';
            
            results.push({ titulo: text, url, status });
          }
        }
      }
    });

    // Fallback: busca clássica se .ct-list mudar/falhar
    if (results.length === 0) {
      document.querySelectorAll('a, button, span, li').forEach((el) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        if (text.match(/Atividade|Avaliação|Questionário|Quiz|Situação|Sessão|Prova/i) &&
            text.length > 5 && text.length < 150 && !seen.has(text)) {
          seen.add(text);
          const parentText = el.parentElement ? el.parentElement.textContent : '';
          const status = parentText.match(/Feito|Concluíd/i) ? 'CONCLUÍDA' : 'PENDENTE';
          results.push({ titulo: text, url: el.href || '', status });
        }
      });
    }
    return results;
  });

  let items = await extractActivities();

  if (items.length > 0) {
    emit('log', `[INFO] As atividades (${items.length}) já estavam visíveis na tela.`);
  } else {
    emit('log', `🎯 Clicando para expandir "${secaoName}" e buscar atividades...`);
    try {
      await page.locator(`text="${secaoName}"`).first().click({ timeout: 5000, force: true });
    } catch {
      try {
        const kw = secaoName.split(/\s+/).filter((w) => w.length > 1)
          .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        await page.locator(`text=/${kw}/i`).first().click({ timeout: 5000, force: true });
      } catch (e) {
        emit('log', `[AVISO] Clique na seção via texto falhou, checando DOM...`);
      }
    }
    await safeWait(page);
    await delay(3000);
    
    // Fazer scroll suave para o fim da página
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(1000);
    } catch {}

    items = await extractActivities();
  }

  if (items.length === 0) {
    const dbg = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll('h3, h4, span.title, a.nav-link'))
      .map(e => e.textContent.trim().replace(/\\s+/g, ' ').substring(0, 40))
      .filter(t => t.length > 5))].slice(0, 15));
    emit('log', `[DEBUG] Atividades não encontradas. Textos DOM: ${dbg.join(' | ')}`);
  }

  emit('log', `[SUCESSO] ${items.length} atividade(s) encontrada(s).`);
  return items;
}

// ══════════════════════════════════════════════════════════════
// clickItem — Clica em um item ou navega direto pela URL
// ══════════════════════════════════════════════════════════════

async function clickItem(sessionId, target, emit = () => {}) {
  const { page } = getSession(sessionId);
  const isObj = typeof target === 'object' && target !== null;
  const name = isObj ? target.titulo || target.name : target;
  const url = isObj ? target.url : null;

  emit('log', `[SISTEMA] Acessando: "${name}"...`);

  if (url && url.startsWith('http')) {
    emit('log', `🔗 Navegando direto pela URL...`);
    await page.goto(url);
  } else {
    try {
      await page.locator(`text=${name}`).first().waitFor({ timeout: 10000 });
      await page.locator(`text=${name}`).first().click();
    } catch {
      const kw = name.split(/\s+/).filter((w) => w.length > 2)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      await page.locator(`text=/${kw}/i`).first().click();
    }
  }

  await safeWait(page);
  await delay(2000);
  return { success: true };
}

// ══════════════════════════════════════════════════════════════
// resolverAtividade — Resolve o questionário inteiro
// ══════════════════════════════════════════════════════════════

async function resolverAtividade(sessionId, disciplina, groqKey, emit = () => {}, userDataPath = '') {
  const { page } = getSession(sessionId);
  const startTime = Date.now();
  const answersLog = [];
  // Referência ao userData path para persistência segura no Windows (passado pelo main.js)
  const __userDataPath = userDataPath;

  // 0. Limpar banners ANTES de tudo
  emit('log', '🧹 Limpando banners de cookies e modais...');
  await limparBanners(page);
  await delay(500);

  // Iniciar questionário
  emit('log', '📝 Iniciando questionário...');
  try {
    // 1. Tentar primeiro continuar uma tentativa em progresso (Prioridade solicitada pelo usuário)
    const continuarSels = [
      'text=/Continuar a última tentativa/i',
      'text=/Continuar a tentativa anterior/i',
      'button:has-text("Continuar")',
      'input[value*="Continuar"]'
    ];
    
    let continuou = false;
    for (const sel of continuarSels) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click();
          emit('log', '[SISTEMA] Continuando tentativa anterior...');
          continuou = true;
          break;
        }
      } catch {}
    }

    if (!continuou) {
      // 2. Se não houver para continuar, tentar iniciar novo
      try {
        await clickByText(page, 'TENTAR RESPONDER O QUESTIONÁRIO AGORA', { timeout: 5000 });
      } catch {
        try { 
          await clickByText(page, 'Tentar responder o questionário agora', { timeout: 3000 }); 
        } catch {
          // 3. Tentar também o botão de Refazer
          const refazer = page.locator('button:has-text("Fazer uma outra tentativa")').first();
          if (await refazer.isVisible({ timeout: 2000 }).catch(() => false)) {
             await refazer.click();
             emit('log', '[SISTEMA] Iniciando nova tentativa de questionário...');
          } else {
             emit('log', '[AVISO] Nenhum botão de início/continuação detectado. Verifique se o questionário já está aberto.');
          }
        }
      }
    }
  } catch (err) {
    emit('log', `[AVISO] Falha ao gerenciar início do questionário: ${err.message}`);
  }
  
  await safeWait(page);
  await delay(1000);

  // Limpar banners de cookies e modais novamente
  await limparBanners(page);

  emit('log', '🧠 Entrando no loop de resolução principal...');
  let n = 0;

  // 1. Loop de Resolução
  while (true) {
    n++;
    await delay(500);
    emit('progress', { current: n, total: null });

    const qtextLoc = page.locator('.qtext').first();
    const isQTextVisible = await qtextLoc.isVisible().catch(() => false);
    
    if (!isQTextVisible) {
      emit('log', '📋 Fim das questões (seletor .qtext ausente).');
      break;
    }

    // Limpar banners a cada questão
    await limparBanners(page);

    emit('log', '⏬ Rolando tela para expor a questão por completo...');
    await page.locator('.formulation').first().scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await delay(500);

    try {
       await page.waitForSelector('.answer', { state: 'visible', timeout: 5000 });
    } catch {
       emit('log', '[AVISO] Nenhuma div .answer encontrada imediatamente. Tentando continuar mesmo assim.');
    }

    // 2. Extrair texto da pergunta garantindo <p> preservation via innerText
    let text = (await qtextLoc.innerText()).trim();
    if (!text) {
      emit('log', '📋 Fim das questões (texto vazio).');
      break;
    }

    // 2.1 Mapear alternativas via label de texto + ID do input
    const optionsMap = [];
    let formattedAlts = '';

    const optionRoots = await page.locator('.answer > div, .answer .r0, .answer .r1, .answer li').all();
    
    for (let i = 0; i < optionRoots.length; i++) {
       const div = optionRoots[i];
       const rawText = (await div.innerText()).trim();
       
       // Buscar ID do input
       const inputEl = div.locator('input[type="radio"], input[type="checkbox"]').first();
       const inputId = await inputEl.getAttribute('id').catch(() => null);
       
       // Limpar texto removendo "a. ", "b) " etc.
       const cleanText = rawText.replace(/^[a-eA-E][.\)]\s*/, '').trim();
       
       if (cleanText) {
          optionsMap.push({
             idx: i,
             id: inputId,
             loc: div,
             textoLimpo: cleanText.toLowerCase(),
             textoOriginal: cleanText
          });
          formattedAlts += `${i + 1}) ${cleanText}\n`;
       }
    }

    // LOGS DE DEBUG OBRIGATÓRIOS
    console.log(`\n========================================`);
    console.log(`QUESTÃO ${n}`);
    console.log(`PERGUNTA: ${text}`);
    console.log(`----------------------------------------`);
    console.log(`DICIONÁRIO (${optionsMap.length} opções):`);
    optionsMap.forEach((o) => console.log(`  [${o.idx}] ID=${o.id || 'SEM_ID'} | "${o.textoOriginal.substring(0, 70)}"`));
    console.log(`========================================\n`);

    if (!optionsMap.length) {
      emit('log', `[AVISO] Q${n}: Sem alternativas listadas. Verifique o console.`);
      break;
    }

    // Screenshot automático
    try {
      await page.screenshot({ path: `questao_${n}_${Date.now()}.png` });
    } catch {}

    // ================================
    // 3. ESTRATÉGIA: Groq (PRIMÁRIO) + Google (Fallback)
    // ================================
    let targetOpt = null;
    let answerSource = 'nenhum';
    let iaResponse = null;

    // Limpar cookies/banners ANTES de qualquer interação
    await limparBanners(page);

    // 3a. PRIMÁRIO: Groq API com Retry e Anti-Bias A
    emit('log', `[ORYON] Estabilizando motor de raciocínio 120B...`);

    let explanationText = 'Não informada.';

    for (let attempt = 1; attempt <= 3; attempt++) {
      let questionQuery = text;
      
      if (attempt > 1) {
        emit('log', `[AVISO] Match fraco na Letra A detectado. Reiniciando raciocínio... (Tentativa ${attempt}/3)`);
      } else {
        emit('log', `[ORYON] Analisando questão...`);
      }

      const groqRes = await askGroq(groqKey, disciplina, questionQuery, formattedAlts);
      iaResponse = groqRes.answer;
      explanationText = groqRes.explanation;
      
      if (!iaResponse) continue;

      // Sanitização estrita do miolo técnico
      const cleanAi = iaResponse
        .toLowerCase()
        .replace(/^(a alternativa correta é|a resposta correta é|a resposta é|resposta:?|opção:?|selecionar:?|alternativa:?)\s*/i, '')
        .replace(/^[\d]+[.\)-]\s*/, '')
        .replace(/^[a-eA-E][.\)-]\s*/, '')
        .replace(/["'`]/g, '')
        .replace(/\.\s*$/, '')
        .trim();

      // Rejeição se a IA responder só com uma letra ou número (menos de 5 letras geralmente é inútil pra match de fisioterapia)
      if (cleanAi.length < 5) {
        continue; // Força nova iteração
      }

      // Match direto
      let tempOpt = optionsMap.find(o => cleanAi.includes(o.textoLimpo) || o.textoLimpo.includes(cleanAi));
      let bestScore = 0;
      let bestOpt = null;

      if (tempOpt) {
        bestScore = 1.0; // 100%
      } else {
        // Validação Estrita de Conteúdo (Anti-Debug-A)
        for (const opt of optionsMap) {
          const score = calcSimilarity(cleanAi, opt.textoLimpo);
          if (score > bestScore) {
            bestScore = score;
            bestOpt = opt;
          }
        }
        
        // 60% de similaridade mínima
        if (bestScore >= 0.6) {
          tempOpt = bestOpt;
        }
      }

      if (tempOpt) {
        // Anti-Bias Estrito na Letra A
        if (tempOpt.idx === 0 && bestScore > 0 && bestScore < 0.70 && attempt < 3) {
           emit('log', `[AVISO] IA cravou Letra A com confiança fraca de ${(bestScore*100).toFixed(1)}%. Suspeita de alucinação. Forçando nova reflexão.`);
           continue; // Vai para a próxima tentativa do for loop
        }

        targetOpt = tempOpt;
        answerSource = 'oryon';
        finalMatchPerc = (bestScore * 100).toFixed(1);
        emit('log', `[ORYON] Texto Groq: "${cleanAi.substring(0, 40)}" | Match AVA: "${targetOpt.textoOriginal.substring(0, 40)}" | Precisão: ${finalMatchPerc}%`);
        break; // Match Legítimo! Sai do for loop
      }
    }

    // 3b. FALLBACK: Validar extensamente se IA falhou
    if (!targetOpt) {
      emit('log', `[BUSCA] [ETAPA 2] Refinando com Base de Conhecimento Externa...`);
      try {
        const { context } = getSession(sessionId);
        const googleResult = await searchGoogle(context, text, optionsMap, emit);
        if (googleResult.answer && googleResult.score >= 0.4) {
          targetOpt = googleResult.answer;
          answerSource = 'oryon-search';
          finalMatchPerc = (googleResult.score * 100).toFixed(1);
          emit('log', `[SUCESSO] [ORYON] Resposta processada com ${finalMatchPerc}% de precisão!`);
        }
      } catch (e) {
        emit('log', `[AVISO] [ORYON] Validação estendida falhou: ${e.message}`);
      }
    }

    // ════════════════════════════════════════════
    // ANTI-BIAS: PROIBIDO clicar na primeira opção por default
    // ════════════════════════════════════════════
    if (!targetOpt) {
       emit('log', `[ERRO] [ANTI-BIAS] Nenhuma fonte retornou match confiável. PULANDO esta questão sem marcar.`);
       emit('log', `[ERRO] Não foi possível determinar a resposta. Intervenção manual necessária.`);
       answersLog.push({ question: n, text: text.substring(0, 120), answer: 'NÃO RESPONDIDA', source: 'nenhum' });
    } else {
      // DEBUG: Se escolheu a primeira opção, explicar POR QUÊ
      if (targetOpt.idx === 0) {
        console.log(`\n[AVISO]  ALERTA: Selecionou opção [0] (primeira). Motivo: match legítimo via ${answerSource}.`);
        console.log(`   Texto IA: "${iaResponse?.substring(0, 60) || 'N/A'}"`);
        console.log(`   Texto Opção: "${targetOpt.textoOriginal.substring(0, 60)}"\n`);
        emit('log', `[AVISO] [DEBUG] Opção [0] selecionada por match legítimo via ${answerSource}, NÃO por fallback.`);
      }

      // Limpar cookies novamente antes do clique
      await limparBanners(page);

      // CLIQUE: usar page.check() com o ID do input
      try {
        if (targetOpt.id) {
          const safeId = targetOpt.id.replace(/:/g, '\\:');
          await page.check(`input#${safeId}`, { force: true });
          emit('log', `[SUCESSO] Marcado via page.check() no ID #${targetOpt.id}`);
        } else {
          const radio = targetOpt.loc.locator('input[type="radio"], input[type="checkbox"]').first();
          await radio.check({ force: true });
          emit('log', `[SUCESSO] Marcado via page.check() no input do container`);
        }
        console.log(`[SCRIPT] Encontrou match no ID: "${targetOpt.id || 'container'}"`);
        emit('log', `[SISTEMA] [${answerSource.toUpperCase()}] Selecionou: "${targetOpt.textoOriginal.substring(0, 60)}"`);
      } catch (e) {
        emit('log', `[ERRO] Falha ao marcar: ${e.message}. Tentando click force...`);
        try { await targetOpt.loc.click({ force: true }); } catch {}
      }
      answersLog.push({ question: n, text: text.substring(0, 120), answer: targetOpt.textoOriginal.substring(0, 50), source: answerSource });
      
      // ════════════════════════════════════════════
      // GRAVAÇÃO DE HISTÓRICO LOCAL (FÍSICO)
      // ════════════════════════════════════════════
      try {
        const fs = require('fs');
        const path = require('path');
        const sanitize = (str) => str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 50);
        
        let secaoTitle = 'Unidade_Generica';
        try { secaoTitle = (await page.locator('h1').first().innerText()).trim(); } catch(e) {}
        
        let actTitle = 'Atividade_Generica';
        try { actTitle = await page.title(); } catch(e) {}

        const baseDir = (typeof __userDataPath === 'string' && __userDataPath) ? __userDataPath : (process.env.APPDATA ? path.join(process.env.APPDATA, 'Studio Oryon') : process.cwd());
        const folderDir = path.join(baseDir, 'Historico', sanitize(disciplina), sanitize(secaoTitle));
        if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });
        const filePath = path.join(folderDir, `${sanitize(actTitle)}.txt`);
        
        const separator = '='.repeat(60);
        const subSep = '-'.repeat(60);
        const logData = [
          separator,
          `QUESTAO ${n}`,
          subSep,
          `ENUNCIADO:`,
          text,
          '',
          `ALTERNATIVAS:`,
          formattedAlts.trimEnd(),
          '',
          `RESPOSTA ESCOLHIDA (Studio Oryon):`,
          targetOpt.textoOriginal,
          '',
          `EXPLICAÇÃO (ORYON):`,
          explanationText,
          '',
          `CONFIANCA / SIMILARIDADE: ${finalMatchPerc}%`,
          '',
          `[ATENCAO] Verifique se a resposta acima esta correta antes de prosseguir.`,
          separator,
          '',
        ].join('\n');
        fs.appendFileSync(filePath, logData, 'utf-8');
        
        emit('log', '[ORYON] Questão salva no histórico para conferência.');
        const s = getSession(sessionId);
        if (s) s.historicoPath = folderDir;
      } catch (err) {
        console.error('Falha ao gravar histórico local:', err.message);
      }
    }

    // 5. Avançar de página + Delay Rigoroso de 2s
    const nextBtn = page.locator('input[value="Próxima página"], input[name="next"], button:has-text("Próxima")').first();
    const finishLoopBtn = page.locator('input[value*="Finalizar tentativa"], button[name="next"]').first();
    const finishTextMatch = await finishLoopBtn.getAttribute('value').catch(() => '');
    
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
    } else if (await finishLoopBtn.isVisible().catch(() => false) && finishTextMatch.toLowerCase().includes('finalizar')) {
      emit('log', '[SISTEMA] "Finalizar tentativa" atingido nesta etapa.');
      await finishLoopBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      break;
    } else {
      emit('log', '[SISTEMA] Fim de botões lógicos. Saindo do loop.');
      break;
    }
  }

  // 2.5 Validação: Verificar se todos os inputs estão checked antes de finalizar
  emit('log', '[BUSCA] Validando se todas as questões foram marcadas...');
  try {
    const uncheckedCount = await page.evaluate(() => {
      const questions = document.querySelectorAll('.que');
      let missing = 0;
      questions.forEach(q => {
        const radios = q.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (radios.length > 0) {
          const anyChecked = Array.from(radios).some(r => r.checked);
          if (!anyChecked) missing++;
        }
      });
      return missing;
    });
    if (uncheckedCount > 0) {
      emit('log', `[AVISO] ${uncheckedCount} questão(ões) sem resposta marcada! Verifique o console.`);
    } else {
      emit('log', '[SUCESSO] Todas as questões possuem resposta marcada.');
    }
  } catch {}

  // 3. Sequência de Finalização (3 Cliques de Confirmação)
  emit('log', '📤 Iniciando sequência de finalização (3 cliques)...');
  await delay(1000);

  // Botão 1: Clique em "Finalizar tentativa ..."
  emit('log', '📤 Botão 1/3: Finalizar tentativa...');
  try {
    const btn1 = page.locator('text=/Finalizar tentativa/i, input[value*="Finalizar tentativa"]').first();
    if (await btn1.isVisible().catch(() => false)) {
      await btn1.click();
      await safeWait(page); await delay(2000);
    }
  } catch {}

  // Botão 2 (Resumo): Clique no botão "Enviar tudo e terminar"
  emit('log', '📤 Botão 2/3: Enviar tudo e terminar (Resumo)...');
  try {
    const btn2 = page.locator('button.btn-secondary:has-text("Enviar tudo e terminar"), button:has-text("Enviar tudo e terminar")').first();
    if (await btn2.isVisible().catch(() => false)) {
      await btn2.click();
      await safeWait(page); await delay(2000);
    }
  } catch {}

  // Botão 3 (Modal de Confirmação)
  emit('log', '📤 Botão 3/3: Modal de Confirmação...');
  try {
    const btn3 = page.locator('input[value="Enviar tudo e terminar"].btn-primary, .modal-dialog button:has-text("Enviar tudo e terminar")').first();
    if (await btn3.isVisible().catch(() => false)) {
      await btn3.click();
    } else {
      // Fallback final genérico
      const btns = await page.locator('button:has-text("Enviar tudo e terminar")').all();
      if (btns.length) await btns[btns.length - 1].click();
    }
  } catch {}
  
  await safeWait(page); await delay(3000);
  emit('log', '[SUCESSO] Questionário enviado com sucesso!');

  // 4. Extração de Resultados (Dashboard Final)
  emit('log', '📊 Extraindo resultados (Tabela .quizreviewsummary)...');
  let status = 'Desconhecido';
  let tempoEmpregado = 'Desconhecido';
  let notas = 'Não identificada';
  let avaliar = '0%';

  try {
    await page.waitForSelector('.quizreviewsummary', { timeout: 10000 });
    
    status = await page.locator('.quizreviewsummary th:has-text("Estado") + td').innerText().catch(() => 'Finalizada');
    tempoEmpregado = await page.locator('.quizreviewsummary th:text-is("Tempo empregado"), .quizreviewsummary th:text-is("Tempo") + td').innerText().catch(() => 'Desconhecido');
    
    // A tabela costuma ter a linha "Notas" (ex: 3,00/3,00) e "Avaliar" (ex: 100 de um máximo de 100(100%))
    const notasRow = page.locator('.quizreviewsummary th:has-text("Notas") + td');
    if (await notasRow.isVisible().catch(() => false)) notas = (await notasRow.innerText()).trim();

    const avaliarRow = page.locator('.quizreviewsummary th:has-text("Avaliar") + td');
    if (await avaliarRow.isVisible().catch(() => false)) {
      const avaliarText = (await avaliarRow.innerText()).trim();
      // Extrair apenas a porcentagem (ex: 10,00 de um máximo de 10,00(100%))
      const match = avaliarText.match(/(\d+[,.]?\d*\s*%)/);
      if (match) avaliar = match[1];
      else avaliar = avaliarText;
    }
  } catch {
    emit('log', '[AVISO] Tabela de resumo não encontrada, tentando extração de fallback...');
    // Fallback: Busca genérica na página por padrões de nota
    try {
      const body = await page.locator('body').innerText();
      const m = body.match(/(\d+[,.]\d+)\s*(?:de|\/)\s*(\d+[,.]\d+)/i);
      if (m) notas = `${m[1]} de ${m[2]}`;
      const p = body.match(/(\d+[,.]\d+)\s*%/);
      if (p) avaliar = p[1];
    } catch {}
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const finalScore = analisarScore(avaliar, notas);

  emit('log', `[SUCESSO] Aproveitamento final: ${finalScore} | Tempo total: ${elapsed}s`);
  
  const s = getSession(sessionId);
  if (s && s.historicoPath) {
    emit('log', `[ORYON] Histórico da Seção gerado com sucesso em: ${s.historicoPath}`);
  }
  
  // 5. Limpeza de Interface Pós-Envio
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.modal, .modal-backdrop, [role="dialog"], #modal-container').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
    });
    emit('log', '[ORYON] Modais e overlays limpos da interface.');
  } catch {}

  // 6. Analise de Nota Baixa e Botão Refazer
  const pctMatch = finalScore.match(/(\d+[,.]?\d*)/);
  if (pctMatch && finalScore.includes('%')) {
    const num = parseFloat(pctMatch[1].replace(',', '.'));
    if (num < 100) {
      emit('log', '[AVISO] Aproveitamento < 100%. Tentando iniciar nova tentativa automaticamente (Refazer)...');
      try {
        const refazerBtn = page.locator('button:has-text("Fazer uma outra tentativa"), input[value*="Fazer uma outra tentativa"]').first();
        if (await refazerBtn.isVisible().catch(() => false)) {
          await refazerBtn.click();
          await safeWait(page);
          await delay(2000);
          emit('log', '[SISTEMA] Redirecionado para a tela inicial de Refazer o questionário.');
        }
      } catch {}
    }
  }

  emit('log', '[ORYON] Questionário finalizado com sucesso. O que deseja fazer agora?');
  emit('done', { score: finalScore, time: elapsed, total: answersLog.length, status, tempoEmpregado, notas, avaliar });

  // 7. Salvar Histórico em historico.json
  const resultado = {
    status: 'success',
    disciplina: disciplina,
    estado: status,
    tempo_empregado: tempoEmpregado,
    notas: notas,
    aproveitamento: finalScore,
    tempo_execucao: `${elapsed}s`,
    questoes: answersLog,
    data: new Date().toISOString(),
  };

  // Se nota < 100%, salvar quais perguntas a IA potencialmente errou (para futuro RAG)
  const pctNum = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : 100;
  if (pctNum < 100) {
    resultado.erros_potenciais = answersLog.map(a => ({
      questao: a.text,
      resposta_ia: a.answer
    }));
    emit('log', `📝 ${answersLog.length} perguntas salvas como erros potenciais para futura Base de Conhecimento.`);
  }

  try {
    const histBaseDir = (typeof __userDataPath === 'string' && __userDataPath) ? __userDataPath : (process.env.APPDATA ? path.join(process.env.APPDATA, 'Studio Oryon') : process.cwd());
    if (!fs.existsSync(histBaseDir)) fs.mkdirSync(histBaseDir, { recursive: true });
    const histPath = path.join(histBaseDir, 'historico.json');
    let historico = [];
    if (fs.existsSync(histPath)) {
      historico = JSON.parse(fs.readFileSync(histPath, 'utf-8'));
    }
    historico.push(resultado);
    fs.writeFileSync(histPath, JSON.stringify(historico, null, 2));
    emit('log', `[SISTEMA] Resultado salvo em historico.json (${historico.length} registros).`);
  } catch (e) {
    emit('log', `[AVISO] Falha ao salvar histórico: ${e.message}`);
  }

  return resultado;
}

function analisarScore(avaliar, notas) {
  if (avaliar !== '0%' && avaliar !== 'Desconhecido') return avaliar;
  if (notas !== 'Não identificada') return notas;
  return 'Concluído';
}

// ══════════════════════════════════════════════════════════════
// captureRA — Captura o RA do aluno logado via scraping do DOM
// ══════════════════════════════════════════════════════════════

async function captureRA(sessionId, emit = () => {}) {
  const { page } = getSession(sessionId);
  emit('log', '[ORYON] 🔍 Capturando RA do perfil logado no AVA...');

  try {
    // 1. Tentar clicar no menu de avatar para expandir o perfil
    const avatarSels = ['#avatar_menu', '.avatar-menu', '[id*="avatar"]', '.user-menu', '.profile-menu'];
    let clicked = false;
    for (const sel of avatarSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click({ timeout: 5000 });
          clicked = true;
          emit('log', `[ORYON] Menu de perfil expandido via: ${sel}`);
          await delay(1500);
          break;
        }
      } catch {}
    }

    if (!clicked) {
      emit('log', '[AVISO] Menu de avatar não encontrado. Tentando leitura direta do DOM...');
    }

    // 2. Extrair RA do DOM usando múltiplas estratégias
    const raResult = await page.evaluate(() => {
      // Estratégia 1: Seletor alvo exato (div.ml-3 small.ng-binding)
      const smallEls = document.querySelectorAll('div.ml-3 small.ng-binding, small.ng-binding, .ml-3 small');
      for (const el of smallEls) {
        const text = el.textContent || '';
        const match = text.match(/RA:\s*(\d+)/i);
        if (match) return { ra: match[1], source: 'ng-binding' };
      }

      // Estratégia 2: Busca genérica em qualquer elemento visível
      const allEls = document.querySelectorAll('small, span, div, p, li');
      for (const el of allEls) {
        const text = el.textContent || '';
        // Verificar se o texto contém "RA:" seguido de números
        const match = text.match(/RA:\s*(\d{5,})/i);
        if (match) return { ra: match[1], source: 'generic-search' };
      }

      // Estratégia 3: Busca no HTML inteiro como fallback
      const bodyText = document.body.innerText || '';
      const bodyMatch = bodyText.match(/RA:\s*(\d{5,})/i);
      if (bodyMatch) return { ra: bodyMatch[1], source: 'body-text' };

      return null;
    });

    if (raResult && raResult.ra) {
      emit('log', `[SUCESSO] RA capturado: ${raResult.ra} (via ${raResult.source})`);
      return { success: true, ra: raResult.ra };
    }

    emit('log', '[AVISO] RA não encontrado no DOM do portal.');
    return { success: false, ra: null };

  } catch (e) {
    emit('log', `[ERRO] Falha ao capturar RA: ${e.message}`);
    return { success: false, ra: null };
  }
}

// ══════════════════════════════════════════════════════════════
// destroySession — Fecha o navegador
// ══════════════════════════════════════════════════════════════

async function destroySession(sessionId, emit = () => {}) {
  const session = sessions.get(sessionId);
  if (session) {
    emit('log', '🔒 Encerrando sessão...');
    await delay(1000);
    await session.browser.close();
    sessions.delete(sessionId);
    emit('log', '[SUCESSO] Sessão encerrada.');
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = {
  createSession,
  login,
  getDisciplinas,
  selectDisciplina,
  getUnidades,
  getSeccoes,
  getAtividades,
  clickItem,
  resolverAtividade,
  captureRA,
  destroySession,
};
