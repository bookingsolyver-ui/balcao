// Agenda: datas no fuso do negócio, validações e o fluxo completo contra o Postgres real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addDays, addMonths, bookingActions, buildAgendaSettings, buildBookingParams, buildService, calendarLink, dayList, dayRangeUtc, hhmm, isLiveBooking, mergeAgenda, monthGrid, monthOf, agendaConfig, timeInTz, todayInTz, toServiceForm, weekdayOf, zonedToUtc, ymdInTz, type BookingForm, type BookingRow, type SlotRow, type TrackBooking } from '../src/lib/booking';
import { dbErrorKey } from '../src/lib/errors';
import { makeDb, asUser } from './helpers/pg';

// ---- fusos horários ----
assert.equal(zonedToUtc('2026-09-21', '00:00', 'Europe/Lisbon').toISOString(), '2026-09-20T23:00:00.000Z', 'Lisboa no verão = UTC+1');
assert.equal(zonedToUtc('2026-12-15', '00:00', 'Europe/Lisbon').toISOString(), '2026-12-15T00:00:00.000Z', 'Lisboa no inverno = UTC+0');
assert.equal(zonedToUtc('2026-09-21', '09:30', 'Africa/Luanda').toISOString(), '2026-09-21T08:30:00.000Z', 'Luanda = UTC+1 o ano todo');
assert.equal(zonedToUtc('2026-09-21', '09:00', 'Asia/Tokyo').toISOString(), '2026-09-21T00:00:00.000Z');
assert.equal(zonedToUtc('2026-07-01', '12:00', 'America/New_York').toISOString(), '2026-07-01T16:00:00.000Z', 'Nova Iorque no verão = UTC-4');
const dst = dayRangeUtc('2026-03-08', 'America/New_York'); // dia em que se avança a hora nos EUA
assert.equal((new Date(dst.to).getTime() - new Date(dst.from).getTime()) / 3600000, 23, 'dia de mudança de hora tem 23 h');
const fall = dayRangeUtc('2026-10-25', 'Europe/Lisbon'); assert.equal((new Date(fall.to).getTime() - new Date(fall.from).getTime()) / 3600000, 25, 'e outro tem 25 h');
assert.equal(timeInTz('2026-09-20T23:30:00Z', 'Europe/Lisbon'), '00:30'); assert.equal(timeInTz('2026-09-21T08:30:00Z', 'Africa/Luanda'), '09:30');
assert.equal(ymdInTz(new Date('2026-09-20T23:30:00Z'), 'Europe/Lisbon'), '2026-09-21', 'ainda é dia 20 em UTC, já é 21 em Lisboa');
assert.equal(todayInTz('Asia/Tokyo', new Date('2026-09-20T20:00:00Z')), '2026-09-21');
assert.equal(addDays('2026-09-30', 1), '2026-10-01'); assert.equal(addDays('2026-03-01', -1), '2026-02-28'); assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(weekdayOf('2026-09-21'), 1, 'segunda-feira'); assert.equal(weekdayOf('2026-09-27'), 0);
assert.equal(hhmm('09:30:00'), '09:30');
console.log('✔ datas no fuso do negócio (verão/inverno, mudança de hora, meia-noite)');

// ---- calendário mensal (saltar direto para qualquer mês, sem clicar dia a dia) ----
assert.equal(monthOf('2026-09-21'), '2026-09');
assert.equal(addMonths('2026-09', 1), '2026-10'); assert.equal(addMonths('2026-12', 1), '2027-01', 'passa o ano'); assert.equal(addMonths('2026-01', -1), '2025-12', 'e para trás também');
assert.equal(addMonths('2026-09', 3), '2026-12', 'setembro + 3 = dezembro, de uma vez');
const g = monthGrid('2026-09');
assert.equal(g.length, 42, '6 semanas completas');
assert.equal(g[0].date, '2026-08-30', 'começa no domingo antes do dia 1'); assert.equal(weekdayOf(g[0].date), 0);
assert.equal(g.find((c) => c.date === '2026-09-01')!.inMonth, true);
assert.equal(g[0].inMonth, false, 'o fim de agosto aparece, mas marcado como fora do mês');
assert.equal(g[41].date, '2026-10-10'); assert.equal(g[41].inMonth, false, 'a última célula já é de outubro, também fora do mês');
assert.equal(g.filter((c) => c.inMonth).length, 30, 'setembro tem 30 dias, todos presentes');
const gFeb = monthGrid('2028-02'); assert.equal(gFeb.filter((c) => c.inMonth).length, 29, '2028 é bissexto');
console.log('✔ calendário mensal: 6 semanas certas, meses vizinhos, meses com número de dias diferente');

