-- Um funcionário comum só vê e só edita as suas próprias marcações — nunca os dados de clientes de outra pessoa.
-- Escrita para funcionar seja qual for o estado da base de dados: numa instalação nova (que ainda tem os nomes
-- antigos) e na base de dados real (onde a parte de leitura já tinha sido corrigida antes, com nomes em português).

-- leitura: garante o resultado certo, esteja lá o nome antigo, os nomes em português, ou nenhum dos dois
drop policy if exists bookings_member_read on public.bookings;
drop policy if exists "Administradores veem todas as marcações" on public.bookings;
drop policy if exists "Membros veem apenas as próprias marcações" on public.bookings;
drop policy if exists bookings_admin_read on public.bookings;
drop policy if exists bookings_staff_read on public.bookings;
create policy bookings_admin_read on public.bookings for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy bookings_staff_read on public.bookings for select to authenticated
  using (staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid()));

-- escrita: esta parte não tinha sido corrigida ainda — qualquer membro conseguia alterar qualquer marcação
drop policy if exists bookings_member_update on public.bookings;
drop policy if exists bookings_admin_update on public.bookings;
drop policy if exists bookings_staff_update on public.bookings;
create policy bookings_admin_update on public.bookings for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.tenant_role[]));
create policy bookings_staff_update on public.bookings for update to authenticated
  using (staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid()))
  with check (staff_id in (select id from public.staff where tenant_id = bookings.tenant_id and user_id = auth.uid()));
