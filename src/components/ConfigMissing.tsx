import { getTranslations } from 'next-intl/server';

export async function ConfigMissing() {
  const t = await getTranslations('errors');
  return (
    <main className="wrap" style={{ padding: '64px 0' }}>
      <div className="card"><h1 className="h2">{t('configTitle')}</h1><p className="muted" style={{ marginTop: 10 }}>{t('configText')}</p></div>
    </main>
  );
}