// ---- dias escolhíveis ----
const hours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, is_open: w !== 0, opens: '09:00:00', closes: '18:00:00' }));
const days = dayList('2026-09-21', 7, hours, ['2026-09-23']);
assert.equal(days.length, 8, 'hoje + 7 dias de antecedência'); assert.equal(days[0].date, '2026-09-21');
assert.equal(days.find((d) => d.date === '2026-09-27')!.disabled, true, 'domingo fechado'); assert.equal(days.find((d) => d.date === '2026-09-23')!.disabled, true, 'dia bloqueado');
assert.equal(days.filter((d) => !d.disabled).length, 6);
assert.equal(isLiveBooking('pending'), true); assert.equal(isLiveBooking('completed'), false);
assert.deepEqual(bookingActions('pending'), ['confirmed', 'cancelled']); assert.deepEqual(bookingActions('confirmed'), ['completed', 'no_show', 'cancelled']); assert.deepEqual(bookingActions('cancelled'), []);

// ---- formulários ----
const f: BookingForm = { serviceId: 's1', staffId: 'any', date: '2026-09-21', time: '10:00', name: ' Ana Silva ', phone: '923 306 869', note: '' };
let b = buildBookingParams(f, { slug: 'salao', country: 'AO' });
assert.ok(b.ok && b.params.p_staff === null && b.params.p_customer_phone === '244923306869' && b.params.p_customer_name === 'Ana Silva' && b.params.p_note === null);
b = buildBookingParams({ ...f, staffId: 'st1' }, { slug: 'salao', country: 'AO' }); assert.ok(b.ok && b.params.p_staff === 'st1');
for (const [patch, err] of [[{ serviceId: '' }, 'service'], [{ date: '21/09' }, 'date'], [{ time: '' }, 'time'], [{ name: 'A' }, 'name'], [{ phone: '12' }, 'phone']] as const) assert.deepEqual(buildBookingParams({ ...f, ...patch }, { slug: 's', country: 'AO' }), { ok: false, error: err });
const cur = { currency: 'AOA', decimals: 2 };
let sv = buildService({ name: 'Corte', description: '', duration: '45', price: '5000', active: true }, cur); assert.ok(sv.ok && sv.value.price_minor === 500000 && sv.value.duration_min === 45);
sv = buildService({ name: 'Grátis', description: '', duration: '30', price: '', active: true }, cur); assert.ok(sv.ok && sv.value.price_minor === 0);
assert.deepEqual(buildService({ name: '', description: '', duration: '30', price: '1', active: true }, cur), { ok: false, error: 'name' });
assert.deepEqual(buildService({ name: 'x', description: '', duration: '3', price: '1', active: true }, cur), { ok: false, error: 'duration' });
assert.deepEqual(buildService({ name: 'x', description: '', duration: '721', price: '1', active: true }, cur), { ok: false, error: 'duration' });
assert.deepEqual(buildService({ name: 'x', description: '', duration: '30', price: 'abc', active: true }, cur), { ok: false, error: 'price' });
assert.equal(toServiceForm({ id: '1', name: 'Corte', description: '', duration_min: 45, price_minor: 500000, active: true }, 2).price, '5000.00');
const ag = buildAgendaSettings({ slot_step_min: '15', days_ahead: '30', min_notice_hours: '0', auto_confirm: false }); assert.ok(ag.ok && ag.value.slot_step_min === 15 && ag.value.auto_confirm === false);
assert.deepEqual(buildAgendaSettings({ slot_step_min: '2', days_ahead: '30', min_notice_hours: '0', auto_confirm: true }), { ok: false, error: 'step' });
assert.deepEqual(buildAgendaSettings({ slot_step_min: '30', days_ahead: '0', min_notice_hours: '0', auto_confirm: true }), { ok: false, error: 'ahead' });
assert.deepEqual(buildAgendaSettings({ slot_step_min: '30', days_ahead: '30', min_notice_hours: '-1', auto_confirm: true }), { ok: false, error: 'notice' });
assert.deepEqual(agendaConfig({}), { slot_step_min: 30, days_ahead: 21, min_notice_hours: 2, auto_confirm: true });
assert.equal((mergeAgenda({ menu: { a: 1 }, agenda: { extra: 1 } }, { slot_step_min: 15, days_ahead: 5, min_notice_hours: 1, auto_confirm: true }).menu as { a: number }).a, 1, 'não apaga outras chaves');
const cal = calendarLink({ title: 'Corte — Salão', startsAt: '2026-09-21T08:30:00Z', durationMin: 45, details: 'Com Marta' });
assert.match(cal, /dates=20260921T083000Z%2F20260921T091500Z/); assert.match(cal, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
console.log('✔ validação de marcações, serviços e regras da agenda');

// ---- contra o Postgres real ----
const db = await makeDb();
const owner = randomUUID(), staffUser = randomUUID();
await db.query('insert into auth.users(id) values ($1),($2)', [owner, staffUser]);
const mk = async (slug: string, tz: string, country: string) => (await asUser(db, owner, () => db.query<{ id: string }>(`select create_tenant($1,$2,'salon','AOA',2,'pt-PT',$3,$4,'244923306869') id`, [slug, 'Salão ' + slug, tz, country]))).rows[0].id;
const tid = await mk('salao-ao', 'Africa/Luanda', 'AO');
await db.query(`insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'staff')`, [tid, staffUser]);
const svcId = (await db.query<{ id: string }>(`insert into services(tenant_id,name,duration_min,price_minor) values ($1,'Corte',60,500000) returning id`, [tid])).rows[0].id;
await db.query(`update staff set name='Marta' where tenant_id=$1`, [tid]);
const nuno = (await db.query<{ id: string }>(`insert into staff(tenant_id,name) values ($1,'Nuno') returning id`, [tid])).rows[0].id;
const marta = (await db.query<{ id: string }>(`select id from staff where tenant_id=$1 and name='Marta'`, [tid])).rows[0].id;
await db.query('update staff set user_id=$2 where id=$1', [marta, staffUser]); // este login "é" a Marta, para a agenda pessoal
await db.query(`update business_hours set is_open=true, opens='09:00', closes='18:00' where tenant_id=$1`, [tid]);

const today = todayInTz('Africa/Luanda');
const dayOpen = dayList(today, 14, (await db.query<{ weekday: number; is_open: boolean; opens: string; closes: string }>('select weekday,is_open,opens::text,closes::text from business_hours where tenant_id=$1', [tid])).rows, []).filter((d) => !d.disabled)[3].date;
const slots = async (date: string, staff: string | null = null) => (await asUser(db, 'anon', () => db.query<SlotRow>('select out_time::text out_time, out_staff from available_slots($1,$2,$3,$4::date)', ['salao-ao', svcId, staff, date]))).rows;
const s1 = await slots(dayOpen); assert.ok(s1.length >= 8, `horários livres em ${dayOpen}: ${s1.length}`); assert.equal(hhmm(s1[0].out_time), '09:00');
const book = async (form: Partial<BookingForm>, slug = 'salao-ao', country = 'AO') => {
  const r = buildBookingParams({ serviceId: svcId, staffId: 'any', date: dayOpen, time: '09:00', name: 'Ana Silva', phone: '923306869', note: '', ...form }, { slug, country });
  if (!r.ok) throw new Error(r.error);
  const p = r.params;
  return (await asUser(db, 'anon', () => db.query<{ r: { booking_id: string; status: string; starts_at: string; staff_name: string; public_token: string } }>('select create_booking($1,$2,$3,$4::date,$5::time,$6,$7,$8) r', [p.p_slug, p.p_service, p.p_staff, p.p_date, p.p_time, p.p_customer_name, p.p_customer_phone, p.p_note]))).rows[0].r;
};
const fails = (fn: () => Promise<unknown>) => fn().then(() => null, (e) => dbErrorKey(e as never));

const b1 = await book({ time: hhmm(s1[0].out_time) });
assert.equal(b1.status, 'confirmed'); assert.equal(new Date(b1.starts_at).toISOString(), zonedToUtc(dayOpen, '09:00', 'Africa/Luanda').toISOString(), 'gravado no instante certo (Luanda)');
const b2 = await book({ time: '09:00', phone: '923306870', name: 'Rui Costa' }); assert.notEqual(b2.staff_name, b1.staff_name, '"qualquer profissional" distribui');
assert.equal(await fails(() => book({ time: '09:00', phone: '923306871', name: 'Zé Três' })), 'slot_unavailable', 'sem profissional livre');
assert.equal((await slots(dayOpen)).some((x) => hhmm(x.out_time) === '09:00'), false, 'hora ocupada desaparece');
console.log('✔ marcação no instante certo, distribuição por profissionais e conflitos');

const tr = (await asUser(db, 'anon', () => db.query<{ t: TrackBooking }>('select get_booking($1) t', [b1.public_token]))).rows[0].t;
assert.equal(tr.tenant_slug, 'salao-ao'); assert.equal(tr.status, 'confirmed'); assert.equal(tr.service_name, 'Corte'); assert.equal(tr.price_minor, 500000);
assert.equal((await asUser(db, 'anon', () => db.query<{ r: { ok: boolean } }>('select cancel_booking($1) r', [b1.public_token]))).rows[0].r.ok, true);
assert.equal((await slots(dayOpen)).some((x) => hhmm(x.out_time) === '09:00'), true, 'cancelar liberta a hora');
assert.equal(await fails(() => asUser(db, 'anon', () => db.query('select cancel_booking($1)', [b1.public_token]))), 'cannot_cancel', 'não cancela duas vezes');
console.log('✔ acompanhamento por token (com a loja) e cancelamento');

// painel: estados por quem trabalha no negócio; concluir pontua fidelidade
const b3 = await book({ time: '11:00', phone: '923306872', name: 'Carla Dias', staffId: marta });
const setStatus = (who: string, id: string, st: string) => asUser(db, who, () => db.query('update bookings set status=$2 where id=$1', [id, st]));
await setStatus(staffUser, b3.booking_id, 'completed'); // a Marta conclui a sua própria marcação
assert.equal((await db.query<{ balance: number }>(`select balance from loyalty_customers where tenant_id=$1 and phone='244923306872'`, [tid])).rows[0].balance, 1, 'concluir marcação carimba a fidelidade');
assert.equal(await fails(() => setStatus(owner, b3.booking_id, 'confirmed')), 'final_status', 'estado final não reabre');
console.log('✔ estados no painel e fidelidade automática');

// privacidade: um funcionário só vê e só edita as SUAS marcações — nunca as de outro colega
const bNuno = await book({ time: '14:00', phone: '923306873', name: 'Zé Nuno Cliente', staffId: nuno });
const staffSees = async (who: string) => (await asUser(db, who, () => db.query<{ id: string }>('select id from bookings where tenant_id=$1', [tid]))).rows.map((r) => r.id);
const martaSees = await staffSees(staffUser);
assert.ok(martaSees.includes(b3.booking_id), 'a Marta vê a sua própria marcação');
assert.ok(!martaSees.includes(bNuno.booking_id), 'mas não vê a marcação do Nuno');
assert.equal((await staffSees(owner)).length, (await asUser(db, owner, () => db.query('select id from bookings where tenant_id=$1', [tid]))).rows.length, 'o dono continua a ver tudo');
assert.ok((await staffSees(owner)).includes(bNuno.booking_id), 'o dono vê a marcação do Nuno também');
assert.equal(await fails(() => setStatus(staffUser, bNuno.booking_id, 'completed')), null, 'a Marta nem sequer encontra a marcação do Nuno para a alterar');
const nunoRowAfter = (await asUser(db, owner, () => db.query<{ status: string }>('select status from bookings where id=$1', [bNuno.booking_id]))).rows[0];
assert.equal(nunoRowAfter.status, 'confirmed', 'e a marcação do Nuno continua intacta, por muito que a Marta tente');
console.log('✔ privacidade: cada funcionário só vê e só mexe nas suas próprias marcações');

// selecionar "o dia" no fuso do negócio: marcação às 23:30 e às 00:00 (Lisboa) ficam em dias diferentes
const lis = await mk('salao-pt', 'Europe/Lisbon', 'PT');
const sv2 = (await db.query<{ id: string }>(`insert into services(tenant_id,name,duration_min,price_minor) values ($1,'Noite',15,1000) returning id`, [lis])).rows[0].id;
await db.query(`update business_hours set is_open=true, opens='00:00', closes='23:59' where tenant_id=$1`, [lis]);
await db.query(`update tenants set settings = jsonb_set(jsonb_set(settings,'{agenda,min_notice_hours}','0'),'{agenda,days_ahead}','10') where id=$1`, [lis]);
const dayD = addDays(todayInTz('Europe/Lisbon'), 3), dayE = addDays(dayD, 1);
const mkb = async (date: string, time: string, phone: string) => { const r = buildBookingParams({ serviceId: sv2, staffId: 'any', date, time, name: 'Cliente', phone, note: '' }, { slug: 'salao-pt', country: 'PT' }); if (!r.ok) throw new Error(r.error); const p = r.params;
  await asUser(db, 'anon', () => db.query('select create_booking($1,$2,$3,$4::date,$5::time,$6,$7,$8)', [p.p_slug, p.p_service, p.p_staff, p.p_date, p.p_time, p.p_customer_name, p.p_customer_phone, p.p_note])); };
await mkb(dayD, '23:30', '912000001'); await mkb(dayE, '00:00', '912000002'); await mkb(dayE, '10:00', '912000003');
const dayRows = async (d: string) => { const r = dayRangeUtc(d, 'Europe/Lisbon'); return (await asUser(db, owner, () => db.query<BookingRow>('select * from bookings where tenant_id=$1 and starts_at >= $2 and starts_at < $3 order by starts_at', [lis, r.from, r.to]))).rows; };
const dRows = await dayRows(dayD), eRows = await dayRows(dayE);
assert.equal(dRows.length, 1, 'às 23:30 de D só há uma marcação'); assert.equal(timeInTz(dRows[0].starts_at as unknown as string, 'Europe/Lisbon'), '23:30');
assert.equal(eRows.length, 2, 'a de 00:00 e a de 10:00 pertencem a D+1'); assert.equal(timeInTz(eRows[0].starts_at as unknown as string, 'Europe/Lisbon'), '00:00');
console.log('✔ o dia é o do fuso do negócio (23:30 e 00:00 em dias diferentes)');

// regras da agenda: a equipa vê, mas só admin altera serviços/equipa
const wr = (who: string) => asUser(db, who, () => db.query(`insert into services(tenant_id,name,duration_min) values ($1,'X',30)`, [tid])).then(() => null, (e: Error) => e);
assert.ok(await wr(staffUser), 'staff não cria serviços'); assert.equal(await wr(owner), null);
console.log('✔ permissões da agenda (a privacidade das marcações já foi confirmada em detalhe acima)');
process.exit(0);
