import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { OrdersBoard, type BoardOrder } from '@/components/OrdersBoard';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import { moneyLocale } from '@/lib/money';
import type { Membership, OrderItemRow, OrderRow } from '@/lib/types';

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('orders');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const tenant = (memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0]).tenants;
  if (!tenant.modules.menu && !tenant.modules.catalog) redirect({ href: `/app?t=${tenant.slug}`, locale });

  const { data: rows } = await s.supabase!.from('orders').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(150);
  const orders = (rows ?? []) as OrderRow[];
  let items: OrderItemRow[] = [];
  if (orders.length) {
    const r = await s.supabase!.from('order_items').select('*').in('order_id', orders.map((o) => o.id));
    items = (r.data ?? []) as OrderItemRow[];
  }
  const initial: BoardOrder[] = orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px' }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t('title')}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <OrdersBoard
          tenant={{ id: tenant.id, name: tenant.name, currency: tenant.currency, decimals: tenant.currency_decimals, moneyLocale: moneyLocale(locale, tenant.country), timezone: tenant.timezone }}
          initialOrders={initial}
        />
      </main>
    </>
  );
}
