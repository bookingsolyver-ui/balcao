-- =====================================================================
-- Balcão · esquema principal (multi-inquilino)
--
-- Princípios
--  1. Cada negócio é um "tenant". Todo dado de negócio leva tenant_id.
--  2. Preços em unidades mínimas inteiras (cêntimos) + moeda ISO 4217 por tenant.
--  3. Telefones em formato internacional só com dígitos (E.164 sem "+").
--  4. RLS ligado em TODAS as tabelas. O público (anon) só LÊ o catálogo
--     publicado e ESCREVE através de funções (RPC) que validam tudo no servidor.
--  5. Pedidos, agendamentos e clientes nunca são legíveis pelo público.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Pacotes por nicho (dados, não código: novos nichos = novas linhas)
-- ---------------------------------------------------------------------
create table public.niche_presets (
  niche    text primary key,
  label    jsonb not null,                       -- {"pt":"...","en":"..."}
  modules  jsonb not null,                       -- módulos ligados por defeito
  settings jsonb not null default '{}'::jsonb,   -- sobrepõe as definições base
  loyalty  jsonb not null,                       -- programa de fidelidade inicial
  hours    jsonb not null,                       -- {"days":[1..6],"opens":"09:00","closes":"18:00"}
  vocab    jsonb not null default '{}'::jsonb    -- rótulos que a interface usa
);

create or replace function public.default_settings() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'menu',   jsonb_build_object('pickup',true,'delivery',true,'dine_in',true,'fee_minor',0,'min_minor',0,'eta','30-45 min','payments',jsonb_build_array('cash','card')),
    'catalog',jsonb_build_object('pickup',true,'delivery',true,'dine_in',false,'fee_minor',0,'min_minor',0,'eta','1-2 dias','payments',jsonb_build_array('card','transfer'),'low_stock',3),
    'agenda', jsonb_build_object('slot_step_min',30,'days_ahead',21,'min_notice_hours',2,'auto_confirm',true)
  )
$$;

insert into public.niche_presets (niche,label,modules,settings,loyalty,hours,vocab) values
('restaurant',
  '{"pt":"Restaurante, café e takeaway","en":"Restaurant, café & takeaway","es":"Restaurante, café y comida para llevar"}',
  '{"menu":true,"agenda":false,"catalog":false,"loyalty":true}',
  '{}',
  '{"mode":"stamps","goal":10,"min_purchase_minor":0,"reward":{"pt":"1 refeição grátis","en":"1 free meal","es":"1 comida gratis"}}',
  '{"days":[0,1,2,3,4,5,6],"opens":"11:00","closes":"23:00"}',
  '{"items":"menu","primary":"menu"}'),
('salon',
  '{"pt":"Cabeleireiro, barbearia e estética","en":"Hair salon, barber & beauty studio","es":"Peluquería, barbería y estética"}',
  '{"menu":false,"agenda":true,"catalog":false,"loyalty":true}',
  '{"agenda":{"slot_step_min":30,"days_ahead":30,"min_notice_hours":2,"auto_confirm":true}}',
  '{"mode":"stamps","goal":6,"min_purchase_minor":0,"reward":{"pt":"1 serviço com desconto","en":"1 discounted service","es":"1 servicio con descuento"}}',
  '{"days":[2,3,4,5,6],"opens":"09:00","closes":"19:00"}',
  '{"items":"services","primary":"agenda"}'),
('beauty_store',
  '{"pt":"Loja de produtos de beleza","en":"Beauty products store","es":"Tienda de productos de belleza"}',
  '{"menu":false,"agenda":false,"catalog":true,"loyalty":true}',
  '{"catalog":{"pickup":true,"delivery":true,"dine_in":false,"fee_minor":0,"min_minor":0,"eta":"1-3 dias","payments":["card","transfer","online"],"low_stock":5}}',
  '{"mode":"points","goal":100,"min_purchase_minor":0,"points_per_unit":1,"reward":{"pt":"Vale de desconto","en":"Discount voucher","es":"Vale de descuento"}}',
  '{"days":[1,2,3,4,5,6],"opens":"10:00","closes":"19:00"}',
  '{"items":"products","primary":"catalog"}'),
('general',
  '{"pt":"Outro tipo de negócio","en":"Other business","es":"Otro tipo de negocio"}',
  '{"menu":false,"agenda":false,"catalog":true,"loyalty":true}',
  '{}',
  '{"mode":"stamps","goal":8,"min_purchase_minor":0,"reward":{"pt":"Prémio","en":"Reward","es":"Premio"}}',
  '{"days":[1,2,3,4,5],"opens":"09:00","closes":"18:00"}',
  '{"items":"products","primary":"catalog"}');

