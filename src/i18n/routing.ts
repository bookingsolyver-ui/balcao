import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pt-PT', 'pt-BR', 'en', 'es'],
  defaultLocale: 'pt-PT',
  localePrefix: 'always',
});
export type Locale = (typeof routing.locales)[number];
