// Delivers pending notifications by Expo push (Android + iOS via FCM/APNs) and Telegram.
// Called by the database only (pg_net after each insert, pg_cron every minute) with a shared secret.
import { admin, fail, json } from '../_shared/util.ts';
import { send } from '../_shared/telegram.ts';

type Pending = { id: string; title: string; body: string; url: string | null; chat_id: number | null; tokens: string[] | null };
type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function sendPush(list: { n: Pending; token: string }[]): Promise<Ticket[]> {
  const tickets: Ticket[] = [];
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map(({ n, token }) => ({
          to: token,
          title: n.title,
          body: n.body,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
          data: { id: n.id, url: n.url },
        }))),
      });
      const data = await res.json();
      tickets.push(...((data?.data as Ticket[]) ?? chunk.map(() => ({ status: 'error' as const, message: JSON.stringify(data?.errors ?? res.status) }))));
    } catch (e) {
      tickets.push(...chunk.map(() => ({ status: 'error' as const, message: String(e) })));
    }
  }
  return tickets;
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-dispatch-secret') ?? '';
  const { data: ok } = await admin.rpc('dispatch_secret_ok', { p_secret: secret });
  if (!ok) return fail('forbidden', 403);

  let total = 0;
  // Drain in batches; each claim marks rows dispatched so parallel runs never double-send.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc('claim_notifications', { p_limit: 100 });
    if (error) return fail('claim_failed', 500, { detail: error.message });
    const pending = (data ?? []) as Pending[];
    if (!pending.length) break;
    total += pending.length;

    const pushList = pending.flatMap((n) => (n.tokens ?? []).map((token) => ({ n, token })));
    const [tickets, tgResults] = await Promise.all([
      sendPush(pushList),
      Promise.all(pending.map(async (n) => {
        if (!n.chat_id) return 'no_link';
        const r = await send(n.chat_id, `<b>${esc(n.title)}</b>\n${esc(n.body)}`);
        return r ? 'sent' : 'failed';
      })),
    ]);

    // Forget devices that uninstalled the app or revoked permission.
    const dead = pushList.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered').map((p) => p.token);
    if (dead.length) await admin.from('push_tokens').delete().in('expo_token', dead);

    await Promise.all(pending.map((n, i) => {
      const mine = pushList.map((p, j) => (p.n.id === n.id ? tickets[j] : null)).filter(Boolean) as Ticket[];
      const push = !mine.length ? 'no_device' : mine.some((t) => t.status === 'ok') ? 'sent' : `failed: ${mine[0].details?.error ?? mine[0].message ?? ''}`.slice(0, 200);
      return admin.from('notifications').update({ push_result: push, tg_result: tgResults[i] }).eq('id', n.id);
    }));
  }
  return json({ delivered: total });
});
