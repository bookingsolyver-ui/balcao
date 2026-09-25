export interface StaffOption { id: string; name: string }
export interface InviteForm { role: 'admin' | 'staff'; staffId: string | null }
export const emptyInviteForm = (): InviteForm => ({ role: 'staff', staffId: null });

/** Constrói o link a partilhar (por WhatsApp) a partir do código gerado pelo servidor. */
export function inviteUrl(origin: string, locale: string, code: string): string {
  return `${origin}/${locale}/convite/${code}`;
}
