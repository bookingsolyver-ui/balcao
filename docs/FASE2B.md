# Fase 2B — a loja vende: carrinho, pedidos e fila ao vivo

## O que há de novo
**Cliente (loja pública)**
- Botão **+** em cada item (cardápio e catálogo); vira **− n +** quando já está na sacola. Itens esgotados ou indisponíveis não têm botão.
- Barra **Ver sacola** com a quantidade e o subtotal; a sacola fica guardada no aparelho (por loja).
- **Checkout**: receber (levantar / entrega / na mesa, conforme o negócio), nome, WhatsApp (com indicativo do país ou só o número nacional), pagamento (só os métodos ativos do negócio), troco, notas. Mostra subtotal, taxa de entrega e total, e avisa se falta para o pedido mínimo.
- O pedido é criado por `place_order`: **o servidor recalcula preços, promoções, taxa e stock** (o cliente nunca envia valores).
- Confirmação com **Enviar pelo WhatsApp** (mensagem completa e link de acompanhamento) e **Acompanhar pedido**.
- **Acompanhamento** em `/[locale]/s/[slug]/order/[token]`: passos do pedido, atualiza sozinho a cada 8 s. O link é secreto (token) e não mostra telefone nem morada.

**Negócio (painel)**
- **Pedidos** em `/[locale]/app/orders`: fila em 3 colunas (Novos, Em curso, Prontos) + histórico. Atualiza **ao vivo** (Realtime do Supabase, com atualização de reserva a cada 15 s), avisa "Novo pedido #…" e mostra o número de novos no título do separador.
- Um clique avança o estado (cardápio: aceitar → pronto → concluir; catálogo: confirmar → enviado → concluir). **Cancelar** devolve o stock. Concluir pontua a fidelidade sozinho.
- Botão **WhatsApp** com a mensagem certa para cada estado (levantar, entrega, mesa…).
- No painel inicial há o cartão **Pedidos** com o número de pedidos novos.

## Aplicar (inclui uma migração nova!)
```bash
unzip -o ~/Downloads/balcao-fase2b.zip -d .
npm install && npm test
npx supabase db push        # aplica 20260920000003_order_tracking.sql (acompanhamento com módulo e loja)
npm run dev
```

## Testar
1. Abre a loja (`Abrir loja`), adiciona itens e faz um pedido com o **teu** WhatsApp.
2. Em **Pedidos** (painel), o pedido aparece sem atualizar a página. Avança os estados.
3. No separador do acompanhamento, o estado muda sozinho.
4. Cancela um pedido e confirma que o stock voltou (Catálogo → Gerir).
> Cada número de telefone pode fazer no máximo 5 pedidos por hora por loja (proteção contra abusos).

## Configurar entrega, mínimo e pagamentos (ainda por SQL)
No **SQL Editor** do Supabase (troca o endereço da loja). Valores em unidades mínimas (`30000` = 300,00 na moeda do negócio):
```sql
-- taxa de entrega 300,00 e pedido mínimo 2 000,00 no catálogo
update tenants set settings = jsonb_set(jsonb_set(settings, '{catalog,fee_minor}', '30000'), '{catalog,min_minor}', '200000')
where slug = 'o-teu-slug';

-- pagamentos aceites no catálogo (métodos: cash, card, online, pix, mbway, transfer, other)
update tenants set settings = jsonb_set(settings, '{catalog,payments}', '["cash","transfer"]')
where slug = 'o-teu-slug';

-- só levantar no local (sem entrega)
update tenants set settings = jsonb_set(settings, '{catalog,delivery}', 'false') where slug = 'o-teu-slug';
```
Um ecrã de **Definições** para isto é a próxima etapa.

## Verificado / não verificado
Verificado com testes (Postgres real e renderização dos ecrãs): o total que o cliente vê é igual ao do servidor (com promoção e taxa); recusas (mínimo, stock, pagamento) sem mexer no stock; fluxo completo de estados; cancelar devolve stock; fidelidade automática; acompanhamento por módulo; todos os textos e erros traduzidos em 4 idiomas; rotas protegidas.

**Só se confirma no teu Supabase:** o Realtime (indicador "Ao vivo"; se não ligar, a atualização a cada 15 s continua a funcionar), a chamada `place_order` pelo browser e o envio a partir do telemóvel do cliente.
