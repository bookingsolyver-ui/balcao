# Fase 1 — fundação (login, onboarding por nicho e loja pública)

## O que foi entregue
- **Next.js 16** (App Router, TypeScript, Tailwind 4) + `@supabase/ssr` + `next-intl` (pt-PT, pt-BR, en, es).
- `/[locale]` início · `/login` · `/signup` · `/app` painel · `/app/onboarding` · `/s/[slug]` loja pública.
- Onboarding chama `create_tenant` (nicho, país, moeda, fuso, idioma, WhatsApp) e o painel mostra os módulos do nicho.
- Loja pública lê catálogo, serviços, horário e fidelidade com a chave pública (RLS garante o que é visível).
- `/auth/callback` conclui o link de confirmação de e-mail (com proteção contra redirecionamento para outros sites).
- Preços formatados sempre com `tenants.currency_decimals` (nunca com as casas decimais que cada aparelho "acha").

## Configurar o Supabase Auth (uma vez)
No painel do Supabase, **Authentication → URL Configuration**:
- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** `http://localhost:3000/**` (depois acrescenta o domínio de produção)

**Authentication → Providers → Email:** para testar depressa, desliga *Confirm email*; liga-o antes de lançar.

## Testar no browser
```bash
npm install
npm run dev        # http://localhost:3000
```
1. Abre `http://localhost:3000` (vai para `/pt-PT`). Muda o idioma no seletor.
2. **Criar conta** → e-mail + palavra-passe (8+ caracteres).
3. O **onboarding** abre sozinho: escolhe *Restaurante*, país *Portugal* (moeda EUR e fuso Europe/Lisbon vêm preenchidos), nome e WhatsApp.
4. No painel vês os módulos do nicho ligados e o endereço da loja. Clica **Abrir loja**.
5. Repete com *Cabeleireiro* + país *Brasil* (BRL, `America/Sao_Paulo`, pt-BR) para ver outra moeda e outro idioma.
6. Para ver a loja com dados, insere alguns itens no **SQL Editor** do Supabase (a gestão de itens pela interface é a fase 2):
```sql
-- troca 'o-teu-slug' pelo endereço da tua loja
with t as (select id from tenants where slug = 'o-teu-slug')
insert into categories (tenant_id, module, name) select id, 'menu', 'Cafés' from t;
insert into items (tenant_id, module, category_id, name, description, price_minor, emoji)
select t.id, 'menu', c.id, 'Cappuccino', 'Espresso e leite vaporizado', 280, '☕'
from tenants t join categories c on c.tenant_id = t.id and c.name = 'Cafés' where t.slug = 'o-teu-slug';
```
(`280` = 2,80 na moeda do negócio: os preços são inteiros nas unidades mínimas.)

## Testes
`npm test` corre: utilidades (`test:lib`), base de dados com RLS (`test:db`) e o onboarding contra Postgres real nos 23 países (`test:onboarding`). `npm run typecheck` e `npm run build` também têm de passar.

## O que NÃO foi possível verificar fora do teu computador
- O fluxo real de **login/registo** e o envio do e-mail de confirmação (dependem do teu projeto Supabase).
- A chamada `rpc('create_tenant')` pela API do Supabase: foi testada contra o Postgres com os mesmos parâmetros do formulário, mas não através do PostgREST.
- A consulta `tenant_members` + `tenants(*)` do painel (relação embutida do PostgREST).
Se algum destes falhar, copia a mensagem de erro do terminal ou da consola do browser.

## Próxima fase (restaurante)
Gestão de itens/categorias pelo painel (com fotos no bucket `item-images`), carrinho, `place_order`, fila de pedidos em tempo real e mensagem de WhatsApp.
