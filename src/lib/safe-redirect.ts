/** Só aceita caminhos internos ("/algo") — nunca "//evil.com" nem um caminho com barra invertida,
 *  para nunca se tornar um redirecionamento aberto para outro site. Usado no callback de e-mail e no returnTo do login/registo. */
export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  const v = (raw ?? '').trim();
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : fallback;
}
