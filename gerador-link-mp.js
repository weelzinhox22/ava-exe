const fetch = require('node-fetch'); // Usando fetch ou axios nativamente no Node mais recente

// ⚠️ ATENÇÃO: Cole aqui o seu Access Token de PRODUÇÃO (aquele da sua print, que começa com APP_USR)
const ACCESS_TOKEN = "APP_USR-7626769308027334-032719-96958d6949994474159460a9c8b4f29c-2244840287";

async function gerarLinkDeVendas() {
  console.log("⏳ Gerando link de Checkout Pro...");

  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [
          {
            title: "Licença Studio Oryon - Acesso Mensal", // Nome do seu produto
            description: "Robô de automação para AVA Kroton",
            quantity: 1,
            currency_id: "BRL",
            unit_price: 1.0 // <--- COLOQUE O SEU PREÇO REAL AQUI
          }
        ],
        // Opcional: Se quiser que o cliente seja redirecionado após o pagamento
        back_urls: {
          success: "https://studiooryon.pro/sucesso",
          failure: "https://studiooryon.pro/erro"
        },
        auto_return: "approved",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }] // Exclui boleto para forçar ativação instantânea no Pix/Cartão (Opcional)
        }
      })
    });

    const data = await response.json();

    if (data.init_point) {
      console.log("\n✅ LINK GERADO COM SUCESSO!");
      console.log("👉 Use este link para vender: ", data.init_point);
      console.log("👉 Link (Ambiente de Teste): ", data.sandbox_init_point);
      console.log("\nEsse link agora está vinculado à sua Aplicação e o Webhook conseguirá ler o e-mail do comprador!");
    } else {
      console.log("❌ Erro ao gerar link:", data);
    }
  } catch (err) {
    console.error("Erro no script:", err.message);
  }
}

gerarLinkDeVendas();
