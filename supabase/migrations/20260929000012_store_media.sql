-- Logo e foto de capa reais da loja pública — em vez do avatar de letra genérico de hoje.
-- Reaproveita o bucket "item-images" já existente (mesmas políticas: owner/admin escrevem, público lê).

alter table public.tenants add column if not exists logo_path text;
alter table public.tenants add column if not exists cover_path text;

grant update (name, niche, currency, currency_decimals, locale, timezone, country, whatsapp, address, accent, modules, settings, is_published, slug, logo_path, cover_path)
  on public.tenants to authenticated;
