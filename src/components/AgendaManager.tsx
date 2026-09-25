'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { fmtPhoneIntl, waLink } from '@/lib/phone';
import { addDays, bookingActions, buildService, dayRangeUtc, timeInTz, todayInTz, toServiceForm, weekdayOf, type BookingRow, type HoursRow, type ServiceForm, type ServiceRow, type StaffRow } from '@/lib/booking';
import { BookingFlow } from './store/BookingFlow';

export interface AgendaTenant { id: string; slug: string; name: string; timezone: string; country: string; currency: string; decimals: number; moneyLocale: string; whatsapp: string | null; daysAhead: number; autoConfirm: boolean }
interface Props { tenant: AgendaTenant; services: ServiceRow[]; staff: StaffRow[]; hours: HoursRow[]; blocked: string[]; initialDate: string; initialBookings: BookingRow[]; canAdmin: boolean; /** O prestador ligado a este login (se houver) — a agenda de um funcionário comum já começa filtrada nele. */ myStaffId?: string | null; /** Só para testes/SSR. */ initialTab?: 'day' | 'services' | 'team' }
type Dialog = { kind: 'booking' } | { kind: 'service'; s?: ServiceRow } | { kind: 'staff'; s?: StaffRow } | null;
const ERR = ['name', 'duration', 'price', 'date', 'forbidden', 'status', 'generic'];