-- ---------------------------------------------------------------------
-- Negócios e equipa
-- ---------------------------------------------------------------------
create type public.tenant_role as enum ('owner','admin','staff');

create table public.tenants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                       and slug not in ('admin','api','app','www','s','login','signup','dashboard','static','settings')),
  name              text not null check (char_length(name) between 2 and 80),
  niche             text not null default 'general' references public.niche_presets(niche),
  currency          char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  currency_decimals smallint not null default 2 check (currency_decimals between 0 and 3),
  locale            text not null default 'pt-PT',
  timezone          text not null default 'Europe/Lisbon',
  country           char(2) not null default 'PT' check (country ~ '^[A-Z]{2}$'),
  whatsapp          text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  address           text,
  accent            text not null default 'blue',
  modules           jsonb not null default '{"menu":false,"agenda":false,"catalog":false,"loyalty":false}'::jsonb,
  settings          jsonb not null default '{}'::jsonb,
  is_published      boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.tenant_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index on public.tenant_members (user_id);

-- funções auxiliares usadas nas políticas (security definer evita recursão de RLS)
create or replace function public.is_member(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_members m where m.tenant_id = p_tenant and m.user_id = auth.uid())
$$;

create or replace function public.has_role(p_tenant uuid, p_roles public.tenant_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_members m where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = any (p_roles))
$$;

create or replace function public.tenant_is_published(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants t where t.id = p_tenant and t.is_published)
$$;

-- ---------------------------------------------------------------------
-- Catálogo (cardápio e catálogo partilham a mesma tabela: coluna module)
-- ---------------------------------------------------------------------
create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module    text not null check (module in ('menu','catalog')),
  name      text not null check (char_length(name) between 1 and 60),
  position  int not null default 0,
  unique (tenant_id, id)
);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  module       text not null check (module in ('menu','catalog')),
  category_id  uuid,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  price_minor  bigint not null check (price_minor >= 0),
  promo_minor  bigint check (promo_minor is null or (promo_minor >= 0 and promo_minor < price_minor)),
  stock        int check (stock is null or stock >= 0),   -- null = sem controlo de stock
  emoji        text,
  image_path   text,                                       -- caminho no Storage
  active       boolean not null default true,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id) on delete set null (category_id)
);
create index on public.items (tenant_id, module);

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table public.services (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  description  text not null default '',
  duration_min int  not null check (duration_min between 5 and 720),
  price_minor  bigint not null default 0 check (price_minor >= 0),
  active       boolean not null default true,
  position     int not null default 0,
  unique (tenant_id, id)
);

create table public.staff (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 80),
  active    boolean not null default true,
  unique (tenant_id, id)
);

create table public.business_hours (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  weekday   smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  is_open   boolean not null default true,
  opens     time not null default '09:00',
  closes    time not null default '18:00',
  check (closes > opens),
  primary key (tenant_id, weekday)
);

create table public.blocked_dates (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day       date not null,
  primary key (tenant_id, day)
);

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  service_id     uuid,
  staff_id       uuid,
  service_name   text not null,
  staff_name     text not null,
  duration_min   int  not null,
  price_minor    bigint not null default 0,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled','no_show')),
  customer_name  text not null check (char_length(customer_name) >= 2),
  customer_phone text not null check (customer_phone ~ '^[0-9]{8,15}$'),
  note           text,
  public_token   uuid not null default gen_random_uuid() unique,
  loyalty_done   boolean not null default false,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id) on delete set null (service_id),
  foreign key (tenant_id, staff_id)   references public.staff (tenant_id, id)    on delete set null (staff_id),
  -- a base de dados garante que a mesma pessoa não tem dois atendimentos sobrepostos
  constraint bookings_no_overlap exclude using gist (
    staff_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending','confirmed','completed'))
);
create index on public.bookings (tenant_id, starts_at);

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table public.tenant_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  order_seq int not null default 1000
);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  number            int  not null,
  module            text not null check (module in ('menu','catalog')),
  status            text not null default 'new'
                    check (status in ('new','preparing','ready','confirmed','shipped','completed','cancelled')),
  fulfillment       text not null check (fulfillment in ('pickup','delivery','dine_in')),
  customer_name     text not null check (char_length(customer_name) >= 2),
  customer_phone    text not null check (customer_phone ~ '^[0-9]{8,15}$'),
  address           text,
  table_label       text,
  payment_method    text not null default 'cash' check (payment_method in ('cash','card','online','pix','mbway','transfer','other')),
  cash_change_minor bigint,
  note              text,
  subtotal_minor    bigint not null default 0,
  fee_minor         bigint not null default 0,
  total_minor       bigint not null default 0,
  currency          char(3) not null,
  public_token      uuid not null default gen_random_uuid() unique,
  loyalty_done      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id)
);
create index on public.orders (tenant_id, status, created_at desc);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  item_id     uuid,
  name        text not null,
  unit_minor  bigint not null check (unit_minor >= 0),
  qty         int not null check (qty between 1 and 99),
  note        text,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, item_id)  references public.items (tenant_id, id)  on delete set null (item_id)
);
create index on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- Fidelidade
-- ---------------------------------------------------------------------
create table public.loyalty_programs (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  mode               text not null default 'stamps' check (mode in ('stamps','points')),
  goal               int  not null default 8 check (goal > 0),
  reward             text not null default 'Reward',
  points_per_unit    numeric(10,2) not null default 1 check (points_per_unit >= 0),  -- pontos por 1 unidade de moeda
  min_purchase_minor bigint not null default 0,
  auto_earn          boolean not null default true
);

