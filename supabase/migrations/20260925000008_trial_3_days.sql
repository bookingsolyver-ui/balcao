-- A avaliação passa de 14 para 3 dias. Só afeta negócios criados a partir de agora —
-- não muda a data de nenhum negócio que já esteja em avaliação.
create or replace function public.tenant_billing_init() returns trigger language plpgsql as $$
begin
  insert into public.tenant_billing (tenant_id, status, trial_ends_at) values (new.id, 'trialing', now() + interval '3 days');
  return new;
end $$;
