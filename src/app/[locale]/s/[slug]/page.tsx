import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ConfigMissing } from '@/components/ConfigMissing';
import { Icon } from '@/components/Icon';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { getSession } from '@/lib/session';
import { isValidSlug } from '@/lib/slug';
import { formatMoney, moneyLocale } from '@/lib/money';
import { waLink } from '@/lib/phone';
import { imageUrl } from '@/lib/storage';
import { openStatus, type HourRow } from '@/lib/hours';
import { MODULE_IDS, type Category, type Item, type LoyaltyProgram, type ModuleId, type Service, type Tenant } from '@/lib/types';

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const dayName = (d: number, locale: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d)));
const hm = (t: string) => t.slice(0, 5);

export default async function Store({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, slug } = await params;
  const { tab } = await searchParams;
  setRequestLocale(locale);
  if (!isValidSlug(slug)) notFound();
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  const t = await getTranslations('store');
  const td = await getTranslations('dashboard');

  const sb = s.supabase!;
  const { data: tenantRow } = await sb.from('tenants').select('*').eq('slug', slug).maybeSingle();
  if (!tenantRow) notFound();
  const tenant = tenantRow as Tenant;

  const [cats, items, services, hours, loyalty] = await Promise.all([
    sb.from('categories').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
    sb.from('items').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
    sb.from('services').select('*').eq('tenant_id', tenant.id).eq('active', true).order('position').order('name'),
    sb.from('business_hours').select('weekday,is_open,opens,closes').eq('tenant_id', tenant.id).order('weekday'),
    sb.from('loyalty_programs').select('*').eq('tenant_id', tenant.id).maybeSingle(),
  ]);
  const categories = (cats.data ?? []) as Category[];
  const allItems = (items.data ?? []) as Item[];
  const hourRows = (hours.data ?? []) as HourRow[];
  const program = loyalty.data as LoyaltyProgram | null;
  const lowStock = Number((tenant.settings as { catalog?: { low_stock?: number } })?.catalog?.low_stock ?? 3);

  const tabs = MODULE_IDS.filter((m) => tenant.modules[m]);
  const active: ModuleId | undefined = tabs.find((m) => m === tab) ?? tabs[0];
  const st = openStatus(hourRows, tenant.timezone);
  let statusText = '';
  if (st.open) statusText = `${t('open')} ${t('closesAt', { time: st.closesAt ?? '' })}`;
  else if (st.next) {
    const time = st.next.opens;
    statusText = st.next.dayOffset === 0 ? t('opensToday', { time }) : st.next.dayOffset === 1 ? t('opensTomorrow', { time }) : t('opensOn', { day: dayName(st.next.weekday, locale), time });
  } else statusText = t('closed');

  const money = (n: number) => formatMoney(n, tenant.currency, moneyLocale(locale, tenant.country), tenant.currency_decimals);
  const price = (i: Item) => (i.promo_minor != null && i.promo_minor < i.price_minor)
    ? <span className="price"><s>{money(i.price_minor)}</s>{money(i.promo_minor)}</span> : <span className="price">{money(i.price_minor)}</span>;

  const renderItems = (mod: 'menu' | 'catalog') => {
    const list = allItems.filter((i) => i.module === mod);
    if (list.length === 0) return <div className="card muted">{t('empty')}</div>;
    const groups = categories.filter((c) => c.module === mod).map((c) => ({ c, l: list.filter((i) => i.category_id === c.id) }));
    const orphan = list.filter((i) => !categories.some((c) => c.id === i.category_id));
    if (orphan.length) groups.push({ c: { id: 'x', module: mod, name: '', position: 999 }, l: orphan });
    return groups.filter((g) => g.l.length).map((g) => (
      <section key={g.c.id} style={{ marginBottom: 28 }}>
        {g.c.name && <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 10px' }}>{g.c.name}</h3>}
        <div className="list">
          {g.l.map((i) => {
            const out = !i.active || i.stock === 0;
            return (
              <div className="row" key={i.id} style={{ opacity: out ? .55 : 1, alignItems: 'flex-start' }}>
                <span className="th" style={{ ['--h' as string]: hue(i.name) }}>{i.image_path ? <img src={imageUrl(i.image_path)} alt="" loading="lazy" /> : (i.emoji ?? '•')}</span>
                <div className="g"><strong>{i.name}</strong>{i.description && <small style={{ whiteSpace: 'normal' }}>{i.description}</small>}<div style={{ marginTop: 4 }}>{price(i)}</div></div>
                {out ? <span className="badge">{i.stock === 0 ? t('soldOut') : t('unavailable')}</span>
                  : mod === 'catalog' && i.stock != null && i.stock <= lowStock ? <span className="badge warn">{t('lastUnits', { n: i.stock })}</span> : null}
              </div>
            );
          })}
        </div>
      </section>
    ));
  };

  return (
    <div data-accent={tenant.accent} style={{ minHeight: '100vh' }}>
      <header className="nav"><div className="nav-in"><span className="brand"><span className="logo" aria-hidden="true">{tenant.name.charAt(0).toUpperCase()}</span>{tenant.name}</span><span className="spacer" /><LocaleSwitcher /></div></header>
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 48px) 0 56px', maxWidth: 760 }}>
        <h1 className="page-title">{tenant.name}</h1>
        <p className="muted small" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`dot ${st.open ? '' : 'bad'}`} aria-hidden="true" />{statusText}{tenant.address ? <> · {tenant.address}</> : null}
        </p>

        {tenant.whatsapp && (
          <p style={{ marginTop: 18 }}>
            <a className="btn wa" target="_blank" rel="noopener" href={waLink(tenant.whatsapp, t('whatsappMsg', { name: tenant.name }))}><Icon name="wa" size={18} /> {t('whatsappCta')}</a>
          </p>
        )}

        {tabs.length > 1 && (
          <nav className="tabs" style={{ margin: '28px 0 22px' }}>
            {tabs.map((m) => <Link key={m} href={`/s/${slug}?tab=${m}`} aria-current={m === active ? 'page' : undefined}>{t(`tabs.${m}` as never)}</Link>)}
          </nav>
        )}
        {tabs.length <= 1 && <div style={{ height: 24 }} />}

        {(active === 'menu' || active === 'catalog') && renderItems(active)}

        {active === 'agenda' && ((services.data as Service[] | null)?.length ? (
          <div className="list">
            {(services.data as Service[]).map((sv) => (
              <div className="row" key={sv.id}><div className="g"><strong>{sv.name}</strong><small style={{ whiteSpace: 'normal' }}>{t('minutes', { n: sv.duration_min })}{sv.description ? ` · ${sv.description}` : ''}</small></div>
                <span className="price">{sv.price_minor ? money(sv.price_minor) : t('free')}</span></div>
            ))}
          </div>
        ) : <div className="card muted">{t('empty')}</div>)}

        {active === 'loyalty' && (program ? (
          <div className="pass">
            <b style={{ fontSize: 18, position: 'relative' }}>{tenant.name}</b>
            <p style={{ marginTop: 14, fontSize: 20, lineHeight: 1.3, position: 'relative' }}>
              {program.mode === 'stamps'
                ? t('loyaltyStamps', { goal: program.goal, reward: program.reward })
                : t('loyaltyPoints', { goal: program.goal, reward: program.reward, currency: tenant.currency, rate: Number(program.points_per_unit) })}
            </p>
          </div>
        ) : <div className="card muted">{t('empty')}</div>)}

        {tabs.length === 0 && <div className="card muted">{td('noBusiness')}</div>}
        <p className="muted small" style={{ marginTop: 26 }}>{t('orderSoon')}</p>

        {hourRows.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.025em', marginBottom: 10 }}>{t('hours')}</h3>
            <div className="list">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const r = hourRows.find((h) => h.weekday === d);
                return <div className="row" key={d} style={{ minHeight: 44, padding: '8px 18px' }}><div className="g"><strong style={{ fontWeight: 500, textTransform: 'capitalize' }}>{dayName(d, locale)}</strong></div>
                  <span className="muted tnum">{r?.is_open ? `${hm(r.opens)} – ${hm(r.closes)}` : t('closed')}</span></div>;
              })}
            </div>
          </section>
        )}
        <p className="muted small" style={{ marginTop: 32, textAlign: 'center' }}>{t('poweredBy')}</p>
      </main>
    </div>
  );
}