export function AgendaManager({ tenant, services: s0, staff: st0, hours, blocked: b0, initialDate, initialBookings, canAdmin, myStaffId = null, initialTab = 'day' }: Props) {
  const t = useTranslations('agenda');
  const tb = useTranslations('booking');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tbd = tb as unknown as (key: string) => string;
  const locale = useLocale();
  const [tab, setTab] = useState<'day' | 'services' | 'team'>(initialTab);
  const [date, setDate] = useState(initialDate);
  const [bookings, setBookings] = useState(initialBookings);
  const [staffFilter, setStaffFilter] = useState(!canAdmin && myStaffId ? myStaffId : 'all');
  const [services, setServices] = useState(s0);
  const [staff, setStaff] = useState(st0);
  const [blocked, setBlocked] = useState(b0);
  const [blockDate, setBlockDate] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, tenant.currency, tenant.moneyLocale, tenant.decimals);
  const fail = (k: string) => setMsg(tt(`errors.${ERR.includes(k) ? k : 'generic'}`));
  const dayLabel = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); const s = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); return s.charAt(0).toUpperCase() + s.slice(1); };

  const loadDay = useCallback(async (d: string) => {
    const r = dayRangeUtc(d, tenant.timezone);
    const { data } = await createClient().from('bookings').select('*').eq('tenant_id', tenant.id).gte('starts_at', r.from).lt('starts_at', r.to).order('starts_at');
    if (data) setBookings(data as BookingRow[]);
  }, [tenant.id, tenant.timezone]);
  useEffect(() => { void loadDay(date); const id = setInterval(() => { void loadDay(date); }, 30000); return () => clearInterval(id); }, [date, loadDay]);

  const reloadSetup = async () => {
    const sb = createClient();
    const [sv, sf, bl] = await Promise.all([
      sb.from('services').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
      sb.from('staff').select('*').eq('tenant_id', tenant.id).order('name'),
      sb.from('blocked_dates').select('day').eq('tenant_id', tenant.id).order('day'),
    ]);
    if (sv.data) setServices(sv.data as ServiceRow[]); if (sf.data) setStaff(sf.data as StaffRow[]); if (bl.data) setBlocked((bl.data as { day: string }[]).map((x) => x.day));
  };

  async function setStatus(b: BookingRow, status: string) {
    setMsg(null);
    if (status === 'cancelled' && !window.confirm(tt('confirmCancel', { name: b.customer_name }))) return;
    const { error } = await createClient().from('bookings').update({ status }).eq('id', b.id);
    if (error) fail('status');
    await loadDay(date);
  }
  async function remove(table: 'services' | 'staff', id: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    const { error } = await createClient().from(table).delete().eq('id', id);
    if (error) fail(dbErrorKey(error)); else setMsg(null);
    await reloadSetup();
  }
  async function toggle(table: 'services' | 'staff', id: string, active: boolean) {
    const { error } = await createClient().from(table).update({ active }).eq('id', id);
    if (error) fail(dbErrorKey(error));
    await reloadSetup();
  }
  async function addBlocked() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blockDate)) return fail('date');
    const { error } = await createClient().from('blocked_dates').upsert({ tenant_id: tenant.id, day: blockDate }, { onConflict: 'tenant_id,day' });
    if (error) fail(dbErrorKey(error)); else { setMsg(null); setBlockDate(''); }
    await reloadSetup();
  }
  async function unblock(day: string) {
    const { error } = await createClient().from('blocked_dates').delete().eq('tenant_id', tenant.id).eq('day', day);
    if (error) fail(dbErrorKey(error));
    await reloadSetup();
  }

  const rows = bookings.filter((b) => staffFilter === 'all' || b.staff_id === staffFilter);
  const counted = rows.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show'); // canceladas e faltas não contam
  const expected = counted.reduce((a, b) => a + b.price_minor, 0);
  const dayHours = hours.find((h) => h.weekday === weekdayOf(date));
  const closed = !dayHours?.is_open || blocked.includes(date);
  const today = todayInTz(tenant.timezone);

  return (
    <>
      {!canAdmin && <p className="card sm muted" style={{ marginBottom: 16 }}>{t('viewOnly')}</p>}
      <div className="seg" role="group" style={{ marginBottom: 20 }}>
        {(['day', 'services', 'team'] as const).map((k) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{tt(`tabs.${k}`)}</button>)}
      </div>
      {msg && <p className="err" role="alert" style={{ marginBottom: 12 }}>{msg}</p>}

      {tab === 'day' && (
        <>
          <div className="toolbar">
            <button className="iconbtn" aria-label={t('prevDay')} onClick={() => setDate(addDays(date, -1))}>‹</button>
            <b style={{ fontSize: 18, minWidth: 190, textAlign: 'center' }}>{dayLabel(date)}</b>
            <button className="iconbtn" aria-label={t('nextDay')} onClick={() => setDate(addDays(date, 1))}>›</button>
            {date !== today && <button className="btn sm gray" onClick={() => setDate(today)}>{t('today')}</button>}
            <span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setDialog({ kind: 'booking' })}>+ {t('newBooking')}</button>
          </div>
          {staff.length > 1 && (
            <div className="chips" style={{ marginBottom: 14 }}>
              <button className="chip" aria-pressed={staffFilter === 'all'} onClick={() => setStaffFilter('all')}>{t('allStaff')}</button>
              {staff.map((s) => <button key={s.id} className="chip" aria-pressed={staffFilter === s.id} onClick={() => setStaffFilter(s.id)}>{s.name}</button>)}
            </div>
          )}
          {rows.length === 0 ? <div className="card muted">{closed ? t('closedDay') : t('emptyDay')}</div> : (
            <>
              <div className="list">
                {rows.map((b) => {
                  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: tenant.timezone }).format(new Date(b.starts_at));
                  return (
                    <div className="bk" key={b.id}>
                      <div className="t">{timeInTz(b.starts_at, tenant.timezone)}<small>{tt('until', { end: timeInTz(b.ends_at, tenant.timezone) })}</small></div>
                      <div className="g">
                        <strong>{b.service_name} <span className={`badge ${b.status === 'confirmed' || b.status === 'completed' ? 'ok' : b.status === 'pending' ? 'warn' : 'bad'}`} style={{ display: 'inline-flex', marginLeft: 6 }}>{tbd(`status.${b.status}`)}</span></strong>
                        <span>{b.customer_name} · {fmtPhoneIntl(b.customer_phone)}</span>
                        <span>{b.staff_name} · {b.price_minor ? money(b.price_minor) : tb('free')}{b.note ? ` · ${b.note}` : ''}</span>
                        <div className="acts">
                          {bookingActions(b.status).map((a) => <button key={a} className={`btn sm ${a === 'cancelled' ? 'bad' : a === 'no_show' ? 'gray' : ''}`} onClick={() => setStatus(b, a)}>{tt(`actions.${a}`)}</button>)}
                          {(b.status === 'pending' || b.status === 'confirmed') && <a className="btn sm wa" target="_blank" rel="noopener" aria-label={`${t('remind')} — ${b.customer_name}`}
                            href={waLink(b.customer_phone, tt('waReminder', { name: b.customer_name.split(' ')[0], service: b.service_name, staff: b.staff_name, date: when, time: timeInTz(b.starts_at, tenant.timezone), business: tenant.name }))}>{t('remind')}</a>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="muted small" style={{ margin: '12px 4px' }}>{tt('summary', { count: counted.length, total: money(expected) })}</p>
            </>
          )}
        </>
      )}

      {tab === 'services' && (
        <>
          {canAdmin && <div className="toolbar"><button className="btn sm" onClick={() => setDialog({ kind: 'service' })}>+ {t('newService')}</button></div>}
          {services.length === 0 ? <div className="card muted">{t('noServices')}</div> : (
            <div className="list">{services.map((s) => (
              <div className="row" key={s.id} style={{ opacity: s.active ? 1 : 0.6, flexWrap: 'wrap' }}>
                <div className="g"><strong>{s.name}</strong><small>{tb('minutes', { n: s.duration_min })}{s.description ? ` · ${s.description}` : ''}</small></div>
                <b>{s.price_minor ? money(s.price_minor) : tb('free')}</b>
                {canAdmin && <div className="r">
                  <label className="sw" title={t('available')}><input type="checkbox" checked={s.active} onChange={(e) => toggle('services', s.id, e.target.checked)} aria-label={t('available')} /><i /></label>
                  <button className="iconbtn" onClick={() => setDialog({ kind: 'service', s })}>{t('edit')}</button>
                  <button className="iconbtn bad" onClick={() => remove('services', s.id, tt('confirmDeleteService', { name: s.name }))}>{t('delete')}</button>
                </div>}
              </div>
            ))}</div>
          )}
        </>
      )}

      {tab === 'team' && (
        <>
          <div className="group-t"><span>{t('staff')}</span>{canAdmin && <button className="btn sm" onClick={() => setDialog({ kind: 'staff' })}>+ {t('newStaff')}</button>}</div>
          {staff.length === 0 ? <div className="card sm muted">{t('noStaff')}</div> : (
            <div className="list">{staff.map((s) => (
              <div className="row" key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                <div className="g"><strong>{s.name}</strong></div>
                {canAdmin && <div className="r">
                  <label className="sw" title={t('active')}><input type="checkbox" checked={s.active} onChange={(e) => toggle('staff', s.id, e.target.checked)} aria-label={t('active')} /><i /></label>
                  <button className="iconbtn" onClick={() => setDialog({ kind: 'staff', s })}>{t('edit')}</button>
                  <button className="iconbtn bad" onClick={() => remove('staff', s.id, tt('confirmDeleteStaff', { name: s.name }))}>{t('delete')}</button>
                </div>}
              </div>
            ))}</div>
          )}
          <div className="group-t" style={{ marginTop: 30 }}><span>{t('blocked')}</span></div>
          <div className="list">
            {blocked.length === 0 && <div className="row"><div className="g muted">{t('blockedEmpty')}</div></div>}
            {blocked.map((d) => <div className="row" key={d}><div className="g"><strong>{dayLabel(d)}</strong></div>{canAdmin && <button className="iconbtn" onClick={() => unblock(d)}>{t('unblock')}</button>}</div>)}
            {canAdmin && <div className="row"><input className="input" type="date" min={today} style={{ maxWidth: 200, minHeight: 38 }} aria-label={t('blockDay')} value={blockDate} onChange={(e) => setBlockDate(e.target.value)} /><button className="btn sm gray" onClick={addBlocked}>{t('blockDay')}</button></div>}
          </div>
        </>
      )}

      {dialog?.kind === 'booking' && (
        <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}>
          <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('newBooking')}>
            <h2>{t('newBooking')}</h2>
            <BookingFlow mode="admin" slug={tenant.slug} tenant={{ name: tenant.name, country: tenant.country, currency: tenant.currency, decimals: tenant.decimals, moneyLocale: tenant.moneyLocale, timezone: tenant.timezone, whatsapp: tenant.whatsapp }}
              services={services} staff={staff} hours={hours} blocked={blocked} daysAhead={tenant.daysAhead} autoConfirm={tenant.autoConfirm} onDone={() => { setDialog(null); void loadDay(date); }} />
          </div>
        </div>
      )}
      {dialog?.kind === 'service' && <ServiceDialog tenant={tenant} s={dialog.s} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reloadSetup(); }} />}
      {dialog?.kind === 'staff' && <StaffDialog tenantId={tenant.id} s={dialog.s} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reloadSetup(); }} />}
    </>
  );
}

