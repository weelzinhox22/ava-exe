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
                ⏳ Assinatura válida por <strong style="color:#f8fafc;">30 dias</strong> a partir de agora. Para renovar, acesse o link abaixo antes do vencimento.
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

// ── Handler principal ─────────────────────────────────────────
serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
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

    if (type !== "payment" || !paymentId) {
      return new Response("Ignored", { status: 200 });
    }

    // ── Validar pagamento na API do Mercado Pago ──────────────
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error("Falha na API MP:", await mpRes.text());
      return new Response("MP API error", { status: 502 });
    }

    const payment = await mpRes.json();

    if (payment.status !== "approved") {
      console.log(`Pagamento ${paymentId} não aprovado (status: ${payment.status}). Ignorando.`);
      return new Response("Not approved", { status: 200 });
    }

    const payerEmail = payment.payer?.email;
    if (!payerEmail) {
      console.error("E-mail do pagador não encontrado no payload do MP.");
      return new Response("Email not found", { status: 200 });
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

    // ── Gerar e persistir licença ─────────────────────────────
    const licenseKey = generateLicenseKey();
    const expiresAt  = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: dbError } = await supabase.from("licenses").insert({
      key:         licenseKey,
      active:      true,
      expires_at:  expiresAt.toISOString(),
      owner_email: payerEmail,
      payment_id:  String(paymentId),
      hwid:        null,
    });

    if (dbError) {
      console.error("Erro ao inserir licença:", dbError);
      return new Response("Database error", { status: 500 });
    }

    console.log(`✅ Licença ${licenseKey} criada para ${payerEmail}`);

    // ── Enviar e-mail via Resend API ──────────────────────────
    if (RESEND_API_KEY) {
      const emailPayload = {
        from:    `Studio Oryon <${FROM_EMAIL}>`,
        to:      [payerEmail],
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
    } else {
      console.warn("RESEND_API_KEY não configurada — e-mail não enviado.");
    }

    return new Response("OK", { status: 200 });

  } catch (error: any) {
    console.error("Erro crítico no webhook:", error?.message ?? error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
