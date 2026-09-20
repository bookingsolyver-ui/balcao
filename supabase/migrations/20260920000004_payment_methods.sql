-- Novos métodos de pagamento:
--   express = Multicaixa Express (Angola)
--   store   = pagar na loja (ao levantar ou no local)
-- "Pagar na loja" não faz sentido numa entrega ao domicílio: a base de dados impede essa combinação.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash','card','online','pix','mbway','transfer','express','store','other'));
alter table public.orders add constraint orders_store_payment_needs_presence
  check (payment_method <> 'store' or fulfillment in ('pickup','dine_in'));
