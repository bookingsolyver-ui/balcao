// Desenha a agenda: painel do negócio, marcação do cliente e acompanhamento.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { AgendaManager, type AgendaTenant } from '../src/components/AgendaManager';
import { BookingFlow, type BookingFlowProps } from '../src/components/store/BookingFlow';
import { BookingTracker } from '../src/components/store/BookingTracker';
import type { BookingRow, ServiceRow, StaffRow, TrackBooking } from '../src/lib/booking';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_teste';
const messages = (l: string) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const wrap = (l: string, node: React.ReactNode) => renderToString(<NextIntlClientProvider locale={l} messages={messages(l)} timeZone="UTC">{node}</NextIntlClientProvider>).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const tenant: AgendaTenant = { id: 't1', slug: 'salao', name: 'Salão Bela', timezone: 'Africa/Luanda', country: 'AO', currency: 'AOA', decimals: 2, moneyLocale: 'pt-AO', whatsapp: '244923306869', daysAhead: 14, autoConfirm: true };
const services: ServiceRow[] = [
  { id: 's1', name: 'Corte', description: 'Corte e lavagem', duration_min: 45, price_minor: 500000, active: true },
  { id: 's2', name: 'Consulta grátis', description: '', duration_min: 15, price_minor: 0, active: true },
  { id: 's3', name: 'Antigo', description: '', duration_min: 30, price_minor: 100000, active: false },
];
const staff: StaffRow[] = [{ id: 'p1', name: 'Marta', active: true }, { id: 'p2', name: 'Nuno', active: true }];
const hours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, is_open: w !== 0, opens: '09:00:00', closes: '18:00:00' }));
const bk = (id: string, time: string, status: BookingRow['status'], over: Partial<BookingRow> = {}): BookingRow => ({
  id, service_name: 'Corte', staff_name: 'Marta', duration_min: 45, price_minor: 500000, starts_at: `2026-09-21T${time}:00Z`, ends_at: `2026-09-21T${time.slice(0, 2)}:45:00Z`, status,
  customer_name: 'Ana Silva', customer_phone: '244923306869', note: null, staff_id: 'p1', public_token: 't', ...over });
// 08:00Z = 09:00 em Luanda (UTC+1)
const bookings = [bk('a', '08:00', 'pending'), bk('b', '09:00', 'confirmed', { customer_name: 'Rui Costa', customer_phone: '244923111222', staff_id: 'p2', staff_name: 'Nuno', note: 'alergia' }), bk('c', '10:00', 'completed'), bk('d', '11:00', 'cancelled')];
const props = { tenant, services, staff, hours, blocked: ['2026-09-25'], initialDate: '2026-09-21', initialBookings: bookings, canAdmin: true };

// ---- agenda do dia ----
let h = wrap('pt-PT', <AgendaManager {...props} />); let tx = text(h);
assert.match(tx, /Segunda-feira, 21 de setembro/); assert.match(tx, /09:00\s*até 09:45/, 'hora no fuso do negócio (Luanda), não em UTC');
assert.match(tx, /Pendente/); assert.match(tx, /Confirmada/); assert.match(tx, /Concluída/); assert.match(tx, /Cancelada/);
assert.match(tx, /Ana Silva · \+244 923 306 869/); assert.match(tx, /Nuno · 5\s000,00\s?Kz · alergia/);
assert.equal((h.match(/>Confirmar</g) ?? []).length, 1, 'só a pendente tem "Confirmar"'); assert.equal((h.match(/>Concluir</g) ?? []).length, 1, 'só a confirmada tem "Concluir"'); assert.equal((h.match(/>Faltou</g) ?? []).length, 1);
assert.equal((h.match(/>Cancelar</g) ?? []).length, 2, 'pendente e confirmada podem cancelar'); assert.equal((h.match(/>WhatsApp</g) ?? []).length, 2, 'lembrete só para marcações vivas');
assert.match(tx, /3 marcações · 15\s000,00\s?Kz previstos/, 'a cancelada não conta para o previsto');
assert.match(tx, /Toda a equipa/); assert.match(tx, /Marta/); assert.match(tx, /Nova marcação/);
const links = [...h.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1].replace(/&amp;/g, '&')));
assert.ok(links[0].startsWith('https://wa.me/244923306869?text=Olá, Ana! Lembrete da sua marcação: Corte com Marta, segunda-feira, 21 de setembro de 2026 às 09:00'), links[0]);
console.log('✔ agenda do dia: horas no fuso do negócio, ações por estado, previsto e lembretes de WhatsApp');

