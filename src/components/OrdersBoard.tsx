'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { waLink } from '@/lib/phone';
import { columnOf, isActive, nextStatus, waStatusKey } from '@/lib/order';
import type { OrderItemRow, OrderRow } from '@/lib/types';

export interface BoardOrder extends OrderRow { items: OrderItemRow[] }
interface Props {
  tenant: { id: string; name: string; currency: string; decimals: number; moneyLocale: string; timezone: string };
  initialOrders: BoardOrder[];
}

/** Junta as linhas dos pedidos (duas consultas simples; evita depender de relações embutidas). */
export async function fetchOrders(tenantId: string): Promise<BoardOrder[]> {
  const sb = createClient();
  const { data: orders } = await sb.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(150);
  const rows = (orders ?? []) as OrderRow[];
  if (rows.length === 0) return [];
  const { data: items } = await sb.from('order_items').select('*').in('order_id', rows.map((o) => o.id));
  const by = new Map<string, OrderItemRow[]>();
  ((items ?? []) as OrderItemRow[]).forEach((i) => by.set(i.order_id, [...(by.get(i.order_id) ?? []), i]));
  return rows.map((o) => ({ ...o, items: by.get(o.id) ?? [] }));
}

export function OrdersBoard({ tenant, initialOrders }: Props) {
  const t = useTranslations('orders');
  const to = useTranslations('order');
  const locale = useLocale();
  const tDyn = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const toDyn = to as unknown as (key: string) => string;
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState<'queue' | 'history'>('queue');
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const known = useRef(new Set(initialOrders.map((o) => o.id)));
  const money = (n: number) => formatMoney(n, tenant.currency, tenant.moneyLocale, tenant.decimals);
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: tenant.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const reload = useCallback(async () => {
    const next = await fetchOrders(tenant.id);
    const fresh = next.filter((o) => !known.current.has(o.id) && o.status === 'new');
    next.forEach((o) => known.current.add(o.id));
    if (fresh.length) { setNotice(tDyn('newOrderToast', { number: fresh[0].number })); setTimeout(() => setNotice(null), 5000); }
    setOrders(next);
  }, [tenant.id, tDyn]);

  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`orders:${tenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenant.id}` }, () => { void reload(); })
      .subscribe((s) => setLive(s === 'SUBSCRIBED'));
    const poll = setInterval(() => { void reload(); }, 15000); // reserva se o Realtime cair
    const vis = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', vis);
    return () => { sb.removeChannel(ch); clearInterval(poll); document.removeEventListener('visibilitychange', vis); };
  }, [tenant.id, reload]);

  const active = orders.filter((o) => isActive(o.status));
  const newCount = active.filter((o) => o.status === 'new').length;
  useEffect(() => {
    const base = tenant.name;
    document.title = newCount > 0 ? `(${newCount}) ${t('title')} · ${base}` : `${t('title')} · ${base}`;
  }, [newCount, tenant.name, t]);

  async function setStatus(o: BoardOrder, status: string) {
    setNotice(null);
    const { error } = await createClient().from('orders').update({ status }).eq('id', o.id);
    if (error) { setNotice(tDyn('updateError')); setTimeout(() => setNotice(null), 5000); }
    await reload();
  }
  const cancel = async (o: BoardOrder) => { if (window.confirm(tDyn('confirmCancel', { number: o.number }))) await setStatus(o, 'cancelled'); };
  const wa = (o: BoardOrder) => waLink(o.customer_phone, tDyn(`wa.${waStatusKey(o.status, o.fulfillment)}`, { name: o.customer_name.split(' ')[0], number: o.number, business: tenant.name }));

  const card = (o: BoardOrder) => {
    const nxt = nextStatus(o.module, o.status);
    return (
      <article className="oc" key={o.id}>
        <header>
          <strong>#{o.number}</strong>
          <span className="badge acc">{toDyn(`fulfillment.${o.fulfillment}`)}{o.table_label ? ` · ${tDyn('tableLabel', { table: o.table_label })}` : ''}</span>
          <span className="badge">{tDyn(`module.${o.module}`)}</span>
          <time dateTime={o.created_at}>{when(o.created_at)}</time>
        </header>
        <div className="who">{o.customer_name} · +{o.customer_phone}</div>
        <ul>{o.items.map((i) => <li key={i.id}><span>{i.qty}× {i.name}{i.note ? ` (${i.note})` : ''}</span><span>{money(i.unit_minor * i.qty)}</span></li>)}</ul>
        {o.address && <div className="meta">📍 {o.address}</div>}
        {o.note && <div className="note">{o.note}</div>}
        <div className="meta">{toDyn(`pay.${o.payment_method}`)}{o.cash_change_minor != null ? ` · ${tDyn('changeFor', { amount: money(o.cash_change_minor) })}` : ''}{o.fee_minor ? ` · ${to('fee')} ${money(o.fee_minor)}` : ''}</div>
        <footer>
          <b>{money(o.total_minor)}</b>
          <div className="acts">
            <a className="btn sm wa" target="_blank" rel="noopener" href={wa(o)} aria-label={`${tDyn('notify')} — ${o.customer_name}`}>WhatsApp</a>
            {isActive(o.status) ? (
              <>
                <button className="btn sm bad" onClick={() => cancel(o)}>{t('cancel')}</button>
                {nxt && <button className="btn sm" onClick={() => setStatus(o, nxt)}>{tDyn(`actions.${o.module}.${o.status}`)}</button>}
              </>
            ) : <span className={`badge ${o.status === 'cancelled' ? 'bad' : 'ok'}`}>{toDyn(`status.${o.status}`)}</span>}
          </div>
        </footer>
      </article>
    );
  };

  const cols = (['new', 'progress', 'ready'] as const).map((c) => ({ c, list: active.filter((o) => columnOf(o.status) === c).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
  const history = orders.filter((o) => !isActive(o.status)).slice(0, 60);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="group">
          <button aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>{t('queue')}{newCount ? ` (${newCount})` : ''}</button>
          <button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>{t('history')}</button>
        </div>
        <span className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{live && <i className="live" aria-hidden="true" />}{live ? t('live') : t('offline')}</span>
      </div>
      {tab === 'queue' ? (
        active.length === 0 ? <div className="card muted">{t('empty')}</div> : (
          <div className="board">
            {cols.map(({ c, list }) => (
              <div key={c}>
                <div className="col-t"><span>{tDyn(`columns.${c}`)}</span><span>{list.length}</span></div>
                <div className="col">{list.length ? list.map(card) : <div className="muted small" style={{ padding: '6px 4px' }}>{t('emptyColumn')}</div>}</div>
              </div>
            ))}
          </div>
        )
      ) : history.length === 0 ? <div className="card muted">{t('emptyHistory')}</div> : <div className="board">{history.map(card)}</div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </>
  );
}
