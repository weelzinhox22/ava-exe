import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;

serve(async (req: Request) => {
  if (req.method === "GET") {
    // ── Tela de Checkout para capturar o E-mail antes do Mercado Pago ──
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comprar Studio Oryon</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; width: 100%; max-width: 400px; box-sizing: border-box; }
          h2 { margin-top: 0; font-size: 24px; color: #fff; }
          p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          input { width: 100%; padding: 14px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; font-size: 16px; box-sizing: border-box; }
          input:focus { outline: none; border-color: #6366f1; }
          button { width: 100%; padding: 16px; border: none; border-radius: 8px; background: linear-gradient(135deg, #6366f1, #3b82f6); color: white; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.3s; }
          button:hover { opacity: 0.9; transform: translateY(-2px); }
          .price { font-size: 32px; font-weight: bold; color: #e0e7ff; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚡ Studio Oryon</h2>
          <div class="price">R$ 39,90<span style="font-size: 14px; color: #64748b;">/mês</span></div>
          <p>Para onde devemos enviar a sua chave de acesso logo após o pagamento?</p>
          <form method="POST">
            <input type="email" name="email" placeholder="seu-melhor@email.com" required>
            <button type="submit">Ir para o Pagamento 🚀</button>
          </form>
          <p style="margin-top: 20px; font-size: 12px; color: #475569;">Pagamento Seguro Mercado Pago</p>
        </div>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  if (req.method === "POST") {
    // ── Processar o formulário e enviar para o Mercado Pago com o E-mail protegido em metadata ──
    const formData = await req.formData();
    const email = formData.get("email")?.toString().trim();

    if (!email || !email.includes("@")) {
      return new Response("E-mail inválido, volte e tente novamente.", { status: 400 });
    }

    try {
      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${MP_ACCESS_TOKEN}\`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [
            {
              title: "Licença Studio Oryon - Acesso Mensal",
              quantity: 1,
              currency_id: "BRL",
              unit_price: 39.90
            }
          ],
          payer: {
            email: email // Sugere o e-mail pro MP preencher automático, mas sabemos que ele vai mascarar depois na API.
          },
          metadata: {
            email: email // 🚨 ESSE PULO DO GATO BURLLA O XXXXXXXXXXX: O MP devolve a chave metadata intacta no Webhook!
          },
          back_urls: {
            success: "https://studiooryon.pro/sucesso",
            failure: "https://studiooryon.pro/erro"
          },
          auto_return: "approved",
          payment_methods: {
            excluded_payment_types: [{ id: "ticket" }] // Exclui boleto
          }
        })
      });

      const preference = await mpResponse.json();

      if (preference.init_point) {
        // Redireciona o comprador direto para a página de crédito/pix
        return new Response(null, {
          status: 302,
          headers: { "Location": preference.init_point }
        });
      } else {
        return new Response("Erro ao criar preferência de pagamento no MP.", { status: 500 });
      }
    } catch (err) {
      return new Response("Falha na formatação com a API do Mercado Pago.", { status: 500 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
