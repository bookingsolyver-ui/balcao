# Arquitetura

## Multi-inquilino
Um negócio = uma linha em `tenants`. Quem lá trabalha está em `tenant_members` (`owner`, `admin`, `staff`).
Todas as tabelas de negócio têm `tenant_id`; as políticas RLS usam `is_member()` / `has_role()` (funções `security definer`, sem recursão).

| Papel | Pode |
|---|---|
| público (anon) | ler negócio publicado, catálogo, serviços, horários; chamar RPCs de pedido, reserva, cartão de fidelidade |
| staff | ver e avançar pedidos/reservas do negócio; pontuar e resgatar fidelidade |
| admin | tudo o que o staff faz + catálogo, serviços, equipa, definições |
| owner | tudo + gerir membros e apagar o negócio |

O público **nunca** lê pedidos, reservas nem clientes. Só recebe um `public_token` (uuid) ao criar um pedido/reserva, com o qual acompanha o estado ou cancela.

## Moeda e idioma
- `price_minor bigint` + `tenants.currency` (ISO 4217) + `tenants.currency_decimals` (0–3).
- Locale e fuso horário por negócio. Os horários livres são calculados no fuso do negócio, guardados em `timestamptz`.
- Cobrança dos negócios (o teu SaaS) é outra coisa: fase 6. Stripe (multi-moeda) ou Paddle/Lemon Squeezy (merchant of record).

## Nichos
`niche_presets` define módulos ligados, definições (taxa, prazos, pagamentos), fidelidade inicial, horário base e vocabulário. `create_tenant()` aplica o pacote.
Novo nicho = uma linha nova (e traduções), sem migração de código.

## Integridade que a base de dados garante (não a aplicação)
- Nenhuma marcação sobreposta para o mesmo profissional (`EXCLUDE USING gist`).
- Stock atómico: `place_order` bloqueia a linha do item (`FOR UPDATE`), valida e desconta na mesma transação; cancelar devolve.
- Fidelidade automática ao concluir pedido/atendimento, no máximo uma vez (`loyalty_done`).
- Estados finais (`completed`, `cancelled`) não reabrem.
- Chaves compostas `(tenant_id, …)` impedem ligar dados de negócios diferentes.

## Limitações conhecidas (v1) e como resolver
| Tema | Situação | Próximo passo |
|---|---|---|
| Consulta do cartão de fidelidade | por telefone, sem verificação: quem souber o número vê o saldo | OTP por SMS/WhatsApp antes de mostrar |
| Limite de abusos | há limites por telefone (5 pedidos/h, 3 reservas futuras) mas não por IP | Turnstile/hCaptcha + Edge Function na frente das RPCs públicas |
| WhatsApp | ligação `wa.me` com mensagem pronta; o cliente toca em enviar | API oficial do WhatsApp Business para envio automático |
| Storage | migração `…0002` só corre no Supabase e não é coberta pelos testes locais | testar no projeto de desenvolvimento |
| Pagamentos online do cliente final | só regista o método escolhido | Stripe Connect (fase futura) |
| Telefones | heurística própria em `phone.ts` | trocar por `libphonenumber-js` se surgirem países com regras difíceis |