h = wrap('pt-PT', <AgendaManager {...props} initialDate="2026-09-27" initialBookings={[]} />); assert.match(text(h), /O negócio está fechado neste dia/);
h = wrap('pt-PT', <AgendaManager {...props} initialDate="2026-09-25" initialBookings={[]} />); assert.match(text(h), /O negócio está fechado neste dia/, 'dia bloqueado');
h = wrap('pt-PT', <AgendaManager {...props} initialDate="2026-09-22" initialBookings={[]} />); assert.match(text(h), /Nenhuma marcação neste dia/);
h = wrap('pt-PT', <AgendaManager {...props} canAdmin={false} />); assert.match(text(h), /Só o proprietário e os administradores/);
console.log('✔ dias fechados, bloqueados e vazios; equipa em modo leitura');

// ---- serviços e equipa ----
h = wrap('pt-PT', <AgendaManager {...props} initialTab="services" />); tx = text(h);
assert.match(tx, /Novo serviço/); assert.match(tx, /Corte/); assert.match(tx, /45 min · Corte e lavagem/); assert.match(tx, /5\s000,00\s?Kz/); assert.match(tx, /Grátis/); assert.match(tx, /Antigo/);
assert.equal((h.match(/checked=""/g) ?? []).length, 2, '2 serviços ativos, 1 inativo');
h = wrap('pt-PT', <AgendaManager {...props} initialTab="services" canAdmin={false} />); assert.doesNotMatch(text(h), /Novo serviço|Eliminar/);
h = wrap('pt-PT', <AgendaManager {...props} initialTab="team" />); tx = text(h);
assert.match(tx, /Adicionar pessoa/); assert.match(tx, /Marta/); assert.match(tx, /Nuno/); assert.match(tx, /Dias bloqueados/); assert.match(tx, /Sexta-feira, 25 de setembro/); assert.match(tx, /Desbloquear/); assert.match(tx, /Bloquear dia/);
h = wrap('en', <AgendaManager {...props} initialTab="team" initialBookings={[]} />); assert.match(text(h), /Team & days off|Add person/); 
console.log('✔ serviços (ativos/inativos, permissões) e equipa com dias bloqueados');

// ---- marcação do cliente ----
const flow = (over: Partial<BookingFlowProps> = {}) => ({ mode: 'public' as const, slug: 'salao', tenant, services, staff, hours, blocked: [], daysAhead: 14, autoConfirm: true, ...over });
h = wrap('pt-PT', <BookingFlow {...flow()} />); tx = text(h);
assert.match(tx, /Escolha o serviço/); assert.match(tx, /Corte\s*45 min · Corte e lavagem\s*5\s000,00\s?Kz/); assert.match(tx, /Consulta grátis\s*15 min\s*Grátis/); assert.doesNotMatch(tx, /Antigo/, 'serviço inativo não aparece');
assert.doesNotMatch(tx, /Escolha o dia/, 'só depois de escolher o serviço');
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1' } })} />); tx = text(h);
assert.match(tx, /Com quem\?/); assert.match(tx, /Qualquer pessoa/); assert.match(tx, /Escolha o dia/); assert.equal((h.match(/class="dt"/g) ?? []).length + (h.match(/class="dt" disabled/g) ?? []).length >= 15, true, '15 dias (hoje + 14)');
assert.match(h, /disabled=""[^>]*aria-pressed/, 'há dias desativados (domingos)');
assert.doesNotMatch(tx, /Escolha a hora/);
const day = '2026-09-22';
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1', date: day }, initialSlots: [{ out_time: '09:00:00', out_staff: 'p1' }, { out_time: '09:30:00', out_staff: 'p1' }] })} />); tx = text(h);
assert.match(tx, /Escolha a hora/); assert.match(tx, /09:00/); assert.match(tx, /09:30/); assert.doesNotMatch(tx, /Os seus dados/);
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1', date: day }, initialSlots: [] })} />); assert.match(text(h), /Sem horários livres neste dia/);
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1', date: day, time: '09:30' }, initialSlots: [{ out_time: '09:30:00', out_staff: 'p1' }] })} />); tx = text(h);
assert.match(tx, /Os seus dados/); assert.match(tx, /Corte · terça-feira, 22 de setembro às 09:30/); assert.match(tx, /5\s000,00\s?Kz/); assert.match(tx, /Confirmar marcação/);
h = wrap('pt-PT', <BookingFlow {...flow({ autoConfirm: false, initial: { serviceId: 's1', date: day, time: '09:30' }, initialSlots: [{ out_time: '09:30:00', out_staff: 'p1' }] })} />); assert.match(text(h), /Pedir marcação/, 'sem confirmação automática o botão é "Pedir"');
h = wrap('pt-PT', <BookingFlow {...flow({ staff: [staff[0]] })} initial={{ serviceId: 's1' }} />); assert.doesNotMatch(text(h), /Com quem\?/, 'com uma só pessoa não pergunta');
h = wrap('pt-PT', <BookingFlow {...flow({ services: [] })} />); assert.match(text(h), /Ainda não há serviços disponíveis/);
console.log('✔ marcação: serviços, pessoa, dias (fechados desativados), horas e dados');

