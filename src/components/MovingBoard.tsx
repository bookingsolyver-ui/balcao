'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { formatMoney, moneyLocale, toMinor } from '@/lib/money';
import { fmtPhoneIntl, waLink } from '@/lib/phone';
import { addressLine, moveActions, moveGuard, moveMessage, movesToCsv, type MoveRow, type MoveStatus } from '@/lib/moving';

export interface MovingTenant { id: string; slug: string; name: string; country: string; currency: string; decimals: number; timezone: string; whatsapp: string | null; locale: string }
interface Props { tenant: MovingTenant; initialRows: MoveRow[]; canDownload: boolean }
type Dialog = { kind: 'quote' | 'confirm' | 'lost' | 'detail'; r: MoveRow } | null;
const COLUMNS: MoveStatus[] = ['new', 'visit', 'quoted', 'accepted', 'confirmed'];

export function MovingBoard({ tenant, initialRows, canDownload }: Props) {
  const t = useTranslations('moveOrders');
  const tm = useTranslations('move');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tmt = tm as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [filter, setFilter] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mLocale = moneyLocale(locale, tenant.country);
  const money = (n: number) => formatMoney(n, tenant.currency, mLocale, tenant.decimals);
  const dateFmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
  const longDate = (ymd: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(ymd + 'T00:00:00Z'));

  const reload = useCallback(async () => {
    const { data } = await createClient().from('move_requests').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(300);
    if (data) setRows(data as MoveRow[]);
  }, [tenant.id]);
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`moves:${tenant.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'move_requests', filter: `tenant_id=eq.${tenant.id}` }, () => void reload()).subscribe();
    const poll = setInterval(() => void reload(), 15000);
    return () => { sb.removeChannel(ch); clearInterval(poll); };
  }, [tenant.id, reload]);

  async function patch(r: MoveRow, fields: Record<string, unknown>) {
    setNotice(null);
    const { error } = await createClient().from('move_requests').update(fields).eq('id', r.id);
    if (error) setNotice(tt(`errors.${['forbidden', 'quote_required', 'date_required'].includes(dbErrorKey(error)) ? dbErrorKey(error) : 'generic'}`));
    await reload();
  }
  async function setStatus(r: MoveRow, s: MoveStatus) { await patch(r, { status: s }); }
  const openFor = (r: MoveRow, s: MoveStatus) => { if (s === 'quoted') setDialog({ kind: 'quote', r }); else if (s === 'confirmed') setDialog({ kind: 'confirm', r }); else if (s === 'lost') setDialog({ kind: 'lost', r }); else void setStatus(r, s); };

  const notifyText = (r: MoveRow, kind: 'visit' | 'quoted' | 'confirmed' | 'done' | 'lost') => tt(`wa.${kind}`, {
    name: r.customer_name.split(' ')[0], number: r.number, business: tenant.name,
    amount: r.quoted_minor != null ? money(r.quoted_minor) : '', url: `${typeof window === 'undefined' ? '' : window.location.origin}/${locale}/s/${tenant.slug}/move/${r.public_token}`,
    date: r.confirmed_date ? longDate(r.confirmed_date) : '',
  });

  const q = filter.trim().toLowerCase();
  const list = rows.filter((r) => !q || `${r.customer_name} ${r.customer_phone} ${r.number}`.toLowerCase().includes(q));
  const active = list.filter((r) => r.status !== 'done' && r.status !== 'lost');
  const history = list.filter((r) => r.status === 'done' || r.status === 'lost');

  async function exportCsv() {
    const H = { number: tt('detail'), status: '', created: dateFmt(new Date().toISOString()), name: tmt('name'), phone: tmt('phone'), email: tmt('email'), type: t('typology'), volume: t('volume'),
      origin: t('from'), originFloor: `${t('from')} ${t('floor')}`, originElevator: `${t('from')} ${t('elevator') || ''}`.trim(), destination: t('to'), destFloor: `${t('to')} ${t('floor')}`, destElevator: `${t('to')} elevador`,
      extras: t('extras'), special: t('special'), preferred: t('preferredDate'), window: tmt('window'), price: t('quoteAmount').replace(/ \(.*\)/, ''), confirmed: t('confirmedDate'), crew: t('crew'), notes: t('notes'), internal: t('internalNotes'), yes: t('elevatorYes'), no: t('elevatorNo') };
    const csv = movesToCsv(rows, H as Record<string, string>, { money, status: (s) => tmt(`status.${s}`), type: (x) => tmt(`type.${x}`), window: (w) => tmt(`window${w.charAt(0).toUpperCase()}${w.slice(1)}` as never), date: dateFmt });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${tenant.slug}-mudancas-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const card = (r: MoveRow) => (
    <article className="mv-card" key={r.id}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>#{r.number}</strong><span className="badge acc">{tmt(`type.${r.move_type}`)}</span><span className="badge">{r.volume_m3} m³</span>
        <time style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg3)' }}>{dateFmt(r.created_at)}</time>
      </header>
      <div className="small muted">{r.customer_name} · {fmtPhoneIntl(r.customer_phone)}</div>
      <div className="small">{r.origin_city} → {r.dest_city}</div>
      {r.preferred_date && <div className="small muted">{tt('preferredDate')}: {longDate(r.preferred_date)}{r.date_flexible ? ' *' : ''}</div>}
      {r.quoted_minor != null && <div style={{ fontWeight: 700, fontSize: 17 }}>{money(r.quoted_minor)}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn sm ghost" onClick={() => setDialog({ kind: 'detail', r })}>{t('detail')}</button>
        <a className="btn sm wa" target="_blank" rel="noopener" href={waLink(r.customer_phone, notifyText(r, r.status === 'new' ? 'visit' : r.status === 'quoted' ? 'quoted' : r.status === 'confirmed' ? 'confirmed' : 'visit'))}>{t('notify')}</a>
        {moveActions(r.status).map((a) => <button key={a} className={`btn sm ${a === 'lost' ? 'bad' : ''}`} onClick={() => openFor(r, a)}>{tt(`actions.${a}`)}</button>)}
      </div>
    </article>
  );

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="group"><button aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>{t('queue')} ({active.length})</button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>{t('history')}</button></div>
        {canDownload && <button className="btn sm gray" onClick={exportCsv}>{t('export')}</button>}
      </div>
      <div className="toolbar"><input className="input" style={{ maxWidth: 340, borderRadius: 999 }} placeholder={t('filter')} aria-label={t('filter')} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      {notice && <p className="err" role="alert" style={{ marginBottom: 12 }}>{notice}</p>}

      {tab === 'queue' ? (active.length === 0 ? <div className="card muted">{t('empty')}</div> : (
        <div className="board">{COLUMNS.map((c) => { const l = active.filter((r) => r.status === c); return (
          <div key={c}><div className="col-t"><span>{tt(`columns.${c}`)}</span><span>{l.length}</span></div><div className="col">{l.length ? l.map(card) : <div className="muted small" style={{ padding: '6px 4px' }}>{t('emptyColumn')}</div>}</div></div>
        ); })}</div>
      )) : (history.length === 0 ? <div className="card muted">{t('emptyHistory')}</div> : <div className="board">{history.map(card)}</div>)}

      {dialog?.kind === 'quote' && <QuoteDialog r={dialog.r} tenant={tenant} onClose={() => setDialog(null)} onSave={async (minor, note) => { await patch(dialog.r, { quoted_minor: minor, quote_note: note, status: 'quoted' }); setDialog(null); }} />}
      {dialog?.kind === 'confirm' && <ConfirmDialog r={dialog.r} onClose={() => setDialog(null)} onSave={async (date, win, crew) => { await patch(dialog.r, { confirmed_date: date, confirmed_window: win, crew: crew || null, status: 'confirmed' }); setDialog(null); }} />}
      {dialog?.kind === 'lost' && <LostDialog r={dialog.r} onClose={() => setDialog(null)} onSave={async (reason) => { await patch(dialog.r, { status: 'lost', lost_reason: reason || null }); setDialog(null); }} />}
      {dialog?.kind === 'detail' && <DetailDialog r={dialog.r} tenant={tenant} money={money} onClose={() => setDialog(null)} onSaveNotes={async (notes) => { await patch(dialog.r, { internal_notes: notes }); }} />}
    </>
  );
}

function QuoteDialog({ r, tenant, onClose, onSave }: { r: MoveRow; tenant: MovingTenant; onClose: () => void; onSave: (minor: number, note: string) => void }) {
  const t = useTranslations('moveOrders'); const tt = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState<string | null>(null);
  function save(e: React.FormEvent) {
    e.preventDefault();
    const minor = toMinor(amount, tenant.currency, tenant.decimals);
    if (minor === null || minor <= 0) return setErr('amount');
    if (moveGuard('quoted', { quoted: amount, confirmedDate: '' })) return setErr('quote_required');
    onSave(minor, note.trim());
  }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" role="dialog" aria-modal="true" aria-label={t('quoteDialog')} onSubmit={save}>
        <h2>{tt('quoteDialog')} — #{r.number}</h2>
        <div className="field"><label htmlFor="q-amt">{tt('quoteAmount', { currency: tenant.currency })}</label><input id="q-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
        <div className="field"><label htmlFor="q-note">{t('quoteNote')}</label><textarea id="q-note" className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {err && <p className="err" role="alert">{tt(`errors.${err}`)}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn" type="submit">{t('send')}</button></div>
      </form>
    </div>
  );
}
function ConfirmDialog({ r, onClose, onSave }: { r: MoveRow; onClose: () => void; onSave: (date: string, win: string, crew: string) => void }) {
  const t = useTranslations('moveOrders'); const tm = useTranslations('move');
  const [date, setDate] = useState(r.confirmed_date ?? r.preferred_date ?? ''); const [win, setWin] = useState<string>(r.confirmed_window ?? r.time_window ?? 'any'); const [crew, setCrew] = useState(r.crew ?? ''); const [err, setErr] = useState(false);
  function save(e: React.FormEvent) { e.preventDefault(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr(true); onSave(date, win, crew); }
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" role="dialog" aria-modal="true" aria-label={t('confirmDialog')} onSubmit={save}>
        <h2>{t('confirmDialog')} — #{r.number}</h2>
        <div className="frow">
          <div className="field"><label htmlFor="c-date">{t('confirmedDate')}</label><input id="c-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="c-win">{t('confirmedWindow')}</label><select id="c-win" className="input" value={win} onChange={(e) => setWin(e.target.value)}><option value="any">{tm('windowAny')}</option><option value="morning">{tm('windowMorning')}</option><option value="afternoon">{tm('windowAfternoon')}</option></select></div>
        </div>
        <div className="field"><label htmlFor="c-crew">{t('crew')}</label><input id="c-crew" className="input" maxLength={80} value={crew} onChange={(e) => setCrew(e.target.value)} /></div>
        {err && <p className="err" role="alert">{(t as unknown as (k: string) => string)('errors.date_required')}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn" type="submit">{t('confirmBtn')}</button></div>
      </form>
    </div>
  );
}
function LostDialog({ r, onClose, onSave }: { r: MoveRow; onClose: () => void; onSave: (reason: string) => void }) {
  const t = useTranslations('moveOrders'); const [reason, setReason] = useState('');
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal form" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-label={t('lostDialog')} onSubmit={(e) => { e.preventDefault(); onSave(reason.trim()); }}>
        <h2>{t('lostDialog')} — #{r.number}</h2>
        <div className="field"><label htmlFor="l-reason">{t('lostReason')}</label><input id="l-reason" className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button type="button" className="btn gray" onClick={onClose}>{t('cancel')}</button><button className="btn bad" type="submit">{t('markLost')}</button></div>
      </form>
    </div>
  );
}
function DetailDialog({ r, tenant, money, onClose, onSaveNotes }: { r: MoveRow; tenant: MovingTenant; money: (n: number) => string; onClose: () => void; onSaveNotes: (n: string) => void }) {
  const t = useTranslations('moveOrders'); const tm = useTranslations('move'); const tmt = tm as unknown as (k: string) => string;
  const [notes, setNotes] = useState(r.internal_notes ?? ''); const [saved, setSaved] = useState(false);
  const eloc = { floor: t('floor'), elevatorYes: t('elevatorYes'), elevatorNo: t('elevatorNo') };
  return (
    <div className="mbg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('detail')}>
        <h2>{t('detail')} — #{r.number}</h2>
        <dl className="mv-grid">
          <dt>{tmt('name')}</dt><dd>{r.customer_name}</dd><dt>{tmt('phone')}</dt><dd>+{r.customer_phone}</dd>
          {r.customer_email && <><dt>{tmt('email')}</dt><dd>{r.customer_email}</dd></>}
          <dt>{t('typology')}</dt><dd>{tmt(`type.${r.move_type}`)}</dd><dt>{t('volume')}</dt><dd>{r.volume_m3} m³</dd>
          <dt>{t('from')}</dt><dd>{addressLine(r.origin_street, r.origin_city, r.origin_postal, r.origin_floor, r.origin_elevator, eloc)}</dd>
          <dt>{t('to')}</dt><dd>{addressLine(r.dest_street, r.dest_city, r.dest_postal, r.dest_floor, r.dest_elevator, eloc)}</dd>
          <dt>{t('extras')}</dt><dd>{r.extras.length ? r.extras.join(', ') : t('none')}</dd><dt>{t('special')}</dt><dd>{r.special_items.length ? r.special_items.join(', ') : t('none')}</dd>
          {r.preferred_date && <><dt>{t('preferredDate')}</dt><dd>{r.preferred_date}{r.date_flexible ? ' *' : ''}</dd></>}
          {r.quoted_minor != null && <><dt>{t('quoteAmount').replace(/\s*\(.*\)/, '')}</dt><dd>{money(r.quoted_minor)}</dd></>}
        </dl>
        {r.notes && <><h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 14 }}>{t('notes')}</h3><p className="sf-note">{r.notes}</p></>}
        <div className="field" style={{ marginTop: 16 }}><label htmlFor="d-int">{t('internalNotes')}</label><textarea id="d-int" className="input" rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} /><span className="hint">{t('internalNotesHint')}</span></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn gray" onClick={onClose}>{t('close')}</button>
          <button type="button" className="btn" onClick={() => { onSaveNotes(notes); setSaved(true); }}>{saved ? t('waNote') : t('save')}</button>
        </div>
      </div>
    </div>
  );
}
