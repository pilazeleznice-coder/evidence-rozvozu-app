import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const required = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing ${key}`); return value; };
const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const titles: Record<string, string> = {
 day_before: 'Zítra tě čeká rozvoz', morning: 'Dnes tě čeká rozvoz', hour_before: 'Za hodinu je naplánovaný rozvoz',
 late_5: 'Nezapomněl jsi na rozvoz? · 5 minut', late_10: 'Nezapomněl jsi na rozvoz? · 10 minut', late_15: 'Nezapomněl jsi na rozvoz? · 15 minut'
};
const dateFormat = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const moneyFormat = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 });
// Reject arbitrary endpoints: subscriptions must not turn the privileged worker into an SSRF proxy.
function validateSubscription(subscription: any) {
 const u = new URL(subscription.endpoint);
 const host = u.hostname.toLowerCase();
 if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') ||
  !(host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com') || host.endsWith('.push.apple.com'))) throw new Error('Unsupported push endpoint');
 if (!/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys?.p256dh || '') || !/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys?.auth || '')) throw new Error('Invalid push keys');
}
async function updateJob(id: number, changes: Record<string, unknown>) {
 const { error } = await db.from('pz_push_jobs').update(changes).eq('id', id).eq('state', 'sending');
 if (error) throw error;
}
Deno.serve(async request => {
 if (request.method !== 'POST') return new Response('Unauthorized', {status:401});
 try {
  const {data: config, error: configError} = await db.rpc('pz_push_runtime_config');
  if (configError || !config?.pz_push_cron_secret) throw new Error('Missing configuration');
  if (request.headers.get('x-pz-cron-secret') !== config.pz_push_cron_secret) return new Response('Unauthorized',{status:401});
  webpush.setVapidDetails(config.pz_push_vapid_subject, config.pz_push_vapid_public, config.pz_push_vapid_private);
  const appUrl = new URL(config.pz_push_app_url);
  if (appUrl.protocol !== 'https:') throw new Error('Invalid app URL');
  const { data: jobs, error } = await db.rpc('pz_claim_push');
  if (error) throw error;
  let sent = 0, failed = 0;
  // Small concurrent batch stays within Edge Function wall-clock limits.
  for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map(async (job: any) => {
   try {
    validateSubscription(job.subscription);
    // Recheck immediately before sending: START/cancellation may have removed this claimed job.
    const { data: live, error: checkError } = await db.from('pz_push_jobs').select('id').eq('id', job.job_id).eq('state', 'sending').maybeSingle();
    if (checkError) throw checkError;
    if (!live) return;
    const url = new URL(appUrl); url.searchParams.set('pushRide', job.ride_id);
    const payload = JSON.stringify({
     title: titles[job.kind] || 'Připomínka rozvozu',
     body: `${job.name}\nDoprava: ${job.vehicle} · ${dateFormat.format(new Date(job.delivery_at))}\n${job.address}\nČástka bez DPH: ${moneyFormat.format(Number(job.net))}`,
     tag: `ride-${job.ride_id}-${job.kind}-${job.due_at}`, rideId: job.ride_id, kind: job.kind,
     expiresAt: Date.parse(job.due_at) + 5 * 60000, url: url.href
    });
    const ttl = Math.max(0, Math.min(300, Math.floor((Date.parse(job.due_at) + 300000 - Date.now()) / 1000)));
    await webpush.sendNotification(job.subscription, payload, { TTL: ttl, urgency: 'high', timeout: 10000 });
    await updateJob(job.job_id, { state: 'sent', sent_at: new Date().toISOString(), lease_until: null, last_error: null }); sent++;
   } catch (error: any) {
    failed++;
    if (error.statusCode === 404 || error.statusCode === 410) {
     const { error: removalError } = await db.from('pz_push_subscriptions').delete().eq('id', job.subscription_id);
     if (removalError) throw removalError;
    } else {
     // No endpoint, customer details, credentials or payloads in logs/errors.
     const retryable = error.statusCode === 429 || error.statusCode >= 500 || !error.statusCode;
     await updateJob(job.job_id, { state: retryable ? 'sending' : 'failed', lease_until: new Date(Date.now() + 60000).toISOString(), last_error: error.statusCode ? `HTTP ${error.statusCode}` : 'Push send failed' });
    }
   }
  }));
  return Response.json({ claimed: jobs.length, sent, failed });
 } catch { return Response.json({ error: 'Dispatch failed' }, { status: 500 }); }
});
