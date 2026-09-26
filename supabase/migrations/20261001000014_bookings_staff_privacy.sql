-- Um funcionário comum só vê (e só edita) as suas próprias marcações — nunca os dados de clientes de outra pessoa.
-- O dono e os administradores continuam a ver tudo. Feito na segurança da base de dados, não só escondido no ecrã.

drop policy bookings_member_read on public.bookings;
create policy bookings_member_read on public.bookings for select to authenticated using (
  public.has_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid())
);

drop policy bookings_member_update on public.bookings;
create policy bookings_member_update on public.bookings for update to authenticated using (
  public.has_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid())
) with check (
  public.has_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid())
);
