export const ITEM_BUCKET = 'item-images';

/** URL público de uma foto do bucket (o bucket é público para leitura; só owner/admin do negócio escrevem). */
export function imageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${ITEM_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
