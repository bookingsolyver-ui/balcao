-- Opção "só aceitar pedidos com a loja aberta" (settings.<módulo>.only_when_open = true).
-- tenant_is_open() usa o horário de funcionamento no fuso do negócio.

create or replace function public.tenant_is_open(p_tenant uuid, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select bh.is_open
       and (p_at at time zone t.timezone)::time >= bh.opens
       and (p_at at time zone t.timezone)::time <  bh.closes
      from public.tenants t
      join public.business_hours bh on bh.tenant_id = t.id and bh.weekday = extract(dow from (p_at at time zone t.timezone))::int
     where t.id = p_tenant
  ), false)
$$;
revoke all on function public.tenant_is_open(uuid, timestamptz) from public;
grant execute on function public.tenant_is_open(uuid, timestamptz) to anon, authenticated;

-- place_order: igual à versão anterior + verificação da loja aberta (os privilégios existentes mantêm-se)
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
  if coalesce((v_cfg->>'only_when_open')::boolean, false) and not public.tenant_is_open(v_t.id) then raise exception 'store_closed'; end if;

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

-- Acompanhamento de marcações: passa a devolver a loja a que pertence (para não mostrar marcações noutra loja).
create or replace function public.get_booking(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object('status', b.status, 'service_name', b.service_name, 'staff_name', b.staff_name,
                            'starts_at', b.starts_at, 'duration_min', b.duration_min, 'price_minor', b.price_minor,
                            'tenant_slug', (select t.slug from public.tenants t where t.id = b.tenant_id))
    from public.bookings b where b.public_token = p_token
$$;
