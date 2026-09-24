-- Avaliações públicas de negócios reais, para prova social na página de vendas.
-- Só quem tem conta e é membro do negócio (owner/admin — representa o negócio publicamente) pode escrever.
-- Uma avaliação por negócio (pode editar depois). Visível ao público só quando "visible" está ligado.

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null unique references public.tenants(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null check (char_length(body) between 10 and 500),
  author_name  text not null check (char_length(author_name) between 2 and 80),
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.reviews_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger reviews_before_update before update on public.reviews
  for each row execute function public.reviews_touch();

alter table public.reviews enable row level security;

-- público (e qualquer autenticado): só vê avaliações visíveis — nunca o tenant_id, isso é só para nós
create policy reviews_public_read on public.reviews for select to anon, authenticated using (visible = true);
-- a equipa do negócio também vê a sua própria, mesmo escondida (para saber que a escreveu / que foi escondida)
create policy reviews_owner_read on public.reviews for select to authenticated using (public.is_member(tenant_id));
create policy reviews_owner_write on public.reviews for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy reviews_owner_update on public.reviews for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy reviews_owner_delete on public.reviews for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (tenant_id, rating, body, author_name) on public.reviews to authenticated;
grant update (rating, body, author_name) on public.reviews to authenticated; -- nunca "visible": só nós escondemos, pelo painel do Supabase
grant delete on public.reviews to authenticated;
