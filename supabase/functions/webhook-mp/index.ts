import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ── Secrets (configurados no Supabase Dashboard > Edge Functions > Secrets) ──
const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN          = Deno.env.get("MP_ACCESS_TOKEN")!;
const RESEND_API_KEY           = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL               = Deno.env.get("FROM_EMAIL") || "licenca@studiooryon.pro";
const WEBHOOK_SECRET           = Deno.env.get("WEBHOOK_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Gerador de Chave ──────────────────────────────────────────
function generateLicenseKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `ORYON-${seg()}-${seg()}-${seg()}`;
}

// ── Template de E-mail Dark Mode ─────────────────────────────
function buildEmailHtml(licenseKey: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sua Licença Studio Oryon</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Cabeçalho com logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="
                    background:linear-gradient(135deg,#6366f1,#3b82f6);
                    border-radius:16px;padding:14px 28px;
                    font-size:22px;font-weight:800;color:#fff;
                    letter-spacing:-0.5px;
                  ">
                    ⚡ Studio Oryon
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="
              background:#1e293b;border:1px solid rgba(255,255,255,0.08);
              border-radius:20px;padding:40px 36px;
            ">
              <!-- Título -->
              <p style="margin:0 0 8px;font-size:28px;font-weight:800;color:#f8fafc;line-height:1.2;">
                🎉 Sua licença chegou!
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Seu pagamento foi confirmado com sucesso. Bem-vindo ao <strong style="color:#e0e7ff;">Studio Oryon</strong> — o robô mais rápido para o AVA Kroton.
              </p>

              <!-- Separador -->
              <div style="height:1px;background:rgba(255,255,255,0.07);margin-bottom:28px;"></div>

              <!-- Chave de acesso -->
              <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">
                Sua Chave de Acesso
              </p>
              <div style="
                background:#0f172a;border:1px solid rgba(99,102,241,0.4);
                border-radius:12px;padding:20px 24px;
                font-family:'Courier New',Consolas,monospace;
                font-size:22px;font-weight:700;
                color:#a5b4fc;letter-spacing:3px;
                text-align:center;
              ">
                ${licenseKey}
              </div>

              <!-- Instrução de uso -->
              <div style="
                background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);
                border-radius:10px;padding:16px 20px;margin-top:24px;
              ">
                <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
                  📋 <strong style="color:#c7d2fe;">Como usar:</strong> Cole esta chave no campo <em>"Chave de Acesso (Licença)"</em> dentro do software Studio Oryon. No primeiro login, ela será vinculada permanentemente ao seu dispositivo.
                </p>
              </div>

              <!-- Separador -->
              <div style="height:1px;background:rgba(255,255,255,0.07);margin:28px 0;"></div>

              <!-- Validade -->
              <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.6;">
                ⏳ Assinatura válida por <strong style="color:#f8fafc;">3 meses</strong> a partir de agora. Para renovar, acesse o link abaixo antes do vencimento.
              </p>

              <!-- Botão CTA -->
              <div style="text-align:center;">
                <a href="https://mpago.li/2kLegqy"
                   style="
                     display:inline-block;
                     background:linear-gradient(135deg,#6366f1,#3b82f6);
                     color:#fff;text-decoration:none;
                     font-size:15px;font-weight:700;
                     padding:14px 36px;border-radius:10px;
                     letter-spacing:0.3px;
                   ">
                  ⚡ Acessar Studio Oryon
                </a>
              </div>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:#334155;">
                Se tiver dúvidas, entre em contato: <a href="mailto:${FROM_EMAIL}" style="color:#6366f1;text-decoration:none;">${FROM_EMAIL}</a>
              </p>
              <p style="margin:0;font-size:11px;color:#1e293b;">
                © 2026 Studio Oryon — Automação Educacional Inteligente
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Handler principal (Checkout + Webhook Unificados) ─────────
serve(async (req: Request) => {
  try {
    // ── O Frontend (HTML) e a Coleta do E-mail agora moram no site externo (studiooryon.pro) ──
    // ── O Mercado Pago mandará as notificações para esta ROTA POST (Webhook) ──────────
    if (req.method !== "POST") {
      return new Response("Method not allowed. Use um POST de teste via plataforma MP ou curl.", { status: 405 });
    }

    // Validação por secret param (proteção anti-spam)
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    // Parse do body
    const bodyText = await req.text();
    let bodyJson: Record<string, any> = {};
    try { bodyJson = JSON.parse(bodyText); } catch (_) {}

    const type      = url.searchParams.get("type") || url.searchParams.get("topic") || bodyJson.type;
    const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || bodyJson.data?.id;

    // Ignorar IDs de teste do Mercado Pago
    if (String(paymentId) === "123456") {
      console.log("⚠️ ID de teste ignorado.");
      return new Response("Test OK", { status: 200 });
    }

    let payerEmail = "";
    let raLimit = 1;
    let planType = "Estudante";

    // ── Modo Teste de E-mail (Ignora o Mercado Pago) ──────────
    if (String(paymentId) === "TESTE_EMAIL") {
      console.log("🛠️ Modo Teste Ativado: Pulando validação do MP para testar Resend.");
      payerEmail = bodyJson.record?.payer?.email || "teste@studiooryon.pro";
      if (bodyJson.record?.ra_limit) raLimit = parseInt(bodyJson.record.ra_limit, 10) || 1;
      if (raLimit > 1) planType = "Agência";
    } else {
      // ── Validar pagamento na API do Mercado Pago ──────────────
      if (!MP_ACCESS_TOKEN) {
        console.error("Falta a secret MP_ACCESS_TOKEN");
        return new Response("Missing MP_ACCESS_TOKEN secret in Supabase", { status: 500 });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!mpRes.ok) {
        const errorText = await mpRes.text();
        const erroMsg = `Falha na API MP (Status ${mpRes.status}): ${errorText}`;
        console.error(erroMsg);
        return new Response(erroMsg, { status: 502 });
      }

      const payment = await mpRes.json();

      if (payment.status !== "approved") {
        console.log(`Pagamento ${paymentId} não aprovado (status: ${payment.status}). Ignorando.`);
        return new Response("Not approved", { status: 200 });
      }

      // ── Extração do limite de RAs (Multi-RA) ───────────────
      const limitRaw = payment.metadata?.ra_limit || payment.additional_info?.items?.[0]?.quantity || 1;
      raLimit = parseInt(String(limitRaw), 10);
      if (isNaN(raLimit) || raLimit < 1) raLimit = 1;

      if (raLimit >= 2) {
        planType = "Agência";
      }

      // ── Busca inteligente de E-mail (O Mercado Pago às vezes esconde o e-mail real com "XXXXX") ──
      const candidates = [
        payment.additional_info?.payer?.email,
        payment.payer?.email,
        payment.metadata?.email,
        payment.metadata?.payer_email
      ];

      payerEmail = candidates.find(e => e && typeof e === 'string' && e.includes("@") && !e.includes("XXXX")) || "";

      if (!payerEmail) {
        console.error("E-mail real do pagador não encontrado no payload do MP (Pode ter vindo mascarado como XXXXXXXXXXX).");
        // Não vamos interromper 100%, vamos salvar a licença mesmo sem email, para auditoria.
        payerEmail = payment.payer?.email || "email.oculto@mercadopago.com"; 
      }
    }

    // ── Idempotência: verificar se já processou este payment_id ──
    const { data: existing } = await supabase
      .from("licenses")
      .select("id, key")
      .eq("payment_id", String(paymentId))
      .maybeSingle();

    if (existing) {
      console.log(`Payment ${paymentId} já processado (key: ${existing.key}). Pulando.`);
      return new Response("Already processed", { status: 200 });
    }

    // ── Verificar se usuário já existe e obter user_id ──
    let existingUserId = null;
    if (payerEmail && payerEmail !== "email.oculto@mercadopago.com") {
      try {
        const { data: userIdRes } = await supabase.rpc("get_user_id_by_email", { email_to_check: payerEmail.trim() });
        if (userIdRes) {
          existingUserId = userIdRes;
          console.log(`👤 Usuário encontrado: ${payerEmail} -> UUID vinculada automaticamente.`);
        }
      } catch (err) {
        console.warn(`Aviso: falha ao buscar user UUID para ${payerEmail}`, err);
      }
    }

    // ── Gerar e persistir licença ─────────────────────────────
    const licenseKey = generateLicenseKey();
    const expiresAt  = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    const { error: dbError } = await supabase.from("licenses").insert({
      key:         licenseKey,
      active:      true,
      expires_at:  expiresAt.toISOString(),
      owner_email: payerEmail,
      user_id:     existingUserId,
      payment_id:  String(paymentId),
      hwid:        null,
      ra_limit:    raLimit,
      plan_type:   planType
    });

    if (dbError) {
      console.error("Erro ao inserir licença:", dbError);
      return new Response("Database error", { status: 500 });
    }

    console.log(`✅ Licença ${licenseKey} criada para ${payerEmail}`);

    // ── Enviar e-mail via Resend API ──────────────────────────
    if (RESEND_API_KEY) {
      // Limpeza de espaços em branco invisíveis que podem quebrar o Resend
      const safeEmail = payerEmail.trim();

      if (!safeEmail.includes("@")) {
        console.warn(`⚠️ O e-mail informado (${safeEmail}) é inválido. O envio do Resend foi cancelado para evitar erro 422, mas a licença foi gerada.`);
      } else {
        const emailPayload = {
          from:    `Studio Oryon <${FROM_EMAIL}>`,
          to:      [safeEmail],
          subject: "⚡ Sua Licença Studio Oryon — Acesso Liberado!",
          html:    buildEmailHtml(licenseKey),
        };

      const emailRes = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error(`Falha no envio via Resend (${emailRes.status}): ${errBody}`);
        // Não retornar erro aqui — a licença já foi criada, o e-mail é best-effort
      } else {
        const resData = await emailRes.json();
        console.log(`📩 E-mail enviado para ${payerEmail}. Resend ID: ${resData.id}`);
      }
      } // <- Fechamento do else (!safeEmail.includes("@"))
    } else {
      console.warn("RESEND_API_KEY não configurada — e-mail não enviado.");
    }

    return new Response("OK", { status: 200 });

  } catch (error: any) {
    console.error("Erro crítico no webhook:", error?.message ?? error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
