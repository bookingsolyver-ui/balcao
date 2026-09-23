-- Nicho "Mudanças e transportes": pedidos de orçamento com volume (m³), moradas, extras e observações.
-- O cliente pede; o preço é dado pelo negócio DEPOIS (por WhatsApp) e só fica visível ao cliente quando o orçamento é enviado.

alter table public.tenant_counters add column if not exists move_seq int not null default 1000;

create table public.move_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  number          int  not null,
  status          text not null default 'new' check (status in ('new','visit','quoted','accepted','confirmed','done','lost')),
  customer_name   text not null check (char_length(customer_name) between 2 and 120),
  customer_phone  text not null check (customer_phone ~ '^[0-9]{8,15}$'),
  customer_email  text check (customer_email is null or (char_length(customer_email) <= 160 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  move_type       text not null default 'home' check (move_type in ('home','office','furniture')),
  volume_m3       numeric(6,1) not null check (volume_m3 > 0 and volume_m3 <= 999),
  origin_street   text not null, origin_city text not null, origin_postal text,
  origin_floor    smallint check (origin_floor between -5 and 60), origin_elevator boolean, origin_access text,
  dest_street     text not null, dest_city text not null, dest_postal text,
  dest_floor      smallint check (dest_floor between -5 and 60), dest_elevator boolean, dest_access text,
  extras          text[] not null default '{}' check (cardinality(extras) <= 20),
  special_items   text[] not null default '{}' check (cardinality(special_items) <= 20),
  preferred_date  date,
  date_flexible   boolean not null default false,
  time_window     text not null default 'any' check (time_window in ('morning','afternoon','any')),
  notes           text check (notes is null or char_length(notes) <= 2000),
  consent_at      timestamptz not null,
  distance_km     int check (distance_km is null or distance_km between 0 and 20000),
  quoted_minor    bigint check (quoted_minor is null or quoted_minor >= 0),
  currency        char(3) not null,
  quote_note      text check (quote_note is null or char_length(quote_note) <= 1000),
  confirmed_date  date,
  confirmed_window text check (confirmed_window is null or confirmed_window in ('morning','afternoon','any')),
  crew            text check (crew is null or char_length(crew) <= 80),
  internal_notes  text check (internal_notes is null or char_length(internal_notes) <= 4000),
  lost_reason     text check (lost_reason is null or char_length(lost_reason) <= 200),
  public_token    uuid not null default gen_random_uuid() unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, number)
);
create index on public.move_requests (tenant_id, status, created_at desc);
create index on public.move_requests (tenant_id, confirmed_date);

-- regras de negócio garantidas pela base de dados
create or replace function public.move_requests_before_update() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if old.status = 'done' and new.status <> 'done' then raise exception 'final_status'; end if;
  if new.status in ('quoted','accepted','confirmed','done') and new.quoted_minor is null then raise exception 'quote_required'; end if;
  if new.status in ('confirmed','done') and new.confirmed_date is null then raise exception 'date_required'; end if;
  return new;
end $$;
create trigger move_requests_before_update before update on public.move_requests for each row execute function public.move_requests_before_update();

alter table public.move_requests enable row level security;
create policy move_requests_member_read   on public.move_requests for select to authenticated using (public.is_member(tenant_id));
create policy move_requests_member_update on public.move_requests for update to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy move_requests_admin_delete  on public.move_requests for delete to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
revoke all on public.move_requests from anon, authenticated;
grant select on public.move_requests to authenticated;
grant update (status, distance_km, quoted_minor, quote_note, confirmed_date, confirmed_window, crew, internal_notes, lost_reason) on public.move_requests to authenticated;
grant delete on public.move_requests to authenticated;