function ServiceDialog({ tenant, s, onClose, onSaved }: { tenant: AgendaTenant; s?: ServiceRow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('agenda');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const [f, setF] = useState<ServiceForm>(toServiceForm(s ?? null, tenant.decimals));
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = buildService(f, { currency: tenant.currency, decimals: tenant.decimals });
    if (!r.ok) return setErr(r.error);
    const sb = createClient();
    const { error } = s ? await sb.from('services').update(r.value).eq('id', s.id) : await sb.from('services').insert({ ...r.value, tenant_id: tenant.id });
    if (error) return setErr(['forbidden', 'invalid_data'].includes(dbErrorKey(error)) ? 'forbidden' : 'generic');
    onSaved();
  }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" role="dialog" aria-modal="true" aria-label={s ? t('editService') : t('newService')} onSubmit={save}>
        <h2>{s ? t('editService') : t('newService')}</h2>
        <div className="field"><label htmlFor="sv-name">{t('fName')}</label><input id="sv-name" className="input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div className="frow">
          <div className="field"><label htmlFor="sv-dur">{t('fDuration')}</label><input id="sv-dur" className="input" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
          <div className="field"><label htmlFor="sv-price">{tt('fPrice', { currency: tenant.currency })}</label><input id="sv-price" className="input" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="sv-desc">{t('fDescription')}</label><textarea id="sv-desc" className="input" maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="row" style={{ padding: 0, minHeight: 0 }}><div className="g"><strong>{t('available')}</strong></div><label className="sw"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} aria-label={t('available')} /><i /></label></div>
        {err && <p className="err" role="alert">{tt(`errors.${ERR.includes(err) ? err : 'generic'}`)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn" type="submit">{t('save')}</button></div>
      </form>
    </div>
  );
}

function StaffDialog({ tenantId, s, onClose, onSaved }: { tenantId: string; s?: StaffRow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('agenda');
  const tt = t as unknown as (key: string) => string;
  const [name, setName] = useState(s?.name ?? '');
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 1) return setErr('name');
    const sb = createClient();
    const { error } = s ? await sb.from('staff').update({ name: name.trim() }).eq('id', s.id) : await sb.from('staff').insert({ tenant_id: tenantId, name: name.trim() });
    if (error) return setErr('forbidden');
    onSaved();
  }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-label={t('newStaff')} onSubmit={save}>
        <h2>{s ? t('edit') : t('newStaff')}</h2>
        <div className="field"><label htmlFor="st-name">{t('staffName')}</label><input id="st-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        {err && <p className="err" role="alert">{tt(`errors.${err}`)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn" type="submit">{t('save')}</button></div>
      </form>
    </div>
  );
}
