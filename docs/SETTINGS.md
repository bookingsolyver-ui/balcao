# Definições do negócio e pagamentos por país

## O que há de novo
- **Ecrã de Definições** (`/[locale]/app/settings`, botão **Editar definições** no painel): nome, morada, WhatsApp, **país**, fuso horário, idioma da loja, loja visível/escondida, **módulos** ligados, e por módulo de pedidos: formas de receber, **taxa de entrega**, **pedido mínimo**, previsão, **formas de pagamento aceites** e **horário de funcionamento**.
- Novos métodos de pagamento: **Multicaixa Express** (`express`) e **Pagar na loja** (`store`).
- **Sugestão por país**: Angola → Express, transferência, pagar na loja · Portugal → MB WAY, cartão, dinheiro, transferência · Brasil → Pix, cartão, dinheiro · Moçambique e Cabo Verde também têm sugestão própria. Os negócios **novos** já nascem com os pagamentos do país; nos existentes usa o botão **Usar a sugestão para …** e guarda.
- **Pagar na loja** só existe em *levantar* ou *na mesa*, nunca em entregas: o checkout esconde-o e a base de dados recusa a combinação.
- O ecrã impede combinações sem sentido (por exemplo, entrega ativa sem nenhum método de pagamento possível).
- A moeda **não** se altera depois de criar o negócio (os preços já estão guardados nela). O país sim: muda o formato dos preços (Angola → `9 900,00 Kz`) e sugere fuso e idioma.
- Corrigido "Segunda-Feira" → "Segunda-feira" no horário da loja.

## Aplicar (migração nova!)
```bash
unzip -o ~/Downloads/balcao-definicoes.zip -d .
npm install && npm test
npx supabase db push        # aplica 20260920000004_payment_methods.sql
npm run dev
```

## Configurar a Perola&charme (Angola)
1. Painel → **Editar definições**.
2. **País: Angola** (o fuso passa a `Africa/Luanda`). Confirma o WhatsApp.
3. Em **Pedidos · Catálogo**, escolhe como receber (levantar em loja, e entrega se quiseres) e clica em **Usar a sugestão para Angola: Multicaixa Express, Transferência, Pagar na loja**.
4. Ajusta o **horário**, clica em **Guardar alterações** e abre a loja: o checkout mostra os três métodos e os preços aparecem em `Kz`.

## Importante sobre os pagamentos
O Balcão **regista o método escolhido pelo cliente**, mas **não cobra nem verifica** o pagamento. Com Express ou transferência, o cliente paga fora da loja e o negócio confirma pelo WhatsApp (por exemplo, com o comprovativo) antes de aceitar o pedido. Cobrança automática (Multicaixa Express, Pix, MB WAY, cartão) é uma integração à parte.

## Verificado / não verificado
Verificado com testes (Postgres real + renderização): validação de todas as definições; a base de dados aceita Express, transferência e pagar na loja e recusa pagar na loja com entrega e métodos não configurados; só owner/admin alteram (staff não altera negócio nem horário); loja despublicada deixa de receber pedidos; o ecrã em 4 idiomas.
**Só no teu Supabase:** a gravação a partir do browser (atualização do negócio e `upsert` do horário).
