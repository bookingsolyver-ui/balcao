import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import '../globals.css';

// Uma só família (Plus Jakarta Sans), com pesos diferentes para títulos e corpo — no espírito da tryinteract.com.
// Cobre bem os diacríticos de pt-PT/pt-BR/es (latin-ext).
const display = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], weight: ['600', '700', '800'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const body = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return { title: 'Balcão', description: t('text') };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
