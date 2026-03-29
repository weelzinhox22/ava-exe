---
description: Guia de Integração e Arquitetura - Webhook MP + Resend + Checkout Próprio
---

# 🛡️ Arquitetura de Pagamento e Entrega Mágica (Studio Oryon)

Este documento foi gerado como um **Ponto de Memória (Skill/Guia)** para a própria Inteligência Artificial. Ele documenta a arquitetura de contorno da LGPD do Mercado Pago para vender as licenças do Studio Oryon.

Sempre que formos dar manutenção ou expandir esse sistema, as regras e payloads exatos a seguir devem ser respeitados.

---

## 🛑 O Problema Original (O Bloqueio "XXXXXXXXXXX")
A partir de 2024, webhooks nativos do Mercado Pago ou tentativas de criar "Links de Pagamento" genéricos substituem os dados pessoais confidenciais (PII) do cliente, como o e-mail, por `XXXXXXXXXXX`.

Sem o e-mail, é impossível o nosso servidor (Supabase) usar a API do Resend para disparar a chave ativadora na hora da venda.

## 🛠️ A Solução (O "metadata Bypass")
As chaves padrões (`payer.email`) são limpas pelo Mercado Pago. **Porém, objetos customizados injetados dentro de \`metadata\` não são alterados**, voltando de forma idêntica e intacta dentro do payload final do Webhook que acusa a aprovação de pagamento.

---

## 💻 1. O Papel do Frontend (Landing Page Externa)
No site **studiooryon.pro/ava-oryon**, você (usuário) precisará construir um mini-formulário de checkout transparente ou semi-transparente.

### O Fluxo:
1. O cliente entra na LP e encontra um input `[ Digite seu e-mail para receber a chave ]`.
2. O cliente clica em "Comprar Agora".
3. **O seu site intercepta o clique**, captura o e-mail e faz uma requisição POST oculta para a API do Mercado Pago (via Servidor PHP/Node/Supabase).
4. O backend do seu site cria dinamicamente a `Preference` de pagamento **injetando o e-mail coletado** dentro de `metadata`.

### 📦 Payload de Exemplo (Javascript/Fetch no seu site):

\`\`\`json
{
  "items": [
    {
      "title": "Licença Studio Oryon - Acesso Mensal",
      "quantity": 1,
      "currency_id": "BRL",
      "unit_price": 39.90
    }
  ],
  "payer": {
    "email": "cliente@email.com" // <- MP vai censurar depois
  },
  "metadata": {
    "email": "cliente@email.com" // <- O SEGREDO MESTRE AQUI. NÃO É CENSURADO.
  },
  "back_urls": {
    "success": "https://studiooryon.pro/sucesso/",
    "failure": "https://studiooryon.pro/erro/"
  },
  "auto_return": "approved"
}
\`\`\`

5. A API do Mercado Pago retorna o `init_point` (o link de cobrança). O seu site redireciona o cliente para ele.

---

## ⚡ 2. O Papel do Webhook (Supabase Edge Function)

Uma vez que o cliente pague (Cartão ou Pix instantâneo), o Mercado Pago dispara o POST para o nosso webhook:
\`https://rwzqmqxbpxsltcibvstq.supabase.co/functions/v1/webhook-mp\`

O código instalado lá (que já escrevemos) faz o seguinte:

### Algoritmo do Webhook:
1. Recebe a notificação (id do pagamento).
2. Consulta o Mercado Pago via API para pedir os dados completos daquele pagamento.
3. Se `status === "approved"`, ele avança.
4. Faz a extração inteligente do e-mail da compra:

\`\`\`typescript
const candidates = [
  payment.metadata?.email,           // Prioridade Ouro (Nosso bypass do site)
  payment.metadata?.payer_email,  
  payment.additional_info?.payer?.email, // Algumas frentes antigas do MP
  payment.payer?.email               // Restolho (Provavelmente virá XXXXXXXXXXX)
];

const payerEmail = candidates.find(e => e && typeof e === 'string' && e.includes("@") && !e.includes("XXXX"));
\`\`\`

5. Pula se for código repetido (Idempotência pelo campo `payment_id` do Supabase Postgres).
6. **Gera a Chave ORYON-*** e salva no Postgres (`licenses` table).
7. Se um `payerEmail` real for encontrado, dispara um requisição para a **API do Resend** disparando o template HTML Dark Mode.

---

## 🚀 Próximos Passos (Para Mim - A IA)
Quando a gente for reabrir o desenvolvimento dessa linha, lembrarei que:
1. A função de Webhook final no Supabase **NÃO É** hospedadora de páginas HTML (por conta do "text/html override" nativo do Kong Gateway do Supabase). Ela **Apenas responde a chamadas de API JSON (POST)** do Mercado Pago.
2. A tela HTML/UX ficará a cargo do domínio externo de vendas real (`studiooryon.pro`).
3. Somente precisarei verificar se o seu script final JavaScript/PHP do site passa propriamente a chave `metadata.email`.
