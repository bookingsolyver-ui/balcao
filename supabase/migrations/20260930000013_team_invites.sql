-- Convites de equipa: hoje só o dono conseguia adicionar alguém, e só mexendo diretamente no Supabase.
-- Isto dá um link/código que o dono partilha (por WhatsApp), e a pessoa entra sozinha.
-- Também liga um funcionário (login) a um prestador de serviço da agenda (ex.: "Marta"), para
-- a agenda saber de quem são as marcações de cada um.

alter table public.staff add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.staff add constraint staff_user_id_unique unique (tenant_id, user_id);

create table public.tenant_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text not null unique,
  role        public.tenant_role not null check (role in ('admin', 'staff')), -- nunca se convida outro "owner" por aqui
  staff_id    uuid references public.staff(id) on delete set null,
  created_by  uuid not null references auth.users(id),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,
  used_by     uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index on public.tenant_invites (tenant_id, created_at desc);

alter table public.tenant_invites enable row level security;
-- só quem já é owner/admin do negócio gere os convites (criar, listar, revogar)
create policy invites_owner_manage on public.tenant_invites for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
revoke all on public.tenant_invites from anon, authenticated;
grant select, insert, delete on public.tenant_invites to authenticated;

-- Código curto e sem caracteres ambíguos (sem 0/O, 1/I/L), para caber bem num link do WhatsApp.
create or replace function public.generate_invite_code() returns text language plpgsql as $$
declare chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; out_code text := ''; i int;
begin
  for i in 1..8 loop out_code := out_code || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
  return out_code;
end $$;

-- O dono/admin cria o convite (o código já sai gerado).
create or replace function public.create_invite(p_tenant uuid, p_role public.tenant_role, p_staff uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid;
begin
  if not public.has_role(p_tenant, array['owner','admin']::public.tenant_role[]) then raise exception 'forbidden'; end if;
  if p_role = 'owner' then raise exception 'invalid_role'; end if;
  if p_staff is not null and not exists (select 1 from public.staff where id = p_staff and tenant_id = p_tenant) then raise exception 'staff_not_found'; end if;
  v_code := public.generate_invite_code();
  insert into public.tenant_invites (tenant_id, code, role, staff_id, created_by) values (p_tenant, v_code, p_role, p_staff, auth.uid()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;
revoke all on function public.create_invite(uuid, public.tenant_role, uuid) from public;
grant execute on function public.create_invite(uuid, public.tenant_role, uuid) to authenticated;

-- Qualquer pessoa autenticada pode tentar aceitar um convite (é assim que entra na equipa pela 1ª vez).
create or replace function public.accept_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.tenant_invites; v_slug text;
begin
  select * into v_inv from public.tenant_invites where code = upper(p_code) for update;
  if not found then raise exception 'invalid_code'; end if;
  if v_inv.used_at is not null then raise exception 'already_used'; end if;
  if v_inv.expires_at < now() then raise exception 'expired'; end if;
  select slug into v_slug from public.tenants where id = v_inv.tenant_id;

  if exists (select 1 from public.tenant_members where tenant_id = v_inv.tenant_id and user_id = auth.uid()) then
    return jsonb_build_object('tenant_slug', v_slug, 'already_member', true);
  end if;

  insert into public.tenant_members (tenant_id, user_id, role) values (v_inv.tenant_id, auth.uid(), v_inv.role);
  if v_inv.staff_id is not null then
    update public.staff set user_id = auth.uid() where id = v_inv.staff_id and tenant_id = v_inv.tenant_id and user_id is null;
  end if;
  update public.tenant_invites set used_at = now(), used_by = auth.uid() where id = v_inv.id;
  return jsonb_build_object('tenant_slug', v_slug, 'already_member', false);
end $$;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- Ver os dados básicos de um convite antes de aceitar (nome do negócio, papel) — sem precisar de já ser membro.
create or replace function public.invite_preview(p_code text)
returns jsonb language sql security definer stable set search_path = public as $$
  select case when i.id is null then null else jsonb_build_object(
    'tenant_name', t.name, 'role', i.role, 'staff_name', s.name,
    'valid', i.used_at is null and i.expires_at > now()
  ) end
  from public.tenant_invites i
  left join public.tenants t on t.id = i.tenant_id
  left join public.staff s on s.id = i.staff_id
  where i.code = upper(p_code)
$$;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
