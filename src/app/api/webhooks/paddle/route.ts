import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingUpdateFromEvent, verifyPaddleSignature, type PaddleEvent } from '@/lib/billing';

export const runtime = 'nodejs'; // precisa do módulo "crypto" do Node

/**
 * Recetor de eventos do Paddle. É o Paddle quem chama isto — nunca o browser.
 * O corpo TEM de ser lido em bruto (raw) antes de qualquer parsing, porque a
 * assinatura é calculada sobre o texto exato recebido, não sobre o JSON reconstruído.
 */
export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const raw = await req.text();
  const v = verifyPaddleSignature(raw, req.headers.get('paddle-signature'), secret);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });

  let event: PaddleEvent;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const update = billingUpdateFromEvent(event);
  if (!update) return NextResponse.json({ ok: true, ignored: true }); // evento que não nos interessa: confirmamos na mesma (200), para o Paddle não repetir

  const { tenant_id, ...fields } = update;
  const { error } = await createAdminClient().from('tenant_billing').update(fields).eq('tenant_id', tenant_id);
  if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
