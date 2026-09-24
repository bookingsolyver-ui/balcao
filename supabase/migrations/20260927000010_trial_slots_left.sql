-- Função pública e segura: devolve só um número (quantas vagas de avaliação ainda restam, 0 a 10).
-- Não expõe nenhum dado de negócios — serve para a página de vendas mostrar a mensagem certa sozinha.
create or replace function public.trial_slots_left()
returns int language sql security definer stable set search_path = public as $$
  select greatest(0, 10 - (select count(*)::int from public.tenant_billing))
$$;
revoke all on function public.trial_slots_left() from public;
grant execute on function public.trial_slots_left() to anon, authenticated;
