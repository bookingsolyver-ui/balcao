'use client';
import { useRouter } from 'next/navigation';

/** Atualiza a página atual. Fora da aplicação Next (testes de ecrã) não faz nada em vez de rebentar. */
export function useRefresh(): () => void {
  try { const r = useRouter(); return () => r.refresh(); } catch { return () => undefined; }
}