const done = { booking_id: 'b1', status: 'confirmed', starts_at: '2026-09-22T08:30:00Z', staff_name: 'Marta', public_token: '11111111-1111-1111-1111-111111111111' };
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1' }, initialResult: done })} />); tx = text(h);
assert.match(tx, /Marcação confirmada/); assert.match(tx, /Corte, terça-feira, 22 de setembro de 2026 às 09:30, com Marta/, 'hora no fuso do negócio');
assert.match(tx, /Enviar pelo WhatsApp/); assert.match(tx, /Ver a minha marcação/); assert.match(tx, /Adicionar ao calendário/);
const wa = decodeURIComponent((h.match(/href="(https:\/\/wa\.me\/244923306869[^"]+)"/) ?? [])[1].replace(/&amp;/g, '&'));
assert.match(wa, /Quero confirmar a minha marcação na Salão Bela/); assert.match(wa, /\*Corte\* com Marta/); assert.match(wa, /às 09:30/);
assert.match(h, /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/); assert.match(h, /dates=20260922T083000Z%2F20260922T091500Z/);
assert.match(h, /href="\/pt-PT\/s\/salao\/booking\/11111111-1111-1111-1111-111111111111"/);
h = wrap('pt-PT', <BookingFlow {...flow({ initial: { serviceId: 's1' }, initialResult: { ...done, status: 'pending' } })} />); assert.match(text(h), /Pedido de marcação enviado/); assert.match(text(h), /O negócio vai confirmar em breve/);
h = wrap('pt-PT', <BookingFlow {...flow({ mode: 'admin', initial: { serviceId: 's1' }, initialResult: done })} />); tx = text(h);
assert.match(tx, /Marcação confirmada/); assert.doesNotMatch(tx, /Enviar pelo WhatsApp|Ver a minha marcação/, 'no painel não há WhatsApp para o negócio'); assert.match(tx, /Fechar/);
h = wrap('en', <BookingFlow {...flow({ initial: { serviceId: 's1' }, initialResult: done })} />); assert.match(text(h), /Booking confirmed/); assert.match(text(h), /Tuesday, September 22, 2026 at 09:30, with Marta/);
h = wrap('es', <BookingFlow {...flow()} />); assert.match(text(h), /Elige el servicio/);
console.log('✔ confirmação: WhatsApp, calendário, link de acompanhamento, pendente e modo painel');

// ---- acompanhamento ----
const trk: TrackBooking = { status: 'confirmed', service_name: 'Corte', staff_name: 'Marta', starts_at: '2099-01-05T08:30:00Z', duration_min: 45, price_minor: 500000, tenant_slug: 'salao' };
const tenantTrack = { name: 'Salão Bela', address: 'Rua do Comércio', timezone: 'Africa/Luanda', moneyLocale: 'pt-AO', currency: 'AOA', decimals: 2 };
h = wrap('pt-PT', <BookingTracker token="t" initial={trk} tenant={tenantTrack} />); tx = text(h);
assert.match(tx, /A sua marcação/); assert.match(tx, /Segunda-feira, 5 de janeiro de 2099 · 09:30/, 'só a primeira letra em maiúscula'); assert.match(tx, /Confirmada/); assert.match(tx, /Corte/); assert.match(tx, /09:30/); assert.match(tx, /Salão Bela · Rua do Comércio · Marta/); assert.match(tx, /5\s000,00\s?Kz/);
assert.match(tx, /Cancelar marcação/); assert.match(tx, /Adicionar ao calendário/);
h = wrap('pt-PT', <BookingTracker token="t" initial={{ ...trk, status: 'cancelled' }} tenant={tenantTrack} />); assert.doesNotMatch(text(h), /Cancelar marcação|Adicionar ao calendário/);
h = wrap('pt-PT', <BookingTracker token="t" initial={{ ...trk, starts_at: '2020-01-05T08:30:00Z' }} tenant={tenantTrack} />); assert.doesNotMatch(text(h), /Cancelar marcação/, 'marcação passada não se cancela');
h = wrap('en', <BookingTracker token="t" initial={{ ...trk, status: 'pending' }} tenant={tenantTrack} />); assert.match(text(h), /Your booking/); assert.match(text(h), /Pending/);
console.log('✔ acompanhamento da marcação: estados, calendário e cancelamento só se futura');
process.exit(0);
