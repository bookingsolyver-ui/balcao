# Balcão — briefing para o Claude Code

Plataforma **multi-inquilino** para negócios locais (restaurantes, cabeleireiros, lojas de beleza, etc.).
Cada negócio (*tenant*) tem uma loja pública para clientes e um painel para a equipa.
Quatro módulos, ligáveis por negócio: **menu** (cardápio + pedidos), **agenda** (marcações), **catalog** (produtos + pedidos), **loyalty** (carimbos/pontos).
O produto vende-se por **nicho** (pacotes em `niche_presets`), mas é UM só código e UMA só base de dados.

## Estado atual
- `supabase/migrations/` — esquema completo, RLS, RPCs, gatilhos. **Testado**: `npm run test:db`.
- `src/lib/` — moeda, telefones, países, slugs, horário de funcionamento, erros. **Testado**: `npm run test:lib`.
- **Fase 1 entregue** (ver `docs/FASE1.md`): Next.js 16 + next-intl + Supabase SSR; login, registo, onboarding por nicho, painel e loja pública. Onboarding validado contra Postgres real nos 23 países (`npm run test:onboarding`).
- `docs/prototype/balcao-prototype.html` — protótipo de UI e comportamento (referência de design e fluxos).
- **Fase 2A entregue** (ver `docs/FASE2A.md`): gestão de categorias e itens/produtos pelo painel, com fotos no bucket `item-images`.
- **Fase 2B entregue** (ver `docs/FASE2B.md`): carrinho, checkout com `place_order`, acompanhamento por token, fila de pedidos em tempo real e WhatsApp. Migração `20260920000003_order_tracking.sql`.
- **Definições entregues** (ver `docs/SETTINGS.md`): país/fuso/idioma, módulos, taxa, mínimo, pagamentos (novos `express` e `store`), horário. Migração `20260920000004_payment_methods.sql`. Pagamentos só são registados, não cobrados.
- **Agenda, fidelidade e loja fechada entregues** (ver `docs/AGENDA-FIDELIDADE.md`). Migração `20260920000005_only_when_open.sql`. Módulos completos: cardápio, catálogo, agenda, fidelidade, definições.
- **Nicho "Mudanças e transportes" entregue** (ver `docs/MUDANCAS.md`): pedido de orçamento (m³, moradas, extras, observações, consentimento), painel com fila por estado, orçamento visível ao cliente só depois de enviado, aceitar/recusar, exportação CSV/Excel. Migração `20260921000006_moving.sql`.
- Próximo (produção): ambiente de produção separado, domínio + Vercel, verificação por código no cartão de fidelidade, Turnstile, cobrança dos negócios (Stripe/Paddle), envio automático por WhatsApp Business API, textos legais (privacidade, termos).

## Stack a usar (a mesma do projeto vexto-app do dono)
Next.js 16 (App Router; o antigo `middleware` chama-se `proxy`) + TypeScript + Tailwind 4 + `@supabase/ssr` + `next-intl` (pt-PT, pt-BR, en, es). Deploy na Vercel.

## Regras que NÃO se quebram
1. **Dinheiro**: inteiros na menor unidade (`*_minor`) + ISO 4217 por tenant. Formatar só com `formatMoney(minor, currency, locale, tenant.currency_decimals)`: passar SEMPRE as casas decimais guardadas no negócio (o `Intl` varia entre aparelhos, ex.: COP). Nunca `float`.
2. **Preços nunca vêm do cliente.** Pedidos só por `rpc('place_order')`, reservas só por `rpc('create_booking')`. O servidor recalcula tudo.
3. **RLS em toda a tabela nova** + `revoke all ... from anon` + políticas explícitas. O Supabase concede tudo por defeito; fechar é responsabilidade nossa.
4. Telefones sempre em dígitos internacionais (`toE164Digits`). Nunca assumir um país.
5. Cada tabela de negócio tem `tenant_id`. Chaves estrangeiras compostas `(tenant_id, id)` para impedir referências entre negócios.
6. `service_role` **nunca** no browser nem com prefixo `NEXT_PUBLIC_`.
7. Alterações de esquema = nova migração em `supabase/migrations/` + teste em `tests/db.test.mjs`. Nunca editar migrações já aplicadas.
8. Textos da interface em ficheiros de tradução; nada de português fixo em componentes.

## Rotas alvo
- `/[locale]/s/[slug]` — loja pública (abas conforme `tenants.modules`; vocabulário vem de `niche_presets.vocab`).
- `/[locale]/app` — painel (login Supabase Auth; `create_tenant` no onboarding com escolha de nicho, moeda, país, fuso).
- `/[locale]/app/{orders,catalog,agenda,loyalty,customers,settings}`.
- Fila de pedidos em tempo real via Supabase Realtime (`orders`, `bookings` já estão na publicação).

## Fases (critérios de aceitação)
1. **Fundação**: auth, onboarding por nicho, painel vazio, loja pública lendo `tenants` por slug. ✔ quando um utilizador cria um negócio e vê a loja em `/s/slug`.
2. **Restaurante**: itens/categorias (CRUD com fotos no bucket `item-images`, caminho `{tenant_id}/...`), carrinho, `place_order`, fila em tempo real, mensagem WhatsApp.
3. **Cabeleireiro**: serviços, equipa, horários, `available_slots` + `create_booking`, agenda do dia, cancelar por token.
4. **Loja de beleza**: catálogo com stock e promoções, pedidos por `place_order(module:'catalog')`.
5. **Fidelidade**: pontuar no balcão (`loyalty_earn`), cartão do cliente (`loyalty_card`), resgate.
6. **Cobrança dos negócios**: Stripe ou Paddle (merchant of record trata do IVA por país). Fora do âmbito até a fase 5 estar validada.

## Códigos de erro das RPCs (mensagem = código)
`tenant_not_found` `module_disabled` `invalid_name` `invalid_phone` `fulfillment_not_allowed` `address_required` `table_required`
`empty_cart` `payment_not_allowed` `too_many_orders` `invalid_quantity` `item_unavailable` `insufficient_stock` `below_minimum`
`slot_unavailable` `service_unavailable` `too_many_bookings` `not_found` `cannot_cancel` `forbidden` `final_status`
`not_authenticated` `tenant_limit` `invalid_timezone` `invalid_niche` `not_enough_balance` `no_program` `no_points`.
Traduzir cada um na interface.

## Supabase MCP — segurança
Usar só num projeto **de desenvolvimento**, com `project_ref` definido e, por defeito, `read_only=true`. Rever todo o SQL antes de aplicar.
Preferir `supabase db push` / migrações versionadas a `execute_sql` para alterar esquema. Depois de mexer no esquema: `npm run test:db`.
Autenticar o MCP num terminal normal com `claude /mcp` (não na extensão do IDE).

## Comandos
`npm run test` · `npm run test:db` · `npm run test:lib` · `npm run typecheck`
