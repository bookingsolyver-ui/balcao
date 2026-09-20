import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { ItemsManager } from '@/components/ItemsManager';
import { ConfigMissing } from '@/components/ConfigMissing';
import { getSession } from '@/lib/session';
import type { Category, Item, Membership } from '@/lib/types';

export default async function ManageItems({ params, searchParams }: { params: Promise<{ locale: string; module: string }>; searchParams: Promise<{ t?: string }> }) {
  const { locale, module: mod } = await params;
  const { t: wanted } = await searchParams;
  setRequestLocale(locale);
  if (mod !== 'menu' && mod !== 'catalog') notFound();
  const s = await getSession();
  if (!s.configured) return <ConfigMissing />;
  if (!s.user) redirect({ href: '/login', locale });
  const t = await getTranslations('items');

  const { data } = await s.supabase!.from('tenant_members').select('role, tenants(*)').eq('user_id', s.user!.id);
  const memberships = ((data ?? []) as unknown as Membership[]).filter((m) => m.tenants);
  if (memberships.length === 0) redirect({ href: '/app/onboarding', locale });
  const current = memberships.find((m) => m.tenants.slug === wanted) ?? memberships[0];
  const tenant = current.tenants;
  if (!tenant.modules[mod]) redirect({ href: `/app?t=${tenant.slug}`, locale });

  const [cats, items] = await Promise.all([
    s.supabase!.from('categories').select('*').eq('tenant_id', tenant.id).eq('module', mod).order('position').order('name'),
    s.supabase!.from('items').select('*').eq('tenant_id', tenant.id).eq('module', mod).order('position').order('name'),
  ]);
  const low = Number((tenant.settings as { catalog?: { low_stock?: number } })?.catalog?.low_stock ?? 3);

  return (
    <>
      <SiteHeader signedIn />
      <main className="wrap" style={{ padding: 'clamp(24px, 5vw, 56px) 0 80px', maxWidth: 860 }}>
        <Link className="link small" href={`/app?t=${tenant.slug}`}>← {t('back')}</Link>
        <h1 className="page-title" style={{ marginTop: 10 }}>{t(`title.${mod}`)}</h1>
        <p className="muted" style={{ margin: '6px 0 26px' }}>{tenant.name}</p>
        <ItemsManager
          tenant={{ id: tenant.id, currency: tenant.currency, decimals: tenant.currency_decimals, country: tenant.country, lowStock: low }}
          module={mod}
          initialCategories={(cats.data ?? []) as Category[]}
          initialItems={(items.data ?? []) as Item[]}
          canEdit={current.role === 'owner' || current.role === 'admin'}
        />
      </main>
    </>
  );
}