-- inteiro dentro de limites vindo de JSON (nulo se vazio; erro com o código indicado se inválido)
create or replace function public._json_int(v jsonb, lo int, hi int, err text) returns int language plpgsql immutable as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '' then return null; end if;
  begin n := (v #>> '{}')::numeric; exception when others then raise exception '%', err; end;
  if n <> trunc(n) or n < lo or n > hi then raise exception '%', err; end if;
  return n::int;
end $$;
revoke all on function public._json_int(jsonb, int, int, text) from public, anon, authenticated;

-- lista de textos curtos (extras, itens especiais)
create or replace function public._json_texts(v jsonb, err text) returns text[] language plpgsql immutable as $$
declare r text[];
begin
  if v is null or jsonb_typeof(v) = 'null' then return '{}'; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 20 then raise exception '%', err; end if;
  select coalesce(array_agg(left(btrim(e), 80)), '{}') into r from jsonb_array_elements_text(v) e where btrim(e) <> '';
  return r;
end $$;
revoke all on function public._json_texts(jsonb, text) from public, anon, authenticated;

-- público: pedir orçamento (tudo validado no servidor)
create or replace function public.submit_move_request(p_slug text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.tenants; o jsonb; d jsonb; v_name text; v_phone text; v_email text; v_type text; v_vol numeric; v_win text; v_pref date;
  v_today date; v_num int; v_id uuid; v_tok uuid; v_ex text[]; v_sp text[];
begin
  select * into t from public.tenants where slug = p_slug and is_published;
  if not found then raise exception 'tenant_not_found'; end if;
  if not coalesce((t.modules->>'moving')::boolean, false) then raise exception 'module_disabled'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_data'; end if;
  if coalesce(p_data->>'consent', 'false') <> 'true' then raise exception 'consent_required'; end if;

  v_name := btrim(coalesce(p_data->>'name', ''));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'invalid_name'; end if;
  v_phone := coalesce(p_data->>'phone', '');
  if v_phone !~ '^[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  v_email := nullif(btrim(coalesce(p_data->>'email', '')), '');
  if v_email is not null and (char_length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'invalid_email'; end if;
  v_type := coalesce(p_data->>'move_type', 'home');
  if v_type not in ('home','office','furniture') then raise exception 'invalid_data'; end if;
  begin v_vol := round((p_data->>'volume_m3')::numeric, 1); exception when others then raise exception 'invalid_volume'; end;
  if v_vol is null or v_vol <= 0 or v_vol > 999 then raise exception 'invalid_volume'; end if;

  o := p_data->'origin'; d := p_data->'destination';
  if jsonb_typeof(o) is distinct from 'object' or jsonb_typeof(d) is distinct from 'object'
     or char_length(btrim(coalesce(o->>'street',''))) < 3 or char_length(btrim(coalesce(o->>'city',''))) < 2
     or char_length(btrim(coalesce(d->>'street',''))) < 3 or char_length(btrim(coalesce(d->>'city',''))) < 2 then
    raise exception 'invalid_address';
  end if;
  v_ex := public._json_texts(p_data->'extras', 'invalid_extras');
  v_sp := public._json_texts(p_data->'special_items', 'invalid_extras');
  v_win := coalesce(p_data->>'time_window', 'any');
  if v_win not in ('morning','afternoon','any') then raise exception 'invalid_data'; end if;

  v_today := (now() at time zone t.timezone)::date;
  begin v_pref := nullif(p_data->>'preferred_date', '')::date; exception when others then raise exception 'invalid_date'; end;
  if v_pref is not null and (v_pref < v_today or v_pref > v_today + 730) then raise exception 'invalid_date'; end if;

  if (select count(*) from public.move_requests m where m.tenant_id = t.id and m.customer_phone = v_phone and m.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too_many_requests';
  end if;

  insert into public.tenant_counters (tenant_id) values (t.id) on conflict (tenant_id) do nothing;
  update public.tenant_counters set move_seq = move_seq + 1 where tenant_id = t.id returning move_seq into v_num;

  insert into public.move_requests (tenant_id, number, customer_name, customer_phone, customer_email, move_type, volume_m3,
      origin_street, origin_city, origin_postal, origin_floor, origin_elevator, origin_access,
      dest_street, dest_city, dest_postal, dest_floor, dest_elevator, dest_access,
      extras, special_items, preferred_date, date_flexible, time_window, notes, consent_at, currency)
  values (t.id, v_num, v_name, v_phone, v_email, v_type, v_vol,
      btrim(o->>'street'), btrim(o->>'city'), nullif(left(btrim(coalesce(o->>'postal','')), 12), ''), public._json_int(o->'floor', -5, 60, 'invalid_floor'),
      case when o->>'elevator' in ('true','false') then (o->>'elevator')::boolean end, nullif(left(btrim(coalesce(o->>'access','')), 300), ''),
      btrim(d->>'street'), btrim(d->>'city'), nullif(left(btrim(coalesce(d->>'postal','')), 12), ''), public._json_int(d->'floor', -5, 60, 'invalid_floor'),
      case when d->>'elevator' in ('true','false') then (d->>'elevator')::boolean end, nullif(left(btrim(coalesce(d->>'access','')), 300), ''),
      v_ex, v_sp, v_pref, coalesce(p_data->>'date_flexible', 'false') = 'true', v_win, nullif(left(btrim(coalesce(p_data->>'notes','')), 2000), ''), now(), t.currency)
  returning id, public_token into v_id, v_tok;

  return jsonb_build_object('number', v_num, 'public_token', v_tok, 'status', 'new');
end $$;

-- cliente: acompanhar o pedido (o preço só aparece depois de o negócio enviar o orçamento)
create or replace function public.get_move_request(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'number', m.number, 'status', m.status, 'move_type', m.move_type, 'volume_m3', m.volume_m3,
    'origin_city', m.origin_city, 'dest_city', m.dest_city, 'preferred_date', m.preferred_date, 'date_flexible', m.date_flexible, 'time_window', m.time_window,
    'confirmed_date', m.confirmed_date, 'confirmed_window', m.confirmed_window, 'currency', m.currency,
    'customer_first_name', split_part(m.customer_name, ' ', 1),
    'quoted_minor', case when m.status in ('quoted','accepted','confirmed','done') then m.quoted_minor end,
    'quote_note',   case when m.status in ('quoted','accepted','confirmed','done') then m.quote_note end,
    'can_respond', m.status = 'quoted',
    'tenant_slug', (select t.slug from public.tenants t where t.id = m.tenant_id))
  from public.move_requests m where m.public_token = p_token
$$;

-- cliente: aceitar ou recusar o orçamento
create or replace function public.respond_move_quote(p_token uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.move_requests;
begin
  select * into m from public.move_requests where public_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if m.status <> 'quoted' then raise exception 'cannot_respond'; end if;
  if p_accept then update public.move_requests set status = 'accepted' where id = m.id;
  else update public.move_requests set status = 'lost', lost_reason = 'declined_by_customer' where id = m.id; end if;
  return public.get_move_request(p_token);
end $$;

-- público: dias já cheios (só números agregados; capacidade = mudanças confirmadas por dia)
create or replace function public.move_day_load(p_slug text, p_from date, p_to date)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'capacity', coalesce((t.settings #>> '{moving,max_jobs_per_day}')::int, 2),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', g.day, 'jobs', g.n) order by g.day)
                        from (select m.confirmed_date as day, count(*)::int as n from public.move_requests m
                               where m.tenant_id = t.id and m.status = 'confirmed' and m.confirmed_date between p_from and least(p_to, p_from + 366)
                               group by m.confirmed_date) g), '[]'::jsonb))
  from public.tenants t where t.slug = p_slug and t.is_published
$$;

revoke all on function public.submit_move_request(text, jsonb), public.get_move_request(uuid), public.respond_move_quote(uuid, boolean), public.move_day_load(text, date, date) from public;
grant execute on function public.submit_move_request(text, jsonb), public.get_move_request(uuid), public.respond_move_quote(uuid, boolean), public.move_day_load(text, date, date) to anon, authenticated;

-- novo nicho
insert into public.niche_presets (niche, label, modules, settings, loyalty, hours, vocab) values
('moving',
 '{"pt":"Mudanças e transportes","en":"Moving & transport","es":"Mudanzas y transporte"}',
 '{"menu":false,"agenda":false,"catalog":false,"loyalty":false,"moving":true}',
 '{"moving":{"max_jobs_per_day":2}}',
 '{"mode":"stamps","goal":5,"min_purchase_minor":0,"reward":{"pt":"Desconto na próxima mudança","en":"Discount on your next move","es":"Descuento en tu próxima mudanza"}}',
 '{"days":[1,2,3,4,5,6],"opens":"08:00","closes":"19:00"}',
 '{"items":"moves","primary":"moving"}');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.move_requests;
  end if;
end $$;
