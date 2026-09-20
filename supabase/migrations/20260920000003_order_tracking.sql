-- Acompanhamento do pedido: devolve também o módulo (menu/catalog), para o cliente ver os passos certos,
-- e o pagamento/valores. Continua a exigir o token secreto do pedido; não expõe telefone nem morada.
create or replace function public.get_order_status(p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'module', o.module, 'status', o.status, 'fulfillment', o.fulfillment,
    'payment_method', o.payment_method, 'subtotal_minor', o.subtotal_minor, 'fee_minor', o.fee_minor,
    'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at, 'updated_at', o.updated_at,
    'tenant_slug', (select t.slug from public.tenants t where t.id = o.tenant_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unit_minor', i.unit_minor) order by i.name), '[]'::jsonb)
                from public.order_items i where i.order_id = o.id))
  from public.orders o where o.public_token = p_token
$$;
