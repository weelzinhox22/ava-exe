import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Configurações do ambiente (Configurar no Dashboard do Supabase > Edge Functions > Secrets)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Usar Service Role Key para ignorar RLS ao inserir dados
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!; // Usando Resend.com (SMTP HTTP API)
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "licenca@studiooryon.pro";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function generateLicenseKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let key = "ORYON";
  for (let i = 0; i < 3; i++) {
    key += "-";
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return key;
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const method = req.method;

    if (method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Validação ultra básica por secret query param para evitar spammers aleatórios descobrindo a URL
    const secret = url.searchParams.get("secret");
    if (Deno.env.get("WEBHOOK_SECRET") && secret !== Deno.env.get("WEBHOOK_SECRET")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Mercado Pago pode enviar via POST body ou query
    const bodyText = await req.text();
    let bodyJson: Record<string, any> = {};
    if (bodyText) {
      try { bodyJson = JSON.parse(bodyText); } catch (_) {}
    }

    const type = url.searchParams.get("type") || url.searchParams.get("topic") || bodyJson.type;
    const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || (bodyJson.data && bodyJson.data.id);

    // SE FOR TESTE DO MERCADO PAGO, SAI FORA COM SUCESSO!
    if (paymentId === "123456" || paymentId === 123456) {
      console.log("⚠️ Ignorando ID de teste do Mercado Pago para evitar erro 502.");
      return new Response("Test OK", { status: 200 });
    }

    if (type !== "payment" || !paymentId) {
      return new Response("Ignored event type", { status: 200 });
    }

    // Validar cruzado com a infra do MP para segurança máxima (impede falsificação HTTP Client-Side)
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
    });

    if (!mpRes.ok) {
      console.error("Falha ao consultar API do Mercado Pago", await mpRes.text());
      return new Response("MP API request failed", { status: 502 });
    }

    const paymentData = await mpRes.json();

    if (paymentData.status === "approved") {
      const payerEmail = paymentData.payer?.email;
      if (!payerEmail) return new Response("Email not found", { status: 200 });

      // Verificar licença duplicada via Payment ID
      const { data: existingLic } = await supabase
        .from('licenses')
        .select('id')
        .eq('payment_id', paymentId)
        .single();

      if (existingLic) {
        console.log(`Payment ${paymentId} already processed.`);
        return new Response("Already processed", { status: 200 });
      }

      // Cunha a Chave (Validade 30 dias)
      const licenseKey = generateLicenseKey();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error: dbError } = await supabase.from('licenses').insert({
        key: licenseKey,
        active: true,
        expires_at: expiresAt.toISOString(),
        owner_email: payerEmail,
        payment_id: paymentId,
        hwid: null // Nulo aguardando o Node coletar no App Desktop
      });

      if (dbError) {
        console.error("Erro no Postgres Insertion:", dbError);
        return new Response("Database Exception", { status: 500 });
      }

      console.log(`✅ [ORYON DB] Licença ${licenseKey} forjada para ${payerEmail}`);

      // Despacho NodeMailer/Resend HTTP 
      if (RESEND_API_KEY) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: `Studio Oryon <${FROM_EMAIL}>`,
            to: [payerEmail],
            subject: "⚡ Sua Licença Studio Oryon chegou!",
            html: `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                  <h2 style="color: #6366f1;">⚡ Sua Licença Studio Oryon chegou!</h2>
                  <p>Olá,</p>
                  <p>Seu pagamento da assinatura no Mercado Pago foi liquidado com sucesso.</p>
                  <p>Sua Chave de Acesso para destravar o robô Desktop Engine é:</p>
                  <div style="background: #f1f5f9; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 20px; text-align: center; letter-spacing: 2px; color: #0f172a;">
                      <strong>${licenseKey}</strong>
                  </div>
                  <p style="font-size: 13px; color: #666; margin-top: 20px;">
                  No primeiro login dentro do nosso Software, a chave será vinculada permanentemente à identidade da sua placa-mãe. Assinatura vigente temporariamente durante 30 dias na Nuvem.
                  </p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  <p style="font-size: 12px; color: #999;">Suporte Técnico - DRM Engine | Studio Oryon</p>
              </div>
            `
          })
        });

        if (!emailRes.ok) {
           console.error("Falha no correio SMTP (Resend):", await emailRes.text());
        } else {
           console.log(`📩 O email foi despachado para a caixa postal de ${payerEmail}`);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Critical Exception in Edge Function:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