create table public.loyalty_customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  phone       text not null check (phone ~ '^[0-9]{8,15}$'),
  name        text not null,
  balance     int  not null default 0 check (balance >= 0),
  visits      int  not null default 0,
  rewards     int  not null default 0,
  total_minor bigint not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, id)
);

create table public.loyalty_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  kind        text not null check (kind in ('join','earn','redeem','adjust')),
  delta       int  not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.loyalty_customers (tenant_id, id) on delete cascade
);
create index on public.loyalty_events (customer_id, created_at desc);

-- =====================================================================
-- Fidelidade: funções
-- =====================================================================
create or replace function public._loyalty_earn(p_tenant uuid, p_phone text, p_name text, p_amount_minor bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.loyalty_programs; v_dec smallint; v_c public.loyalty_customers; v_delta int;
begin
  select * into v_p from public.loyalty_programs where tenant_id = p_tenant;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_program'); end if;
  select currency_decimals into v_dec from public.tenants where id = p_tenant;

  if v_p.mode = 'stamps' then
    if coalesce(p_amount_minor,0) < v_p.min_purchase_minor then
      return jsonb_build_object('ok', false, 'error', 'below_minimum');
    end if;
    v_delta := 1;
  else
    v_delta := floor((coalesce(p_amount_minor,0)::numeric / power(10, v_dec)) * v_p.points_per_unit)::int;
    if v_delta < 1 then return jsonb_build_object('ok', false, 'error', 'no_points'); end if;
  end if;

  select * into v_c from public.loyalty_customers where tenant_id = p_tenant and phone = p_phone for update;
  if not found then
    insert into public.loyalty_customers (tenant_id, phone, name) values (p_tenant, p_phone, coalesce(nullif(trim(p_name),''),'Cliente')) returning * into v_c;
    insert into public.loyalty_events (tenant_id, customer_id, kind, note) values (p_tenant, v_c.id, 'join', 'join');
  end if;

  update public.loyalty_customers
     set balance = balance + v_delta, visits = visits + 1, total_minor = total_minor + coalesce(p_amount_minor,0)
   where id = v_c.id returning * into v_c;
  insert into public.loyalty_events (tenant_id, customer_id, kind, delta, note) values (p_tenant, v_c.id, 'earn', v_delta, coalesce(p_note,'purchase'));

  return jsonb_build_object('ok', true, 'customer_id', v_c.id, 'name', v_c.name, 'delta', v_delta,
                            'balance', v_c.balance, 'goal', v_p.goal, 'reward_ready', v_c.balance >= v_p.goal);
end $$;

-- balcão: pontuar (só equipa do negócio)
create or replace function public.loyalty_earn(p_tenant uuid, p_phone text, p_name text, p_amount_minor bigint default 0, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_tenant) then raise exception 'forbidden'; end if;
  if p_phone !~ '^[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  return public._loyalty_earn(p_tenant, p_phone, p_name, p_amount_minor, p_note);
end $$;

create or replace function public.loyalty_redeem(p_customer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.loyalty_customers; v_p public.loyalty_programs;
begin
  select * into v_c from public.loyalty_customers where id = p_customer for update;
  if not found or not public.is_member(v_c.tenant_id) then raise exception 'forbidden'; end if;
  select * into v_p from public.loyalty_programs where tenant_id = v_c.tenant_id;
  if v_c.balance < v_p.goal then raise exception 'not_enough_balance'; end if;
  update public.loyalty_customers set balance = balance - v_p.goal, rewards = rewards + 1 where id = v_c.id returning * into v_c;
  insert into public.loyalty_events (tenant_id, customer_id, kind, delta, note) values (v_c.tenant_id, v_c.id, 'redeem', -v_p.goal, v_p.reward);
  return jsonb_build_object('ok', true, 'balance', v_c.balance);
end $$;

create or replace function public.loyalty_adjust(p_customer uuid, p_delta int, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.loyalty_customers;
begin
  select * into v_c from public.loyalty_customers where id = p_customer for update;
  if not found or not public.has_role(v_c.tenant_id, array['owner','admin']::public.tenant_role[]) then raise exception 'forbidden'; end if;
  update public.loyalty_customers set balance = greatest(0, balance + p_delta) where id = v_c.id returning * into v_c;
  insert into public.loyalty_events (tenant_id, customer_id, kind, delta, note) values (v_c.tenant_id, v_c.id, 'adjust', p_delta, coalesce(p_note,'adjust'));
  return jsonb_build_object('ok', true, 'balance', v_c.balance);
end $$;

-- cliente: cartão por telefone (v1: sem OTP; ver docs/ARCHITECTURE.md > Segurança)
create or replace function public.loyalty_card(p_slug text, p_phone text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v_t public.tenants; v_p public.loyalty_programs; v_c public.loyalty_customers;
begin
  select * into v_t from public.tenants where slug = p_slug and is_published and (modules->>'loyalty')::boolean;
  if not found then return jsonb_build_object('found', false); end if;
  select * into v_p from public.loyalty_programs where tenant_id = v_t.id;
  select * into v_c from public.loyalty_customers where tenant_id = v_t.id and phone = p_phone;
  if not found then return jsonb_build_object('found', false, 'mode', v_p.mode, 'goal', v_p.goal, 'reward', v_p.reward); end if;
  return jsonb_build_object('found', true, 'first_name', split_part(v_c.name, ' ', 1), 'balance', v_c.balance,
    'mode', v_p.mode, 'goal', v_p.goal, 'reward', v_p.reward, 'reward_ready', v_c.balance >= v_p.goal,
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'delta', e.delta, 'note', e.note, 'at', e.created_at) order by e.created_at desc)
                          from (select * from public.loyalty_events where customer_id = v_c.id order by created_at desc limit 8) e), '[]'::jsonb));
