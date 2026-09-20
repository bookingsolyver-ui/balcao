export const RESERVED_SLUGS = ['admin', 'api', 'app', 'www', 's', 'login', 'signup', 'dashboard', 'static', 'settings'];
/** Igual à regra da base de dados (tabela tenants, coluna slug). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.includes(slug) && !slug.includes('--');
}
