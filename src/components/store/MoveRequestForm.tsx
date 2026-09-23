'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { dbErrorKey } from '@/lib/errors';
import { waLink } from '@/lib/phone';
import { addressLine, buildMoveRequest, emptyMoveForm, estimateVolume, moveMessage, type AddressForm, type MoveForm, type MoveSettings } from '@/lib/moving';

export interface MoveTenant { slug: string; name: string; whatsapp: string | null; country: string; timezone: string }
interface Props { tenant: MoveTenant; cfg: MoveSettings; fullDays: string[]; today: string }
const MOVE_TYPES = ['home', 'office', 'furniture'] as const;
const KNOWN = ['name', 'phone', 'email', 'volume', 'origin', 'destination', 'origin_postal', 'destination_postal', 'origin_floor', 'destination_floor', 'date', 'day_full', 'consent', 'notes', 'tenant_not_found', 'module_disabled', 'too_many_requests', 'generic'];

export function MoveRequestForm({ tenant, cfg, fullDays, today }: Props) {
  const t = useTranslations('move');
  const tt = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const locale = useLocale();
  const [f, setF] = useState<MoveForm>(emptyMoveForm());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; token: string; text: string } | null>(null);
  const set = <K extends keyof MoveForm>(k: K, v: MoveForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const setAddr = (which: 'origin' | 'destination', patch: Partial<AddressForm>) => setF((p) => ({ ...p, [which]: { ...p[which], ...patch } }));
  const toggle = (list: 'extras' | 'special', v: string) => setF((p) => ({ ...p, [list]: p[list].includes(v) ? p[list].filter((x) => x !== v) : [...p[list], v] }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const b = buildMoveRequest(f, { country: tenant.country, today, fullDays });
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('submit_move_request', { p_slug: tenant.slug, p_data: b.payload });
      if (error) { const k = dbErrorKey(error); return setErr(KNOWN.includes(k) ? k : 'generic'); }
      const r = data as { number: number; public_token: string };
      const url = `${window.location.origin}/${locale}/s/${tenant.slug}/move/${r.public_token}`;
      const eloc = { floor: t('floor'), elevatorYes: t('elevatorYes'), elevatorNo: t('elevatorNo') };
      const text = moveMessage({
        number: r.number, business: tenant.name, name: f.name.trim(), phone: b.payload.phone, email: b.payload.email,
        typeLabel: tt(`type.${f.moveType}`), volume: `${b.payload.volume_m3} m³`,
        origin: addressLine(b.payload.origin.street, b.payload.origin.city, b.payload.origin.postal, b.payload.origin.floor, b.payload.origin.elevator, eloc),
        destination: addressLine(b.payload.destination.street, b.payload.destination.city, b.payload.destination.postal, b.payload.destination.floor, b.payload.destination.elevator, eloc),
        extras: f.extras, special: f.special, date: f.preferredDate || '—', notes: b.payload.notes, trackUrl: url,
        labels: { title: t('wa.title'), customer: t('wa.customer'), type: t('wa.type'), volume: t('wa.volume'), from: t('wa.from'), to: t('wa.to'), extras: t('wa.extras'), special: t('wa.special'), date: t('wa.date'), notes: t('wa.notes'), track: t('wa.track') },
      });
      setDone({ number: r.number, token: r.public_token, text });
    } catch { setErr('generic'); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="done-i" aria-hidden="true">✓</div>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{tt('doneTitle', { number: done.number })}</h2>
        <p className="muted" style={{ margin: '8px 0 18px' }}>{tt('doneText', { business: tenant.name })}</p>
        <div className="form" style={{ textAlign: 'left' }}>
          {tenant.whatsapp ? <a className="btn wa block" target="_blank" rel="noopener" href={waLink(tenant.whatsapp, done.text)}>{t('sendWhatsapp')}</a> : <p className="sf-note">{t('noWhatsapp')}</p>}
          <a className="btn ghost block" href={`/${locale}/s/${tenant.slug}/move/${done.token}`}>{t('track')}</a>
          <button className="btn gray block" onClick={() => { setDone(null); setF(emptyMoveForm()); }}>{t('another')}</button>
        </div>
      </div>
    );
  }

  const errText = err ? tt(`errors.${err}`) : null;
  const Intro = () => (<><h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', marginBottom: 6 }}>{t('title')}</h2><p className="muted" style={{ marginBottom: 20 }}>{t('intro')}</p></>);
  const AddressFields = ({ which, label }: { which: 'origin' | 'destination'; label: string }) => {
    const a = f[which];
    return (
      <div>
        <h3 className="sec-t" style={{ fontSize: 18, marginBottom: 10 }}>{label}</h3>
        <div className="addr-card">
          <div className="field"><label htmlFor={`${which}-street`}>{t('street')}</label><input id={`${which}-street`} className="input" value={a.street} onChange={(e) => setAddr(which, { street: e.target.value })} /></div>
          <div className="frow">
            <div className="field"><label htmlFor={`${which}-city`}>{t('city')}</label><input id={`${which}-city`} className="input" value={a.city} onChange={(e) => setAddr(which, { city: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${which}-postal`}>{t('postal')}</label><input id={`${which}-postal`} className="input" value={a.postal} onChange={(e) => setAddr(which, { postal: e.target.value })} /></div>
            <div className="field"><label htmlFor={`${which}-floor`}>{t('floor')}</label><input id={`${which}-floor`} className="input" inputMode="numeric" placeholder="0" value={a.floor} onChange={(e) => setAddr(which, { floor: e.target.value })} /><span className="hint">{t('floorHint')}</span></div>
          </div>
          <div className="field"><span className="lbl">{t('elevator')}</span>
            <div className="seg3" role="group">
              <button type="button" aria-pressed={a.elevator === 'yes'} onClick={() => setAddr(which, { elevator: 'yes' })}>{t('elevatorYes')}</button>
              <button type="button" aria-pressed={a.elevator === 'no'} onClick={() => setAddr(which, { elevator: 'no' })}>{t('elevatorNo')}</button>
              <button type="button" aria-pressed={a.elevator === ''} onClick={() => setAddr(which, { elevator: '' })}>{t('elevatorUnknown')}</button>
            </div></div>
          <div className="field"><label htmlFor={`${which}-access`}>{t('access')}</label><input id={`${which}-access`} className="input" maxLength={300} value={a.access} onChange={(e) => setAddr(which, { access: e.target.value })} /><span className="hint">{t('accessHint')}</span></div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <Intro />
    <form className="movef" onSubmit={submit}>
      <div>
        <h3 className="sec-t">{t('moveType')}</h3>
        <div className="seg3" role="group">{MOVE_TYPES.map((mt) => <button type="button" key={mt} aria-pressed={f.moveType === mt} onClick={() => set('moveType', mt)}>{tt(`type.${mt}`)}</button>)}</div>
      </div>
      <div>
        <h3 className="sec-t">{t('volume')}</h3>
        <div className="frow" style={{ alignItems: 'end' }}>
          <div className="field"><label htmlFor="mv-volume">{t('volume')}</label><input id="mv-volume" className="input" inputMode="decimal" placeholder="30" value={f.volume} onChange={(e) => set('volume', e.target.value)} /></div>
          {cfg.typologies.length > 0 && (
            <div className="field"><label htmlFor="mv-typo">{t('typology')}</label>
              <select id="mv-typo" className="input" value="" onChange={(e) => { const v = estimateVolume(e.target.value, cfg); if (v != null) set('volume', String(v)); }}>
                <option value="">{t('chooseTypology')}</option>{cfg.typologies.map((ty) => <option key={ty.key} value={ty.key}>{ty.key} · {ty.m3} m³</option>)}
              </select></div>
          )}
        </div>
        <p className="hint">{t('volumeHint')}</p>
      </div>

      <AddressFields which="origin" label={t('origin')} />
      <AddressFields which="destination" label={t('destination')} />

      {cfg.extras.length > 0 && (
        <div><h3 className="sec-t">{t('extras')}</h3>
          <div className="check-grid">{cfg.extras.map((e) => (
            <label key={e.name} className={`check-opt ${f.extras.includes(e.name) ? 'on' : ''}`}><input type="checkbox" checked={f.extras.includes(e.name)} onChange={() => toggle('extras', e.name)} />{e.name}</label>
          ))}</div></div>
      )}
      {cfg.special_items.length > 0 && (
        <div><h3 className="sec-t">{t('special')}</h3><p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>{t('specialHint')}</p>
          <div className="check-grid">{cfg.special_items.map((s) => (
            <label key={s} className={`check-opt ${f.special.includes(s) ? 'on' : ''}`}><input type="checkbox" checked={f.special.includes(s)} onChange={() => toggle('special', s)} />{s}</label>
          ))}</div></div>
      )}

      <div>
        <h3 className="sec-t">{t('when')}</h3>
        <div className="frow">
          <div className="field"><label htmlFor="mv-date">{t('preferredDate')}</label><input id="mv-date" className="input" type="date" min={today} value={f.preferredDate} onChange={(e) => set('preferredDate', e.target.value)} />
            {f.preferredDate && fullDays.includes(f.preferredDate) && <span className="hint" style={{ color: 'var(--warn)' }}>{t('dayFull')}</span>}</div>
          <div className="field"><span className="lbl">{t('window')}</span>
            <div className="seg3" role="group"><button type="button" aria-pressed={f.window === 'any'} onClick={() => set('window', 'any')}>{t('windowAny')}</button><button type="button" aria-pressed={f.window === 'morning'} onClick={() => set('window', 'morning')}>{t('windowMorning')}</button><button type="button" aria-pressed={f.window === 'afternoon'} onClick={() => set('window', 'afternoon')}>{t('windowAfternoon')}</button></div></div>
        </div>
        <label className="check-opt" style={{ marginTop: 10, display: 'inline-flex' }}><input type="checkbox" checked={f.flexible} onChange={(e) => set('flexible', e.target.checked)} />{t('flexible')}</label>
      </div>

      <div className="field"><label htmlFor="mv-notes">{t('notes')}</label><textarea id="mv-notes" className="input" rows={4} maxLength={2000} value={f.notes} onChange={(e) => set('notes', e.target.value)} /><span className="hint">{t('notesHint')}</span></div>

      <div>
        <h3 className="sec-t">{t('contact')}</h3>
        <div className="frow">
          <div className="field"><label htmlFor="mv-name">{t('name')}</label><input id="mv-name" className="input" autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="mv-phone">{t('phone')}</label><input id="mv-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="field"><label htmlFor="mv-email">{t('email')}</label><input id="mv-email" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        </div>
      </div>

      <label className="consent-row"><input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} /><span>{t('consent')}{cfg.privacy_url && <> · <a className="link" href={cfg.privacy_url} target="_blank" rel="noopener">{t('privacyLink')}</a></>}</span></label>

      {errText && <p className="err" role="alert">{errText}</p>}
      <button className="btn block" type="submit" disabled={busy}>{busy ? t('submitting') : t('submit')}</button>
    </form>
    </div>
  );
}
