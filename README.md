# Balcão

Plataforma multi-inquilino para negócios locais: **cardápio digital**, **agendamento**, **catálogo** e **fidelidade**, vendida por nicho
(restaurante, cabeleireiro/barbearia, loja de beleza, …), com **moeda, idioma e fuso por negócio**.

## O que já está aqui
| Pasta | Conteúdo |
|---|---|
| `supabase/migrations/` | esquema, RLS, RPCs e gatilhos (Postgres) |
| `tests/` | 60+ verificações da base de dados (Postgres real em memória) e das utilidades |
| `src/lib/` | `money.ts` (moeda universal) e `phone.ts` (telefones internacionais + WhatsApp) |
| `docs/prototype/` | protótipo de UI (abre no browser) — referência de design e fluxos |
| `docs/ARCHITECTURE.md` | decisões, modelo de segurança e limitações |
| `CLAUDE.md` | briefing para o Claude Code continuar o desenvolvimento |

## Começar (VS Code)
```bash
unzip balcao-repo.zip && cd balcao-repo
code .
npm install
npm test            # deve terminar com TODOS OS TESTES PASSARAM
```

## GitHub
```bash
git init && git add . && git commit -m "feat: base multi-inquilino do Balcão"
git branch -M main
git remote add origin https://github.com/<o-teu-utilizador>/balcao.git   # cria o repositório vazio no GitHub primeiro
git push -u origin main
```
Usa um repositório **novo**, separado do `vexto-app`.

## Supabase
1. Cria um projeto **de desenvolvimento** em supabase.com e copia o *Project ID* (ref).
2. Aplica as migrações — escolhe uma via:
   - **CLI**: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`
   - **Claude Code + MCP**: `cp .mcp.json.example .mcp.json`, troca `<PROJECT_REF…>`, abre um terminal normal e corre `claude /mcp` → *supabase* → *Authenticate*. Depois pede: *"aplica as migrações de supabase/migrations ao projeto"* e revê o SQL antes de aceitar.
3. Copia `.env.example` para `.env.local` e preenche URL e *anon key*.
4. Em *Authentication*, ativa o e-mail (e o que quiseres) para os donos dos negócios.

## Continuar com o Claude Code
Abre a pasta no VS Code, abre o Claude Code e diz: *"Lê o CLAUDE.md e começa a fase 1."*
