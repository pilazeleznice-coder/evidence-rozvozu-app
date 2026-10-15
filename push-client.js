(function() {
 'use strict';
 const style=document.createElement('link');style.rel='stylesheet';style.href='./push-settings.css';document.head.append(style);
 const cfg = window.PZ_PUSH_CONFIG || {}, ready = !!(cfg.supabaseUrl && cfg.publicKey && cfg.vapidPublicKey);
 const DEFAULTS = {enabled:true,detail:false,address:false,price:false,payment:false,noTime:'skip',day_before:{enabled:true,minutes:1440},morning:{enabled:true,time:'07:00'},hour_before:{enabled:true,minutes:60},late_5:{enabled:true,minutes:5},late_10:{enabled:true,minutes:10},late_15:{enabled:true,minutes:15}};
 const native = !!window.PZAndroidNative?.postMessage;
 let nativeHealth={enabled:false,permission:false,exact:false,count:0,lastSync:0}, nativeSequence=0;
 const nativeRequests=new Map();
 if(native) window.PZAndroidNative.onmessage=event=>{
  let response;try{response=JSON.parse(event.data);}catch{return;}
  const request=nativeRequests.get(response.id);if(!request)return;
  clearTimeout(request.timeout);nativeRequests.delete(response.id);
  if(response.error)request.reject(Error(response.error));else request.resolve(response.result);
 };
 function nativeCall(action,payload) {
  return new Promise((resolve,reject)=>{
   const id=String(++nativeSequence),timeout=setTimeout(()=>{nativeRequests.delete(id);reject(Error('Android neodpovídá. Zavři a znovu otevři aplikaci.'));},20000);
   nativeRequests.set(id,{resolve,reject,timeout});
   try{window.PZAndroidNative.postMessage(JSON.stringify({id,action,payload}));}catch(e){clearTimeout(timeout);nativeRequests.delete(id);reject(e);}
  });
 }
 async function nativeSync(force=false) {
  nativeHealth=await nativeCall('sync',{rides:snapshot(),settings:prefs});
  pending=false;cachePreferences();paint();paintPreferences();
  if(force)status(nativeHealth.enabled?`Android · naplánováno ${nativeHealth.count} oznámení v telefonu`:'Oznámení jsou na tomto telefonu vypnutá.');
 }
 const TYPES = [['day_before','Den předem','Předstih před termínem jízdy',1440],['morning','Ranní připomínka','V den jízdy, pouze před jejím termínem','07:00'],['hour_before','Připomínka před jízdou','Předstih před termínem jízdy',60],['late_5','První upozornění po termínu','Pokud jízda zůstává plánovaná',5],['late_10','Druhé upozornění po termínu','Pokud jízda zůstává plánovaná',10],['late_15','Třetí upozornění po termínu','Pokud jízda zůstává plánovaná',15]];
 let prefs = structuredClone(DEFAULTS), revision=0, pending=false, prefsBusy=false, loadedOwner;
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
   let data; try { data=await response.json(); } catch {}
   if(data?.code==='40001') { const e=Error('Nastavení se změnilo na jiném zařízení. Obnov aktuální nastavení a zopakuj změnu.'); e.conflict=true; throw e; }
   throw Error(path.includes('pz_test_push') ? 'Test se nepodařilo zařadit. Mezi testy počkej jednu minutu.' : 'Služba upozornění není dostupná. Změny čekají na odeslání.');
  }
  const text = await response.text(); return text ? JSON.parse(text) : null;
 }
 let refreshing;
 async function token() {
  if(window.PZCloudAuth) return window.PZCloudAuth.token();
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
  if(native){try{await nativeSync(force);}catch(e){status(e.message,true);}return;}
  if (!ready || !session?.subscribed || busy) return;
  busy=true;await syncPreferences();
  const baselineKey=key(), syncingUser=session.userId;
  const current = snapshot(), previous = read(baselineKey) || [];
  const d = window.PZPushModel.delta(current, previous);
  if (!force && !d.changes.length && !d.removed.length) {busy=false;return;}
  let successful = false; busy = true; status(navigator.onLine ? 'Odesílám změny připomínek…' : 'Bez internetu · změny čekají na odeslání');
  try {
   const access = await token();
   const count = await http('/rest/v1/rpc/pz_sync_push', { changes: d.changes, removed: d.removed }, 'POST', access);
   if (session?.userId !== syncingUser) return;
   localStorage.setItem(baselineKey, JSON.stringify(current)); localStorage.setItem('pzPushLastSync:'+session.userId,new Date().toISOString()); successful = true; paintHealth();
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
  if (!registration) registration = await navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'});
  await navigator.serviceWorker.ready; return registration;
 }
 async function enable() {
  const button = $('pzPushEnable'); button.disabled = true;
  try {
   if(native){
    nativeHealth=await nativeCall('health');
    if(!nativeHealth.permission || !nativeHealth.exact){
     nativeHealth=await nativeCall('permission');paint();
     status(!nativeHealth.permission?'Povol oznámení Evidence v okně Androidu. Potom klepni znovu na Zapnout oznámení.':'Povol Budíky a připomenutí pro Evidenci, vrať se a klepni na Zapnout oznámení.');return;
    }
    nativeHealth=await nativeCall('enable');await nativeSync(true);return;
   }
   if (!ready) throw Error('Odesílací služba zatím není aktivovaná.');
   if (!window.isSecureContext) throw Error('Oznámení vyžadují webovou verzi přes HTTPS. Otevři https://pilazeleznice-coder.github.io/evidence-rozvozu-app/ přímo v Chromu.');
   if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw Error('Tato verze prohlížeče neumí přijímat push oznámení. Otevři webovou Evidenci přímo v aplikaci Chrome.');
   // Permission request is triggered directly by this button, before any await of network work.
   const permission = await Notification.requestPermission();
   if (permission !== 'granted') {
    paintHealth();
    throw Error(permission==='denied'
     ? 'Chrome má oznámení pro tento web zablokovaná. V Chromu otevři Nastavení → Nastavení webu → Oznámení a povol tento web.'
     : /Android/i.test(navigator.userAgent)
      ? 'Chrome nezískal povolení. V Nastavení telefonu otevři Aplikace → Chrome → Oznámení a zapni Povolit oznámení. Pak se vrať a klepni znovu na Připojit oznámení.'
      : 'Povolení oznámení nebylo potvrzeno. Klepni znovu na Připojit oznámení a v nabídce prohlížeče zvol Povolit.');
   }
   if (!session) {
    const email = $('pzPushEmail').value.trim(), password = $('pzPushPassword').value;
    if (!email || !password) throw Error('Vyplň přihlášení k účtu Evidence.');
    const x = window.PZCloudAuth ? await window.PZCloudAuth.login(email,password) : await http('/auth/v1/token?grant_type=password', {email,password});
    session = {access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Date.now()/1000+x.expires_in,userId:x.user.id,subscribed:false};
    $('pzPushPassword').value = ''; localStorage.setItem(SESSION, JSON.stringify(session));
   }
   const reg = await worker(), access = await token();
   let subscription = await reg.pushManager.getSubscription();
   if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:publicBytes(cfg.vapidPublicKey) });
   await http('/rest/v1/pz_push_subscriptions?on_conflict=user_id,device_id', { user_id:session.userId,device_id:device,subscription:subscription.toJSON(),device_name: deviceLabel(),updated_at:new Date().toISOString() }, 'POST', access);
   session.subscribed = true; localStorage.setItem(SESSION,JSON.stringify(session));
   // Keep the baseline: repeated enable must not overwrite newer changes made on another device.
   await loadPreferences(); paint(); await sync(true); await listDevices();
  } catch(e) { status(e.message || 'Oznámení se nepodařilo připojit.',true); }
  finally { button.disabled = false; }
 }
 async function disable() {
  const button = $('pzPushDisable'); button.disabled = true;
  try {
   if(native){nativeHealth=await nativeCall('disable');paint();status('Oznámení jsou na tomto telefonu vypnutá.');return;}
   if (session) {
    await http(`/rest/v1/pz_push_subscriptions?user_id=eq.${encodeURIComponent(session.userId)}&device_id=eq.${device}`, undefined, 'DELETE', await token());
    const sub = await (await worker()).pushManager.getSubscription(); await sub?.unsubscribe();
   }
   if(window.PZCloudAuth && session){session.subscribed=false;localStorage.setItem(SESSION,JSON.stringify(session));}
   else {session = null; localStorage.removeItem(SESSION);}
   paint(); status('Oznámení jsou na tomto zařízení vypnutá.');
  } catch(e) { status('Odpojení se nezdařilo. Zkus to znovu s připojením k internetu.',true); }
  finally { button.disabled = false; }
 }
 async function test() {
  const button=$('pzPushTest');button.disabled=true;
  try {
   if(native){nativeHealth=await nativeCall('test');status('Test je naplánovaný za 10 sekund. Zavři aplikaci a zamkni telefon.');return;}
   if (!session?.subscribed) throw Error('Nejdřív připoj oznámení.');
   const id=await http('/rest/v1/rpc/pz_test_push',{device},'POST',await token());
   status('Test zařazen na serveru. Do jedné minuty očekávej oznámení; můžeš zavřít aplikaci a zamknout telefon.');
   const poll=setInterval(async()=>{
    try { const rows=await http('/rest/v1/pz_push_jobs?id=eq.'+id+'&select=state',undefined,'GET',await token());
     if(rows?.[0] && ['sent','failed','expired'].includes(rows[0].state)) {clearInterval(poll);status(rows[0].state==='sent' ? 'Push služba přijala oznámení. Doručení na obrazovku potvrď na zařízení.' : 'Serverový test selhal nebo vypršel.',rows[0].state!=='sent');}
    }catch {clearInterval(poll);}
   },5000);setTimeout(()=>clearInterval(poll),180000);
  } catch(e) { status(e.message,true); }
  finally {button.disabled=false;}
 }
 function prefKey() {return 'pzPushPreferences:'+authRoot+':'+(native?'android':session?.userId||'local');}
 function cachePreferences() {localStorage.setItem(prefKey(),JSON.stringify({settings:prefs,revision,pending}));}
 function paintPreferences() {
  for(const k of ['enabled','detail','address','price','payment']) if($('pzPref-'+k)) $('pzPref-'+k).checked=prefs[k];
  for(const [k] of TYPES) {if(!$('pz-'+k))continue;$('pz-'+k).checked=prefs[k].enabled; const input=$('pz-value-'+k);input.value=k==='morning'?prefs[k].time:(k==='day_before'?prefs[k].minutes/60:prefs[k].minutes);}
  $('pzPrefStatus').textContent=native?'Nastavení připomínek je uložené v tomto telefonu.':pending?'Změny čekají na synchronizaci se serverem.':session?'Nastavení společné pro všechna zařízení účtu.':'Nastavení se uloží na server po připojení účtu.';
 }
 function deviceLabel() {return /Android/i.test(navigator.userAgent)?'Android · '+(/Samsung/i.test(navigator.userAgent)?'Samsung':'Chrome'):/Windows/i.test(navigator.userAgent)?'Windows · prohlížeč':/iPhone|iPad/i.test(navigator.userAgent)?'iPhone / iPad':'Prohlížeč';}
 async function loadPreferences() {
  const owner=native?'android':session?.userId||'local';
  const cached=loadedOwner===owner?null:read(prefKey()); if(cached){prefs=cached.settings;revision=cached.revision;pending=cached.pending;}
  else if(loadedOwner!==owner) {prefs=structuredClone(DEFAULTS);revision=0;pending=false;const local=read('pzPushPreferences:'+authRoot+':local');if(local?.pending){prefs=local.settings;pending=true;revision=0;}}
  loadedOwner=owner;
  if(!native && session && !pending && !window.PZSync) { const rows=await http('/rest/v1/pz_push_preferences?select=settings,revision,updated_at',undefined,'GET',await token());if(!pending && session?.userId===owner && !window.PZSync){prefs=rows?.[0]?.settings||structuredClone(DEFAULTS);revision=rows?.[0]?.revision||0;cachePreferences();} }
  paintPreferences();
 }
 async function syncPreferences() {
  if(window.PZSync){pending=false;cachePreferences();paintPreferences();return;}
  if(native || !session || prefsBusy)return;
  prefsBusy=true;
  try {
   if(pending) {
    const saving=JSON.stringify(prefs),owner=session.userId;
    const result=await http('/rest/v1/rpc/pz_set_push_preferences',{settings:JSON.parse(saving),expected_revision:revision},'POST',await token());
    if(session?.userId!==owner)return;
    revision=result.revision;pending=JSON.stringify(prefs)!==saving;cachePreferences();paintPreferences();
   } else await loadPreferences();
  } catch(e) { $('pzPrefStatus').textContent=e.message; if(e.conflict) $('pzPrefReload').hidden=false; }
  finally {prefsBusy=false;}
 }
 async function preferencesChanged() {
  const button=$('pzPrefSave');const next=structuredClone(prefs);
  for(const k of ['enabled','detail','address','price','payment']) next[k]=$('pzPref-'+k).checked;
  for(const [k] of TYPES) {next[k].enabled=$('pz-'+k).checked;const input=$('pz-value-'+k);if(!input.checkValidity()){input.reportValidity();return;}if(k==='morning')next[k].time=input.value;else next[k].minutes=Math.round(Number(input.value)*(k==='day_before'?60:1));}
  prefs=next;pending=true;cachePreferences();button.disabled=true;
  window.dispatchEvent(new Event('pz-reminders-changed'));
  try {
   if(native) await nativeSync(true); else await syncPreferences();
   $('pzSaveStatus').textContent=pending?'Změny uloženy v zařízení. Synchronizace se serverem čeká na připojení.':'Změny uloženy.';
  } catch(e) {$('pzSaveStatus').textContent='Změny jsou uložené v zařízení, ale plán se nepodařilo aktualizovat: '+e.message;}
  finally {button.disabled=false;}
 }
 function paintHealth() {
  if(native){
   $('pzAppMode').textContent='Spuštění: Android aplikace';
   $('pzPushSupport').textContent='Systémové připomínky: Android · '+(nativeHealth.exact?'přesné plánování povoleno':'povol Budíky a připomenutí');
   $('pzPermission').textContent='Oznámení aplikace: '+(nativeHealth.permission?'povoleno':'dosud nepovoleno nebo zablokováno');
   $('pzConnection').textContent='Plánování: přímo v telefonu · funguje bez internetu';
   $('pzDevice').textContent='Toto zařízení: '+(nativeHealth.enabled?'oznámení zapnuta':'oznámení vypnuta');
   $('pzLastSync').textContent='Poslední aktualizace plánu: '+(nativeHealth.lastSync?new Date(nativeHealth.lastSync).toLocaleString('cs-CZ'):'dosud neproběhla');return;
  }
  const standalone=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const missing=[!window.isSecureContext?'HTTPS':null,!('serviceWorker' in navigator)?'service worker':null,!('PushManager' in window)?'PushManager':null,!('Notification' in window)?'Notification':null].filter(Boolean);
  $('pzAppMode').textContent='Spuštění: '+(standalone?'nainstalovaná PWA':'web v prohlížeči');
  $('pzPushSupport').textContent='Podpora push: '+(missing.length?'chybí '+missing.join(', '):'dostupná');
  $('pzPermission').textContent='Povolení prohlížeče: '+(!('Notification' in window)?'nepodporováno':({granted:'povoleno',denied:'zablokováno',default:'dosud nepovoleno'}[Notification.permission]));
  $('pzConnection').textContent='Připojení: '+(navigator.onLine?(session?'účet přihlášen':'účet nepřihlášen'):'offline');
  $('pzDevice').textContent='Toto zařízení: '+(session?.subscribed?'registrováno':'nepřipojeno');
  const last=session&&localStorage.getItem('pzPushLastSync:'+session.userId);$('pzLastSync').textContent='Poslední úspěšná synchronizace: '+(last?new Date(last).toLocaleString('cs-CZ'):'dosud neproběhla');
 }
 async function listDevices() {
  const box=$('pzDevices');box.replaceChildren();if(native){box.textContent='Tento Android telefon · místní připomínky';return;}if(!session)return;
  try {const rows=await http('/rest/v1/pz_push_subscriptions?select=device_id,device_name,updated_at',undefined,'GET',await token());for(const row of rows){const line=document.createElement('p');line.textContent=(row.device_name||'Zařízení')+(row.device_id===device?' (toto zařízení)':'')+' · naposledy připojeno '+new Date(row.updated_at).toLocaleString('cs-CZ');box.append(line);}}
  catch {box.textContent='Přehled zařízení není dostupný.';}
 }
 function paint() {
  paintHealth();
  $('pzPushLogin').hidden = native || !!session;
  $('pzPushEnable').textContent = native ? 'Zapnout oznámení' : session?.subscribed ? 'Znovu připojit oznámení' : 'Připojit oznámení';
  $('pzPushDisable').hidden = native ? !nativeHealth.enabled : !session;
  $('pzPushTest').hidden = native ? !nativeHealth.enabled : !session?.subscribed;
  $('pzPushEnable').disabled = !native && !ready;
 }
 function openRide(id) {
  let rides; try { rides = window.rides || window.eval('rides'); } catch { rides = read('evidenceRozvozu_v4') || []; }
  const ride = rides.find(r => String(r.id) === String(id));
  if (ride && typeof window.showInfo === 'function') { $('v80Settings')?.classList.remove('open'); document.body.style.overflow=''; window.showInfo(ride.mergedParentId || ride.id); }
  else if(typeof window.v52Alert==='function') window.v52Alert('Tato jízda na tomto zařízení není dostupná. Otevři Evidenci, ve které byla zadána.');
 }
 function install() {
  const groups = document.querySelector('#v80SettingsHome .v80-groups'); if (!groups) return;
  const section = document.createElement('section'); section.innerHTML = `<details class="pz-settings-section"><summary>Oznámení <span>Nastavení připomínek jízd</span></summary><div class="v80-card pz-push-card">
  <h3>Upozornění na jízdy</h3><p>Časy se počítají v Europe/Prague včetně letního a zimního času. START, dokončení, zrušení nebo smazání zastaví další připomínky.</p>
  <label class="pz-check"><input type="checkbox" id="pzPref-enabled">Zapnout připomínky na všech zařízeních účtu</label>
  <div class="pz-health"><span id="pzAppMode"></span><span id="pzPushSupport"></span><span id="pzPermission"></span><span id="pzConnection"></span><span id="pzDevice"></span><span id="pzLastSync"></span></div>
  <div id="pzPushLogin"><label>E-mail účtu Evidence<input id="pzPushEmail" type="email" autocomplete="username"></label><label>Heslo<input id="pzPushPassword" type="password" autocomplete="current-password"></label></div>
  <p id="pzPushStatus" role="status" aria-live="polite"></p><div class="pz-push-buttons"><button id="pzPushEnable" type="button" class="v80-primary">Připojit oznámení</button><button id="pzPushTest" type="button">Zkusit oznámení</button><button id="pzPushDisable" type="button">Odpojit zařízení</button></div>
  <p>Nastavení časů a obsahu je společné pro účet. Připojení a odpojení platí pouze pro toto zařízení.</p>
  <div class="pz-reminders">${TYPES.map(([k,label,desc,value])=>`<div class="pz-reminder"><label class="pz-check"><input id="pz-${k}" type="checkbox">${label}</label><small>${desc}</small><label>${k==='morning'?'Čas v den jízdy':k==='day_before'?'Předstih v hodinách':'Počet minut'}<input id="pz-value-${k}" type="${k==='morning'?'time':'number'}" ${k==='morning'?'':`min="${k==='day_before'?1/60:1}" max="${k==='day_before'?168:1440}" step="${k==='day_before'?'any':1}"`} value="${k==='day_before'?24:value}" required></label><button type="button" data-reset="${k}">Výchozí hodnota</button></div>`).join('')}</div>
  <h3>Obsah na zamčené obrazovce</h3><label class="pz-check"><input id="pzPref-detail" type="checkbox">Podrobné oznámení se jménem, termínem, vozidlem a objednávkou</label>
  ${[['address','Zahrnout adresu'],['price','Zahrnout cenu bez DPH'],['payment','Zahrnout způsob platby']].map(([k,label])=>`<label class="pz-check"><input id="pzPref-${k}" type="checkbox">${label}</label>`).join('')}
  <small>Ve stručném režimu se žádné zákaznické údaje nezobrazují. Zvuk a vibrace řídí také prohlížeč a operační systém.</small>
  <label>Jízdy bez určeného času<select id="pzNoTime"><option value="skip">Neposílat připomínky, dokud není čas vyplněn</option></select></label>
  <div class="pz-save-bar"><button id="pzPrefSave" type="button" class="v80-primary">Uložit změny</button><p id="pzSaveStatus" role="status" aria-live="polite"></p></div><p id="pzPrefStatus" role="status"></p><div class="pz-push-buttons"><button id="pzPrefReset" type="button">Obnovit všechna výchozí nastavení</button><button id="pzPrefReload" type="button">Načíst aktuální nastavení serveru</button></div>
  <h3>Připojená zařízení</h3><div id="pzDevices"></div>
  <small>Plánovač kontroluje úlohy každou minutu. Internet, úspora baterie a režim Nerušit mohou doručení zpozdit. Úpravy offline čekají na otevření aplikace s internetem; do té doby platí poslední serverový plán. Tento doplněk nepřenáší celou evidenci mezi zařízeními.</small></div></details>`;
  groups.prepend(section);
  if(native){
   $('pzPref-enabled').parentElement.lastChild.textContent='Zapnout připomínky na tomto telefonu';
   section.querySelector('.pz-push-buttons').nextElementSibling.textContent='Android plánuje připomínky místně. Účet ani připojení k internetu nejsou pro jejich doručení potřeba.';
   section.querySelector('.pz-push-card > small:last-child').textContent='Připomínky fungují i po zavření aplikace. Při otevření Evidence se načtou synchronizované jízdy a aktualizují se připomínky v telefonu. Režim Nerušit a úspora baterie mohou ovlivnit doručení.';
   $('pzPrefReload').hidden=true;
  }
  section.querySelectorAll('input[id^=pzPref-],input[id^=pz-],input[id^=pz-value-]').forEach(input=>input.addEventListener('change',()=>{$('pzSaveStatus').textContent='Neuložené změny · klepni na Uložit změny.';}));
  section.querySelectorAll('[data-reset]').forEach(button=>button.onclick=()=>{const k=button.dataset.reset;const input=$('pz-value-'+k);$('pz-'+k).checked=DEFAULTS[k].enabled;input.value=k==='morning'?DEFAULTS[k].time:(k==='day_before'?DEFAULTS[k].minutes/60:DEFAULTS[k].minutes);$('pzSaveStatus').textContent='Výchozí hodnota připravena · klepni na Uložit změny.';});
  $('pzPrefReset').onclick=()=>{const saved=prefs;prefs=structuredClone(DEFAULTS);paintPreferences();prefs=saved;$('pzSaveStatus').textContent='Výchozí hodnoty připraveny · klepni na Uložit změny.';};
  $('pzPrefReload').onclick=async()=>{pending=false;try{await loadPreferences();$('pzPrefReload').hidden=true;}catch(e){status(e.message,true);}};
  $('pzPrefSave').onclick=preferencesChanged;
  loadPreferences().catch(e=>status(e.message,true)); $('pzPushEnable').onclick=enable; $('pzPushDisable').onclick=disable; $('pzPushTest').onclick=test; paint();
  // Prepare the installed PWA at startup; permission is still requested only by the user button.
  if(window.isSecureContext && 'serviceWorker' in navigator) worker().then(reg=>reg.update()).catch(()=>{if(!native)status('Příjem oznámení se nepodařilo připravit. Připoj se k internetu a otevři aplikaci znovu.',true);});
  status(!ready ? 'Zatím neaktivní · čeká na připojení odesílací služby' : session?.subscribed ? 'Kontroluji připomínky…' : 'Připoj toto zařízení k oznámením.');
  if(native){nativeCall('health').then(x=>{nativeHealth=x;paint();listDevices();return nativeSync(true);}).catch(e=>status(e.message,true));}
  else if (ready && session?.subscribed) reconcile();
  const id = new URL(location.href).searchParams.get('pushRide'); if (id) { setTimeout(()=>openRide(id),500); const u=new URL(location.href); u.searchParams.delete('pushRide'); history.replaceState(null,'',u); }
 }
 async function reconcile() {
  try {
   const sub = await (await worker()).pushManager.getSubscription();
   if (!sub || Notification.permission !== 'granted') { status('Oznámení nejsou na zařízení připojená. Použij Znovu připojit oznámení.',true); return; }
   await http('/rest/v1/pz_push_subscriptions?on_conflict=user_id,device_id', {user_id:session.userId,device_id:device,subscription:sub.toJSON(),device_name: deviceLabel(),updated_at:new Date().toISOString()}, 'POST', await token());
   await sync(true); await listDevices();
  } catch(e) { status(e.message || 'Oznámení se nepodařilo zkontrolovat.',true); }
 }
 window.addEventListener('pz-native-open-ride',e=>{if(e.detail)openRide(e.detail);});
 window.addEventListener('pz-cloud-data',()=>{schedule();});
 window.addEventListener('pz-cloud-auth',()=>{session=read(SESSION);if($('pzPushLogin')){paint();if(!native)sync();}});
 window.PZPushSettings={
  snapshot(){return structuredClone(prefs);},
  isDefault(){const stable=window.PZSyncModel?.stable||JSON.stringify;return stable(prefs)===stable(DEFAULTS);},
  apply(settings){
   if(!settings || JSON.stringify(settings)===JSON.stringify(prefs))return;
   prefs=structuredClone(settings);pending=true;cachePreferences();
   if($('pzPrefStatus')){paintPreferences();schedule();}
  }
 };
 window.addEventListener('pz-native-resume',()=>{if(native && $('pzDevice'))nativeCall('health').then(x=>{nativeHealth=x;paint();return nativeSync();}).catch(e=>status(e.message,true));});
 window.addEventListener('online',()=>{paintHealth();sync(true);});
 window.addEventListener('offline',()=>{paintHealth();if(!native)$('pzPrefStatus').textContent='Offline · změny čekají na synchronizaci.';});
 window.addEventListener('storage',event=>{ if (event.key===SESSION) {session=read(SESSION); paint();} schedule(); });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden) sync(true);});
 navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='PZ_OPEN_RIDE') openRide(e.data.rideId);});
 setInterval(()=>sync(),30000);
 if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
