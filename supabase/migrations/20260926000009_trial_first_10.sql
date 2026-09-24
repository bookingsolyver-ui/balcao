-- Regra de negócio: só os primeiros 10 negócios (por ordem de criação) ganham os 3 dias de avaliação —
-- servem para recolher feedback. A partir do 11º, nasce com "unpaid": tem de subscrever antes de poder usar o Balcão.

alter table public.tenant_billing drop constraint tenant_billing_status_check;
alter table public.tenant_billing add constraint tenant_billing_status_check
  check (status in ('trialing','active','past_due','paused','canceled','unpaid'));

create or replace function public.tenant_billing_init() returns trigger language plpgsql as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.tenant_billing;
  if v_count < 10 then
    insert into public.tenant_billing (tenant_id, status, trial_ends_at) values (new.id, 'trialing', now() + interval '3 days');
  else
    insert into public.tenant_billing (tenant_id, status, trial_ends_at) values (new.id, 'unpaid', null);
  end if;
  return new;
end $$;
