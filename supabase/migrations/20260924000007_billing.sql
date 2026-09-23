-- Faturação do Balcão às empresas (não confundir com os pagamentos que as empresas recebem dos seus próprios clientes).
-- Tabela própria e fechada: a loja pública nunca vê isto (ao contrário de "tenants", que o público lê para mostrar a loja).

create table public.tenant_billing (
  tenant_id            uuid primary key references public.tenants(id) on delete cascade,
  status               text not null default 'trialing' check (status in ('trialing','active','past_due','paused','canceled')),
  plan                 text not null default 'standard',
  paddle_customer_id     text,
  paddle_subscription_id text unique,
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  updated_at           timestamptz not null default now()
);

create or replace function public.tenant_billing_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger tenant_billing_before_update before update on public.tenant_billing
  for each row execute function public.tenant_billing_touch();

-- Todo negócio novo nasce com um período de avaliação de 14 dias (sem qualquer subscrição paga).
create or replace function public.tenant_billing_init() returns trigger language plpgsql as $$
begin
  insert into public.tenant_billing (tenant_id, status, trial_ends_at) values (new.id, 'trialing', now() + interval '14 days');
  return new;
end $$;
create trigger tenants_after_insert_billing after insert on public.tenants
  for each row execute function public.tenant_billing_init();

alter table public.tenant_billing enable row level security;
-- Só quem trabalha no negócio vê o seu próprio estado de faturação — nunca o público, nunca outro negócio.
create policy tenant_billing_member_read on public.tenant_billing for select to authenticated using (public.is_member(tenant_id));
revoke all on public.tenant_billing from anon, authenticated;
grant select on public.tenant_billing to authenticated;
-- Sem "insert/update/delete" para "authenticated": só o service_role (usado só no recetor de eventos do Paddle, nunca no browser) escreve aqui.

-- Backfill: negócios já existentes (criados antes desta migração) também ganham um registo, em avaliação.
insert into public.tenant_billing (tenant_id, status, trial_ends_at)
  select id, 'trialing', now() + interval '14 days' from public.tenants
  on conflict (tenant_id) do nothing;
