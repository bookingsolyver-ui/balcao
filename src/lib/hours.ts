export interface HourRow { weekday: number; is_open: boolean; opens: string; closes: string }
export interface OpenStatus {
  open: boolean;
  closesAt?: string;                                  // "19:00" quando aberto
  next?: { dayOffset: number; weekday: number; opens: string }; // próxima abertura quando fechado
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const hhmm = (t: string) => t.slice(0, 5);
const mins = (t: string) => { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m; };

/** Estado de abertura calculado no fuso horário do negócio (não no do visitante). */
export function openStatus(rows: HourRow[], timezone: string, now: Date = new Date()): OpenStatus {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const weekday = WD[get('weekday')] ?? 0;
  const t = Number(get('hour')) * 60 + Number(get('minute'));
  const byDay = new Map(rows.map((r) => [r.weekday, r]));

  const today = byDay.get(weekday);
  if (today?.is_open && t >= mins(today.opens) && t < mins(today.closes)) return { open: true, closesAt: hhmm(today.closes) };

  for (let i = 0; i < 8; i++) {
    const d = (weekday + i) % 7, r = byDay.get(d);
    if (!r?.is_open) continue;
    if (i === 0 && t >= mins(r.opens)) continue; // hoje já passou a hora de abrir e fechou
    return { open: false, next: { dayOffset: i, weekday: d, opens: hhmm(r.opens) } };
  }
  return { open: false };
}