end $$;

create or replace function public.loyalty_join(p_slug text, p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t public.tenants; v_c public.loyalty_customers;
begin
  select * into v_t from public.tenants where slug = p_slug and is_published and (modules->>'loyalty')::boolean;
  if not found then raise exception 'tenant_not_found'; end if;
  if p_phone !~ '^[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'invalid_name'; end if;
  insert into public.loyalty_customers (tenant_id, phone, name) values (v_t.id, p_phone, trim(p_name))
    on conflict (tenant_id, phone) do nothing returning * into v_c;
  if found then insert into public.loyalty_events (tenant_id, customer_id, kind, note) values (v_t.id, v_c.id, 'join', 'join'); end if;
  return public.loyalty_card(p_slug, p_phone);
end $$;

-- =====================================================================
-- Pedidos: criação no servidor (o cliente nunca envia preços)
-- =====================================================================
create or replace function public.place_order(
  p_slug text, p_module text, p_items jsonb, p_fulfillment text,
  p_customer_name text, p_customer_phone text,
  p_address text default null, p_table text default null,
  p_payment text default 'cash', p_cash_change_minor bigint default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.tenants; v_cfg jsonb; v_it public.items; v_e jsonb; v_qty int;
  v_unit bigint; v_sub bigint := 0; v_fee bigint := 0; v_num int; v_id uuid; v_tok uuid;
begin
  select * into v_t from public.tenants where slug = p_slug and is_published;
  if not found then raise exception 'tenant_not_found'; end if;
  if p_module not in ('menu','catalog') or not coalesce((v_t.modules->>p_module)::boolean, false) then raise exception 'module_disabled'; end if;
  v_cfg := coalesce(v_t.settings->p_module, public.default_settings()->p_module);

  if char_length(trim(coalesce(p_customer_name,''))) < 2 then raise exception 'invalid_name'; end if;
  if coalesce(p_customer_phone,'') !~ '^[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  if p_fulfillment not in ('pickup','delivery','dine_in') or not coalesce((v_cfg->>p_fulfillment)::boolean, false) then raise exception 'fulfillment_not_allowed'; end if;
  if p_fulfillment = 'delivery' and char_length(trim(coalesce(p_address,''))) < 5 then raise exception 'address_required'; end if;
  if p_fulfillment = 'dine_in' and char_length(trim(coalesce(p_table,''))) < 1 then raise exception 'table_required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'empty_cart'; end if;
  if (v_cfg ? 'payments') and not ((v_cfg->'payments') ? p_payment) then raise exception 'payment_not_allowed'; end if;
  if (select count(*) from public.orders o where o.tenant_id = v_t.id and o.customer_phone = p_customer_phone and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_orders';
  end if;

  insert into public.tenant_counters (tenant_id, order_seq) values (v_t.id, 1001)
    on conflict (tenant_id) do update set order_seq = public.tenant_counters.order_seq + 1
    returning order_seq into v_num;

  insert into public.orders (tenant_id, number, module, fulfillment, customer_name, customer_phone, address, table_label,
                             payment_method, cash_change_minor, note, currency)
  values (v_t.id, v_num, p_module, p_fulfillment, trim(p_customer_name), p_customer_phone,
          case when p_fulfillment = 'delivery' then trim(p_address) end,
          case when p_fulfillment = 'dine_in' then trim(p_table) end,
          p_payment, case when p_payment = 'cash' then p_cash_change_minor end, nullif(trim(coalesce(p_note,'')),''), v_t.currency)
  returning id, public_token into v_id, v_tok;

  for v_e in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_e->>'qty')::int, 0);
    if v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity'; end if;
    select * into v_it from public.items where id = (v_e->>'item_id')::uuid and tenant_id = v_t.id and module = p_module for update;
    if not found or not v_it.active then raise exception 'item_unavailable'; end if;
    if v_it.stock is not null then
      if v_it.stock < v_qty then raise exception 'insufficient_stock'; end if;
      update public.items set stock = stock - v_qty where id = v_it.id;
    end if;
    v_unit := case when v_it.promo_minor is not null and v_it.promo_minor < v_it.price_minor then v_it.promo_minor else v_it.price_minor end;
    insert into public.order_items (order_id, tenant_id, item_id, name, unit_minor, qty, note)
    values (v_id, v_t.id, v_it.id, v_it.name, v_unit, v_qty, nullif(left(trim(coalesce(v_e->>'note','')), 200),''));
    v_sub := v_sub + v_unit * v_qty;
  end loop;

  if v_sub < coalesce((v_cfg->>'min_minor')::bigint, 0) then raise exception 'below_minimum'; end if;
  if p_fulfillment = 'delivery' then v_fee := coalesce((v_cfg->>'fee_minor')::bigint, 0); end if;
  update public.orders set subtotal_minor = v_sub, fee_minor = v_fee, total_minor = v_sub + v_fee where id = v_id;

  return jsonb_build_object('order_id', v_id, 'number', v_num, 'total_minor', v_sub + v_fee, 'currency', v_t.currency, 'public_token', v_tok);
end $$;

create or replace function public.get_order_status(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object('number', o.number, 'status', o.status, 'fulfillment', o.fulfillment, 'total_minor', o.total_minor,
    'currency', o.currency, 'created_at', o.created_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unit_minor', i.unit_minor)), '[]'::jsonb) from public.order_items i where i.order_id = o.id))
  from public.orders o where o.public_token = p_token
$$;

-- =====================================================================
-- Agenda: horários livres e reservas, calculados no servidor
-- =====================================================================
create or replace function public.available_slots(p_slug text, p_service uuid, p_staff uuid, p_date date)
returns table (out_time time, out_staff uuid)
language plpgsql security definer stable set search_path = public as $$
declare
  v_t public.tenants; v_s public.services; v_h public.business_hours; v_step int; v_notice interval; v_today date; v_days int;
begin
  select * into v_t from public.tenants where slug = p_slug and is_published and (modules->>'agenda')::boolean;
  if not found then return; end if;
  select * into v_s from public.services where id = p_service and tenant_id = v_t.id and active;
  if not found then return; end if;
  v_today := (now() at time zone v_t.timezone)::date;
  v_days  := coalesce((v_t.settings #>> '{agenda,days_ahead}')::int, 21);
  if p_date < v_today or p_date > v_today + v_days then return; end if;
  if exists (select 1 from public.blocked_dates b where b.tenant_id = v_t.id and b.day = p_date) then return; end if;
  select * into v_h from public.business_hours bh where bh.tenant_id = v_t.id and bh.weekday = extract(dow from p_date)::int;
  if not found or not v_h.is_open then return; end if;
  v_step   := greatest(5, coalesce((v_t.settings #>> '{agenda,slot_step_min}')::int, 30));
  v_notice := make_interval(hours => coalesce((v_t.settings #>> '{agenda,min_notice_hours}')::int, 0));

  return query
  select distinct on (g.ts) g.ts::time, st.id
    from generate_series(p_date::timestamp + v_h.opens,
                         p_date::timestamp + v_h.closes - make_interval(mins => v_s.duration_min),
                         make_interval(mins => v_step)) as g(ts)
    join public.staff st on st.tenant_id = v_t.id and st.active and (p_staff is null or st.id = p_staff)
   where (g.ts at time zone v_t.timezone) >= now() + v_notice
     and not exists (
       select 1 from public.bookings b
        where b.staff_id = st.id and b.status in ('pending','confirmed','completed')
          and tstzrange(b.starts_at, b.ends_at) && tstzrange(g.ts at time zone v_t.timezone,
                                                             (g.ts + make_interval(mins => v_s.duration_min)) at time zone v_t.timezone))
   order by g.ts, st.name, st.id;
end $$;

create or replace function public.create_booking(
  p_slug text, p_service uuid, p_staff uuid, p_date date, p_time time,
  p_customer_name text, p_customer_phone text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.tenants; v_s public.services; v_staff uuid; v_sn text; v_start timestamptz; v_id uuid; v_tok uuid; v_status text;
begin
  select * into v_t from public.tenants where slug = p_slug and is_published and (modules->>'agenda')::boolean;
  if not found then raise exception 'tenant_not_found'; end if;
  if char_length(trim(coalesce(p_customer_name,''))) < 2 then raise exception 'invalid_name'; end if;
  if coalesce(p_customer_phone,'') !~ '^[0-9]{8,15}$' then raise exception 'invalid_phone'; end if;
  if (select count(*) from public.bookings b where b.tenant_id = v_t.id and b.customer_phone = p_customer_phone
        and b.status in ('pending','confirmed') and b.starts_at > now()) >= 3 then
    raise exception 'too_many_bookings';
  end if;
  select * into v_s from public.services where id = p_service and tenant_id = v_t.id and active;
  if not found then raise exception 'service_unavailable'; end if;

  select a.out_staff into v_staff from public.available_slots(p_slug, p_service, p_staff, p_date) a where a.out_time = p_time;
  if v_staff is null then raise exception 'slot_unavailable'; end if;
  select name into v_sn from public.staff where id = v_staff;

  v_start  := (p_date::timestamp + p_time) at time zone v_t.timezone;
  v_status := case when coalesce((v_t.settings #>> '{agenda,auto_confirm}')::boolean, true) then 'confirmed' else 'pending' end;
  begin
    insert into public.bookings (tenant_id, service_id, staff_id, service_name, staff_name, duration_min, price_minor,
                                 starts_at, ends_at, status, customer_name, customer_phone, note)
    values (v_t.id, v_s.id, v_staff, v_s.name, v_sn, v_s.duration_min, v_s.price_minor,
            v_start, v_start + make_interval(mins => v_s.duration_min), v_status, trim(p_customer_name), p_customer_phone,
            nullif(trim(coalesce(p_note,'')),''))
    returning id, public_token into v_id, v_tok;
  exception when exclusion_violation then
    raise exception 'slot_unavailable';
  end;
  return jsonb_build_object('booking_id', v_id, 'status', v_status, 'starts_at', v_start, 'staff_name', v_sn, 'public_token', v_tok);
end $$;

create or replace function public.get_booking(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object('status', b.status, 'service_name', b.service_name, 'staff_name', b.staff_name,
                            'starts_at', b.starts_at, 'duration_min', b.duration_min, 'price_minor', b.price_minor)
    from public.bookings b where b.public_token = p_token
$$;

create or replace function public.cancel_booking(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where public_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if v_b.status not in ('pending','confirmed') or v_b.starts_at <= now() then raise exception 'cannot_cancel'; end if;
  update public.bookings set status = 'cancelled' where id = v_b.id;
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- Onboarding: criar negócio já com o pacote do nicho aplicado
-- =====================================================================
create or replace function public.create_tenant(
  p_slug text, p_name text, p_niche text default 'general',
  p_currency text default 'EUR', p_currency_decimals int default 2,
  p_locale text default 'pt-PT', p_timezone text default 'Europe/Lisbon',
  p_country text default 'PT', p_whatsapp text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_p public.niche_presets; v_id uuid; v_lang text := split_part(p_locale, '-', 1); d int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from public.tenant_members m where m.user_id = v_uid and m.role = 'owner') >= 5 then raise exception 'tenant_limit'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'invalid_timezone'; end if;
  select * into v_p from public.niche_presets where niche = p_niche;
  if not found then raise exception 'invalid_niche'; end if;

  insert into public.tenants (slug, name, niche, currency, currency_decimals, locale, timezone, country, whatsapp, modules, settings)
  values (p_slug, trim(p_name), p_niche, upper(p_currency), p_currency_decimals, p_locale, p_timezone, upper(p_country),
          nullif(p_whatsapp,''), v_p.modules, public.default_settings() || v_p.settings)
  returning id into v_id;

  insert into public.tenant_members (tenant_id, user_id, role) values (v_id, v_uid, 'owner');

  for d in 0..6 loop
    insert into public.business_hours (tenant_id, weekday, is_open, opens, closes)
    values (v_id, d, (v_p.hours->'days') @> to_jsonb(d), (v_p.hours->>'opens')::time, (v_p.hours->>'closes')::time);
  end loop;

  insert into public.loyalty_programs (tenant_id, mode, goal, reward, points_per_unit, min_purchase_minor)
  values (v_id, v_p.loyalty->>'mode', (v_p.loyalty->>'goal')::int,
          coalesce(v_p.loyalty->'reward'->>v_lang, v_p.loyalty->'reward'->>'en', 'Reward'),
          coalesce((v_p.loyalty->>'points_per_unit')::numeric, 1), coalesce((v_p.loyalty->>'min_purchase_minor')::bigint, 0));

  if (v_p.modules->>'agenda')::boolean then
    insert into public.staff (tenant_id, name) values (v_id, trim(p_name));   -- agenda individual por defeito
  end if;
  return v_id;
end $$;

-- =====================================================================
-- Gatilhos: estado do pedido, stock, fidelidade automática
-- =====================================================================
create or replace function public.orders_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_auto boolean; v_on boolean;
begin
  new.updated_at := now();
  if old.status in ('completed','cancelled') and new.status is distinct from old.status then
    raise exception 'final_status';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.items i set stock = i.stock + s.q
      from (select item_id, sum(qty)::int as q from public.order_items where order_id = new.id and item_id is not null group by item_id) s
     where i.id = s.item_id and i.stock is not null;
  end if;
  if new.status = 'completed' and old.status <> 'completed' and not new.loyalty_done then
    select coalesce((t.modules->>'loyalty')::boolean, false) into v_on from public.tenants t where t.id = new.tenant_id;
    select p.auto_earn into v_auto from public.loyalty_programs p where p.tenant_id = new.tenant_id;
    if v_on and coalesce(v_auto, false) then
      perform public._loyalty_earn(new.tenant_id, new.customer_phone, new.customer_name, new.total_minor, 'order #' || new.number);
      new.loyalty_done := true;
    end if;
  end if;
  return new;
end $$;
create trigger orders_before_update before update on public.orders for each row execute function public.orders_before_update();

create or replace function public.bookings_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_auto boolean; v_on boolean;
begin
  if old.status in ('completed','cancelled','no_show') and new.status is distinct from old.status then
    raise exception 'final_status';
  end if;
  if new.status = 'completed' and old.status <> 'completed' and not new.loyalty_done then
    select coalesce((t.modules->>'loyalty')::boolean, false) into v_on from public.tenants t where t.id = new.tenant_id;
    select p.auto_earn into v_auto from public.loyalty_programs p where p.tenant_id = new.tenant_id;
    if v_on and coalesce(v_auto, false) then
      perform public._loyalty_earn(new.tenant_id, new.customer_phone, new.customer_name, new.price_minor, new.service_name);
      new.loyalty_done := true;
    end if;
  end if;
  return new;
end $$;
create trigger bookings_before_update before update on public.bookings for each row execute function public.bookings_before_update();

-- =====================================================================
-- Segurança: RLS em todas as tabelas
-- =====================================================================
alter table public.niche_presets     enable row level security;
alter table public.tenants           enable row level security;
alter table public.tenant_members    enable row level security;
alter table public.categories        enable row level security;
alter table public.items             enable row level security;
alter table public.services          enable row level security;
alter table public.staff             enable row level security;
alter table public.business_hours    enable row level security;
alter table public.blocked_dates     enable row level security;
alter table public.bookings          enable row level security;
alter table public.tenant_counters   enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.loyalty_programs  enable row level security;
alter table public.loyalty_customers enable row level security;
alter table public.loyalty_events    enable row level security;

-- presets: leitura pública
create policy presets_read on public.niche_presets for select to anon, authenticated using (true);

-- tenants
create policy tenants_public_read  on public.tenants for select to anon, authenticated using (is_published);
create policy tenants_member_read  on public.tenants for select to authenticated using (public.is_member(id));
create policy tenants_admin_update on public.tenants for update to authenticated
  using (public.has_role(id, array['owner','admin']::public.tenant_role[]))
  with check (public.has_role(id, array['owner','admin']::public.tenant_role[]));
create policy tenants_owner_delete on public.tenants for delete to authenticated
  using (public.has_role(id, array['owner']::public.tenant_role[]));

-- membros
create policy members_read   on public.tenant_members for select to authenticated using (public.is_member(tenant_id));
create policy members_manage on public.tenant_members for all to authenticated
  using (public.has_role(tenant_id, array['owner']::public.tenant_role[]) and user_id <> auth.uid())
  with check (public.has_role(tenant_id, array['owner']::public.tenant_role[]));

-- catálogo público + gestão por owner/admin
do $$
declare t text;
begin
  foreach t in array array['categories','items','services','staff','business_hours','blocked_dates'] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (public.tenant_is_published(tenant_id))', t || '_public_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(tenant_id))', t || '_member_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_role(tenant_id, array[''owner'',''admin'']::public.tenant_role[])) with check (public.has_role(tenant_id, array[''owner'',''admin'']::public.tenant_role[]))', t || '_admin_write', t);
  end loop;
end $$;

-- operação diária: qualquer membro (inclui staff)
create policy orders_member_read   on public.orders for select to authenticated using (public.is_member(tenant_id));
create policy orders_member_update on public.orders for update to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy orders_admin_delete  on public.orders for delete to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy order_items_member_read on public.order_items for select to authenticated using (public.is_member(tenant_id));

create policy bookings_member_read   on public.bookings for select to authenticated using (public.is_member(tenant_id));
create policy bookings_member_update on public.bookings for update to authenticated using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy bookings_admin_delete  on public.bookings for delete to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));

-- fidelidade: leitura por membros; escritas via funções
create policy loy_programs_read  on public.loyalty_programs  for select to authenticated using (public.is_member(tenant_id));
create policy loy_programs_admin on public.loyalty_programs  for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[])) with check (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy loy_programs_public on public.loyalty_programs for select to anon using (public.tenant_is_published(tenant_id));
create policy loy_customers_read   on public.loyalty_customers for select to authenticated using (public.is_member(tenant_id));
create policy loy_customers_delete on public.loyalty_customers for delete to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy loy_events_read      on public.loyalty_events    for select to authenticated using (public.is_member(tenant_id));
-- tenant_counters: sem políticas (só as funções security definer mexem)

-- =====================================================================
-- Permissões explícitas (o Supabase concede tudo por defeito; aqui fechamos)
-- =====================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.niche_presets, public.tenants, public.categories, public.items, public.services, public.staff,
                public.business_hours, public.blocked_dates, public.loyalty_programs to anon;

grant select on all tables in schema public to authenticated;
revoke select on public.tenant_counters from authenticated;
grant update (name, niche, currency, currency_decimals, locale, timezone, country, whatsapp, address, accent, modules, settings, is_published, slug) on public.tenants to authenticated;
grant delete on public.tenants to authenticated;
grant insert, update, delete on public.tenant_members, public.categories, public.items, public.services, public.staff,
                                public.business_hours, public.blocked_dates, public.loyalty_programs to authenticated;
grant update (status, note) on public.orders to authenticated;
grant update (status, note) on public.bookings to authenticated;
grant delete on public.orders, public.bookings, public.loyalty_customers to authenticated;

-- funções expostas como RPC
grant execute on function public.is_member(uuid), public.has_role(uuid, public.tenant_role[]), public.tenant_is_published(uuid) to anon, authenticated;
grant execute on function public.place_order(text,text,jsonb,text,text,text,text,text,text,bigint,text) to anon, authenticated;
grant execute on function public.get_order_status(uuid), public.available_slots(text,uuid,uuid,date),
                          public.create_booking(text,uuid,uuid,date,time,text,text,text), public.get_booking(uuid), public.cancel_booking(uuid),
                          public.loyalty_card(text,text), public.loyalty_join(text,text,text) to anon, authenticated;
grant execute on function public.create_tenant(text,text,text,text,int,text,text,text,text),
                          public.loyalty_earn(uuid,text,text,bigint,text), public.loyalty_redeem(uuid), public.loyalty_adjust(uuid,int,text) to authenticated;
grant execute on function public.default_settings() to anon, authenticated;
