(function() {
 'use strict';
 const cfg = window.PZ_PUSH_CONFIG || {}, ready = !!(cfg.supabaseUrl && cfg.publicKey && cfg.vapidPublicKey);
 const SESSION = 'pzPushSession', DEVICE = 'pzPushDevice', BASE = 'pzPushBaseline';
 let session = read(SESSION), device = localStorage.getItem(DEVICE), busy = false, timer, registration;
 if (!device) { device = crypto.randomUUID(); localStorage.setItem(DEVICE, device); }
 const $ = id => document.getElementById(id);
 const authRoot = String(cfg.supabaseUrl || '').replace(/\/$/,'');
 function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
 function status(text, error = false) { if ($('pzPushStatus')) { $('pzPushStatus').textContent = text; $('pzPushStatus').style.color = error ? '#a12e2e' : ''; } }
 async function http(path, body, method = 'POST', token = '') {
  const response = await fetch(authRoot + path, { method, headers: { apikey: cfg.publicKey, 'Content-Type': 'application/json', ...(path.startsWith('/rest/v1/pz_push_subscriptions') && method === 'POST' ? {Prefer:'resolution=merge-duplicates,return=minimal'} : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
   if (response.status === 401 || response.status === 403) { const error = Error('Přihlášení vypršelo nebo není povolené. Přihlas se znovu.'); error.status=response.status; throw error; }
   if (path.includes('/auth/')) throw Error('Přihlášení se nezdařilo. Zkontroluj e-mail a heslo.');
   throw Error('Služba upozornění není dostupná. Změny čekají na odeslání.');
  }
  const text = await response.text(); return text ? JSON.parse(text) : null;
 }
 let refreshing;
 async function token() {
  if (!session) throw Error('Nejdřív připoj oznámení.');
  if (session.expires_at < Date.now()/1000 + 90) {
   if (!refreshing) refreshing = http('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }).then(x => {
    session = { access_token: x.access_token, refresh_token: x.refresh_token, expires_at: Date.now()/1000 + x.expires_in, userId: x.user.id, subscribed: session.subscribed };
    localStorage.setItem(SESSION, JSON.stringify(session));
   }).catch(error => { if(error.status===401 || error.status===403) {session=null;localStorage.removeItem(SESSION);paint();} throw error; }).finally(() => { refreshing = null; });
   await refreshing;
  }
  return session.access_token;
 }
 function snapshot() {
  const rides = read('evidenceRozvozu_v4') || [];
  const active = ['evidenceRozvozu_activeRun_v24','evidenceRozvozu_mergedActive_v51'].map(read).filter(Boolean).map(x => x.rideId);
  return window.PZPushModel.records(rides, active);
 }
 function key() { return BASE + ':' + authRoot + ':' + session.userId; }
 async function sync(force = false) {
  if (!ready || !session?.subscribed || busy) return;
  const baselineKey=key(), syncingUser=session.userId;
  const current = snapshot(), previous = read(baselineKey) || [];
  const d = window.PZPushModel.delta(current, previous);
  if (!force && !d.changes.length && !d.removed.length) return;
  let successful = false; busy = true; status(navigator.onLine ? 'Odesílám změny připomínek…' : 'Bez internetu · změny čekají na odeslání');
  try {
   const access = await token();
   const count = await http('/rest/v1/rpc/pz_sync_push', { changes: d.changes, removed: d.removed }, 'POST', access);
   if (session?.userId !== syncingUser) return;
   localStorage.setItem(baselineKey, JSON.stringify(current)); successful = true;
   status(`Připojeno · ${count} jízd s připomínkami · ${new Date().toLocaleTimeString('cs-CZ', {hour:'2-digit',minute:'2-digit'})}`);
  } catch (e) { status(e.message || 'Změny čekají na odeslání.', true); }
  finally { busy = false; if (successful && JSON.stringify(snapshot()) !== JSON.stringify(current)) schedule(); }
 }
 function schedule() { clearTimeout(timer); timer = setTimeout(() => sync(), 400); }
 const originalSet = Storage.prototype.setItem, originalRemove = Storage.prototype.removeItem;
 // Includes edits, timeline moves, merge/split, START, cancellation and backup restore.
 Storage.prototype.setItem = function(k, v) { originalSet.call(this, k, v); if (this === localStorage && /^(evidenceRozvozu_v4|evidenceRozvozu_activeRun_v24|evidenceRozvozu_mergedActive_v51)$/.test(k)) schedule(); };
 Storage.prototype.removeItem = function(k) { originalRemove.call(this,k); if (this === localStorage && /^(evidenceRozvozu_v4|evidenceRozvozu_activeRun_v24|evidenceRozvozu_mergedActive_v51)$/.test(k)) schedule(); };
 function publicBytes(value) { const raw = atob(value.replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
 async function worker() {
  if (!registration) registration = await navigator.serviceWorker.register('./sw.js', {scope:'./'});
  await navigator.serviceWorker.ready; return registration;
 }
 async function enable() {
  const button = $('pzPushEnable'); button.disabled = true;
  try {
   if (!ready) throw Error('Odesílací služba zatím není aktivovaná.');
   if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw Error('Tento prohlížeč nepodporuje systémová oznámení. Otevři HTTPS aplikaci v Chrome nebo Edge.');
   // Permission request is triggered directly by this button, before any await of network work.
   const permission = await Notification.requestPermission();
   if (permission !== 'granted') throw Error('Oznámení nejsou povolená. Povol je v nastavení prohlížeče.');
   if (!session) {
    const email = $('pzPushEmail').value.trim(), password = $('pzPushPassword').value;
    if (!email || !password) throw Error('Vyplň přihlášení k účtu Evidence.');
    const x = await http('/auth/v1/token?grant_type=password', {email,password});
    session = {access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Date.now()/1000+x.expires_in,userId:x.user.id,subscribed:false};
    $('pzPushPassword').value = ''; localStorage.setItem(SESSION, JSON.stringify(session));
   }
   const reg = await worker(), access = await token();
   let subscription = await reg.pushManager.getSubscription();
   if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:publicBytes(cfg.vapidPublicKey) });
   await http('/rest/v1/pz_push_subscriptions?on_conflict=user_id,device_id', { user_id:session.userId,device_id:device,subscription:subscription.toJSON(),updated_at:new Date().toISOString() }, 'POST', access);
   session.subscribed = true; localStorage.setItem(SESSION,JSON.stringify(session));
   // Keep the baseline: repeated enable must not overwrite newer changes made on another device.
   paint(); await sync(true);
  } catch(e) { status(e.message || 'Oznámení se nepodařilo připojit.',true); }
  finally { button.disabled = false; }
 }
 async function disable() {
  const button = $('pzPushDisable'); button.disabled = true;
  try {
   if (session) {
    await http(`/rest/v1/pz_push_subscriptions?user_id=eq.${encodeURIComponent(session.userId)}&device_id=eq.${device}`, undefined, 'DELETE', await token());
    const sub = await (await worker()).pushManager.getSubscription(); await sub?.unsubscribe();
   }
   session = null; localStorage.removeItem(SESSION); paint(); status('Oznámení jsou na tomto zařízení vypnutá.');
  } catch(e) { status('Odpojení se nezdařilo. Zkus to znovu s připojením k internetu.',true); }
  finally { button.disabled = false; }
 }
 async function test() {
  try {
   if (!session?.subscribed) throw Error('Nejdřív připoj oznámení.');
   await (await worker()).showNotification('Evidence rozvozů – zkouška', { body:'Test zobrazení oznámení na tomto zařízení. Doručení při zavřené aplikaci ověříme samostatnou testovací jízdou.',tag:'pz-test',data:{url:new URL('./',location.href).href} });
   status('Test zobrazen. Toto ověřuje zobrazení, nikoli serverové doručení.');
  } catch(e) { status(e.message,true); }
 }
 function paint() {
  $('pzPushLogin').hidden = !!session;
  $('pzPushEnable').textContent = session?.subscribed ? 'Znovu připojit oznámení' : 'Připojit oznámení';
  $('pzPushDisable').hidden = !session;
  $('pzPushTest').hidden = !session?.subscribed;
  $('pzPushEnable').disabled = !ready;
 }
 function openRide(id) {
  let rides; try { rides = window.rides || window.eval('rides'); } catch { rides = read('evidenceRozvozu_v4') || []; }
  const ride = rides.find(r => String(r.id) === String(id));
  if (ride && typeof window.showInfo === 'function') { $('v80Settings')?.classList.remove('open'); document.body.style.overflow=''; window.showInfo(ride.mergedParentId || ride.id); }
  else if(typeof window.v52Alert==='function') window.v52Alert('Tato jízda na tomto zařízení není dostupná. Otevři Evidenci, ve které byla zadána.');
 }
 function install() {
  const groups = document.querySelector('#v80SettingsHome .v80-groups'); if (!groups) return;
  const section = document.createElement('section'); section.innerHTML = `<h3 class="v80-group-title">Upozornění na jízdy</h3><div class="v80-card pz-push-card">
  <h3>Systémová oznámení</h3><p>Každá jízda zvlášť: 24 hodin předem, v 7:00 v den jízdy, hodinu předem a 5, 10 a 15 minut po čase doručení. START, splnění nebo zrušení další připomínky zastaví. Všechny časy jsou české.</p>
  <p>V oznámení: jméno, typ dopravy, adresa a částka bez DPH. Údaje se mohou zobrazit na zamčené obrazovce.</p>
  <div id="pzPushLogin"><label>E-mail účtu Evidence<input id="pzPushEmail" type="email" autocomplete="username"></label><label>Heslo<input id="pzPushPassword" type="password" autocomplete="current-password"></label></div>
  <p id="pzPushStatus" role="status" aria-live="polite"></p><div class="pz-push-buttons"><button id="pzPushEnable" type="button" class="v80-primary">Připojit oznámení</button><button id="pzPushTest" type="button">Zkusit oznámení</button><button id="pzPushDisable" type="button">Odpojit zařízení</button></div>
  <small>Jednorázově připoj každé zařízení. Potom se připomínky přenášejí automaticky při ukládání jízd. Změny bez internetu čekají na znovuotevření Evidence s připojením. U ranních jízd před 7:00 se ranní připomínka neposílá.</small></div>`;
  groups.prepend(section); $('pzPushEnable').onclick=enable; $('pzPushDisable').onclick=disable; $('pzPushTest').onclick=test; paint();
  status(!ready ? 'Zatím neaktivní · čeká na připojení odesílací služby' : session?.subscribed ? 'Kontroluji připomínky…' : 'Připoj toto zařízení k oznámením.');
  if (ready && session?.subscribed) reconcile();
  const id = new URL(location.href).searchParams.get('pushRide'); if (id) { setTimeout(()=>openRide(id),500); const u=new URL(location.href); u.searchParams.delete('pushRide'); history.replaceState(null,'',u); }
 }
 async function reconcile() {
  try {
   const sub = await (await worker()).pushManager.getSubscription();
   if (!sub || Notification.permission !== 'granted') { status('Oznámení nejsou na zařízení připojená. Použij Znovu připojit oznámení.',true); return; }
   await http('/rest/v1/pz_push_subscriptions?on_conflict=user_id,device_id', {user_id:session.userId,device_id:device,subscription:sub.toJSON(),updated_at:new Date().toISOString()}, 'POST', await token());
   await sync(true);
  } catch(e) { status(e.message || 'Oznámení se nepodařilo zkontrolovat.',true); }
 }
 window.addEventListener('online',()=>sync(true));
 window.addEventListener('storage',event=>{ if (event.key===SESSION) {session=read(SESSION); paint();} schedule(); });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden) sync(true);});
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='PZ_OPEN_RIDE') openRide(e.data.rideId);});
 setInterval(()=>sync(),30000);
 if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
