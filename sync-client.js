(function(){
 'use strict';
 const M=window.PZSyncModel,A=window.PZCloudAuth,client=A.client;
 const KEYS={rides:'evidenceRozvozu_v4',trash:'evidenceRozvozu_trash_v38',drafts:'evidenceRozvozu_drafts_v40',breaks:'evidenceRozvozu_breaks_v20',origin:'evidenceRozvozu_mapyOrigin_v34',single:'evidenceRozvozu_activeRun_v24',merged:'evidenceRozvozu_mergedActive_v51'};
 const uuid=()=>crypto.randomUUID(),$=id=>document.getElementById(id);
 let state=null,db,filesDb,working=false,lockPending=false,applying=false,enabled=true,timer,channel,saveChain=Promise.resolve(),fatal='',lastError='',remoteWaiting=false,announce=false,toastUntil=0;
 function openDb(name,store,keyPath){return new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store,keyPath?{keyPath}:undefined);};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
 function tx(db,store,mode,action){return new Promise((ok,no)=>{const t=db.transaction(store,mode);let result;const r=action(t.objectStore(store));if(r)r.onsuccess=()=>result=r.result;t.oncomplete=()=>ok(result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||Error('Uložení bylo přerušeno.'));});}
 function persist(){if(!state)return Promise.resolve();const copy=structuredClone(state);saveChain=saveChain.catch(()=>{}).then(()=>tx(db,'state','readwrite',s=>s.put(copy,'main')));return saveChain;}
 function read(k,fallback=null){try{const text=localStorage.getItem(k);return text===null?fallback:JSON.parse(text);}catch{throw Error('Místní data jsou poškozená. Synchronizace je pozastavená, vytvoř zálohu.');}}
 function snapshot(){
  const out={};const add=(kind,id,payload)=>{out[M.key(kind,String(id))]={kind,id:String(id),payload};};
  for(const r of read(KEYS.rides,[]))add('ride',r.id,{bucket:'rides',record:r});
  for(const r of read(KEYS.trash,[]))add('ride',r.id,{bucket:'trash',record:r});
  for(const r of read(KEYS.drafts,[]))add('draft',r.id,r);
  for(const [date,value] of Object.entries(read(KEYS.breaks,{})))add('break',date,{value});
  const origin=read(KEYS.origin);if(origin)add('setting','origin',origin);
  const reminders=window.PZPushSettings?.snapshot();if(reminders)add('setting','reminders',reminders);
  const single=read(KEYS.single),merged=read(KEYS.merged);if(single||merged)add('run','active',{single,merged});
  for(const [id,payload] of Object.entries(state?.files||{}))add('file',id,payload);
  return out;
 }
 function capture(){if(!state||applying||fatal)return;M.capture(state,snapshot(),uuid);}
 function writeSnapshot(map){
  applying=true;
  const previous=Object.fromEntries(Object.values(KEYS).map(k=>[k,localStorage.getItem(k)]));
  const oldLive=Array.isArray(window.rides)?[...window.rides]:null;
  try{
   const rides=[],trash=[],drafts=[],breaks={};let origin=null,run=null,reminders=null;
   for(const r of Object.values(map)){
    if(r.kind==='ride')(r.payload.bucket==='trash'?trash:rides).push(r.payload.record);
    if(r.kind==='draft')drafts.push(r.payload);
    if(r.kind==='break')breaks[r.id]=r.payload.value;
    if(r.kind==='setting'&&r.id==='origin')origin=r.payload;
    if(r.kind==='setting'&&r.id==='reminders')reminders=r.payload;
    if(r.kind==='run')run=r.payload;
   }
   // Preserve the shared array object used by existing Timeline and card closures.
   localStorage.setItem(KEYS.rides,JSON.stringify(rides));localStorage.setItem(KEYS.trash,JSON.stringify(trash));localStorage.setItem(KEYS.drafts,JSON.stringify(drafts));localStorage.setItem(KEYS.breaks,JSON.stringify(breaks));
   for(const [k,v] of [[KEYS.origin,origin],[KEYS.single,run?.single],[KEYS.merged,run?.merged]]){if(v)localStorage.setItem(k,JSON.stringify(v));else localStorage.removeItem(k);}
   const live=window.rides;if(Array.isArray(live))live.splice(0,live.length,...rides);
   if(reminders)window.PZPushSettings?.apply(reminders);
   for(const r of Object.values(map))if(r.kind==='file')state.files[r.id]=r.payload;
   window.render?.();
   for(const [id,count] of [['trashToolCount',trash.length],['draftToolCount',drafts.length]]){const el=$(id);if(el){el.textContent=count>99?'99+':count;el.classList.toggle('show',count>0);}}
   window.dispatchEvent(new Event('pz-cloud-data'));
  }catch(error){
   for(const k of Object.values(KEYS))localStorage.removeItem(k);
   for(const [k,v] of Object.entries(previous))if(v!==null)localStorage.setItem(k,v);
   if(oldLive&&Array.isArray(window.rides))window.rides.splice(0,window.rides.length,...oldLive);
   throw error;
  }finally{applying=false;}
 }
 function editing(){return !!document.querySelector('#formModal.show,#timelinePage.open,#v51MergeModal.open,#v52EditMergedModal.open,#activeRun.open,#activeRun.show,#v51MergedRun.open,#v81RestoreOverlay.open,#v38TrashOverlay.open,#v40Drafts.open');}
 function queue(){if(applying||fatal)return;clearTimeout(timer);timer=setTimeout(()=>sync(),600);}
 const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
 const watched=new Set(Object.values(KEYS));
 Storage.prototype.setItem=function(k,v){set.call(this,k,v);if(this===localStorage&&watched.has(k)&&!applying)queue();};
 Storage.prototype.removeItem=function(k){remove.call(this,k);if(this===localStorage&&watched.has(k)&&!applying)queue();};
 async function hash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');}
 function referencedFiles(map){const ids=new Set();function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return;}if(Array.isArray(x.documents))for(const f of x.documents)if(f?.id)ids.add(String(f.id));for(const [k,v] of Object.entries(x))if(k!=='documents')walk(v);}
  for(const r of Object.values(map))if(['ride','draft'].includes(r.kind))walk(r.payload);return ids;
 }
 async function uploadFiles(){
  for(const id of referencedFiles(snapshot())){
   if(state.files[id])continue;
   const f=await tx(filesDb,'files','readonly',s=>s.get(id));
   if(!f?.blob)throw Error('Chybí místní příloha. Otevři původní zařízení a zkontroluj dokumenty.');
   if(f.blob.size>52428800)throw Error('Příloha „'+f.name+'“ překračuje limit 50 MB. Zůstává bezpečně v zařízení.');
   const digest=await hash(f.blob),path=state.owner+'/'+digest;
   const {error}=await client.storage.from('evidence-documents').upload(path,f.blob,{contentType:f.type||'application/octet-stream',upsert:false});
   if(error&&Number(error.statusCode)!==409&&Number(error.status)!==409)throw Error('Přílohu se nepodařilo odeslat. Zůstává v zařízení. '+(error.message||''));
   state.files[id]={id,name:f.name||id,type:f.type||'',size:f.blob.size,hash:digest,path};capture();await persist();
  }
 }
 async function downloadFile(f){
  if(!f||!f.path?.startsWith(state.owner+'/')||!/^([a-f0-9]{64})$/.test(f.hash))throw Error('Server vrátil neplatný dokument.');
  const existing=await tx(filesDb,'files','readonly',s=>s.get(f.id));
  if(existing?.cloudHash===f.hash&&existing.blob?.size===f.size)return;
  if(existing?.blob&&await hash(existing.blob)===f.hash){await tx(filesDb,'files','readwrite',s=>s.put({...existing,cloudHash:f.hash}));return;}
  const {data,error}=await client.storage.from('evidence-documents').download(f.path);if(error)throw Error('Dokument se nepodařilo stáhnout. Zkus synchronizaci znovu.');
  if(data.size!==f.size||await hash(data)!==f.hash)throw Error('Kontrola staženého dokumentu selhala.');
  await tx(filesDb,'files','readwrite',s=>s.put({id:f.id,name:f.name,type:f.type,size:data.size,blob:data,cloudHash:f.hash}));
 }
 async function send(){
  // Publish manifests before rides that refer to them.
  let ops=Object.entries(state.outbox).filter(([k])=>!state.conflicts[k]).map(([,v])=>structuredClone(v));
  ops.sort((a,b)=>(a.kind==='file'?0:1)-(b.kind==='file'?0:1));
  for(let start=0;start<ops.length;start+=50){
   const batch=ops.slice(start,start+50);
   const {data,error}=await client.rpc('pz_sync_apply',{changes:batch});if(error)throw error;
   capture();
   for(let i=0;i<batch.length;i++){
    const op=batch[i],answer=data?.[i];if(!answer?.row)throw Error('Server nepotvrdil uložení změny.');
    if(answer.ok)M.acknowledge(state,op,answer.row);
    else state.conflicts[M.key(op.kind,op.id)]={remote:answer.row};
   }
   await persist();
  }
 }
 async function pull(){
  if(editing()){remoteWaiting=true;return;}
  remoteWaiting=false;
  for(let page=0;page<100;page++){
   const {data,error}=await client.from('pz_sync_entries').select('*').eq('user_id',state.owner).gt('revision',state.cursor).order('revision').limit(200);
   if(error)throw error;if(!data.length)break;
   for(const row of data)if(row.kind==='file'&&!row.deleted)await downloadFile(row.payload);
   if(editing()){remoteWaiting=true;break;}
   capture();const map=snapshot();const before=M.stable(map),previousState=structuredClone(state);
   M.receive(state,map,data);
   // Download old referenced documents as well (e.g. on a fresh device after history restore).
   for(const row of data)if(row.kind==='file'&&!row.deleted&&!state.conflicts[M.key(row.kind,row.id)])state.files[row.id]=row.payload;
   try{if(before!==M.stable(map))writeSnapshot(map);await persist();}
   catch(error){state=previousState;throw error;}
   if(data.length<200)break;
  }
  // Retry interrupted local downloads even after the cursor was committed.
  for(const id of referencedFiles(snapshot()))if(state.files[id])await downloadFile(state.files[id]);
 }
 async function performSync(force=false){
  if(working)return false;
  working=true;announce=force;lastError='';paint();
  try{
   await initialized;
   if(fatal)throw Error(fatal);
   await saveChain;
   const saved=await tx(db,'state','readonly',s=>s.get('main'));if(saved)state=saved;
   if(!A.user){capture();await persist();return false;}
   if(!state)await bind(A.user.id);
   if(state.owner!==A.user.id)throw Error('V zařízení jsou data jiného účtu. Přihlas se původním účtem.');
   capture();if(Object.keys(state.outbox).length)announce=true;paint();await persist();
   if(!navigator.onLine||(!enabled&&!force))return false;
   await uploadFiles();capture();await persist();await send();await pull();
   state.lastSync=new Date().toISOString();await persist();if(announce){toastUntil=Date.now()+2600;setTimeout(paint,2700);}
   return Object.keys(state.outbox).length===0;
  }catch(error){lastError=error?.message||'Synchronizace se nezdařila. Změny zůstávají v zařízení.';console.warn('Evidence sync:',lastError);return false;}
  finally{working=false;paint();}
 }
 async function sync(force=false){
  if(working||lockPending)return false;
  lockPending=true;
  try{return navigator.locks?await navigator.locks.request('pz-evidence-data-sync',()=>performSync(force)):await performSync(force);}
  finally{lockPending=false;}
 }
 async function bind(owner){
  if(state&&state.owner!==owner)throw Error('V zařízení jsou data jiného účtu. Přihlas se původním účtem.');
  if(!state){
   // Automatic recovery checkpoint before the first account merge. Document blobs remain untouched.
   const checkpoint={at:new Date().toISOString(),storage:Object.fromEntries(Object.values(KEYS).map(k=>[k,localStorage.getItem(k)]))};
   await tx(db,'state','readwrite',s=>s.put(checkpoint,'before-first-sync'));
   state=M.empty(owner);
   // Fresh devices must receive shared reminder settings rather than publish untouched defaults.
   if(window.PZPushSettings?.isDefault())state.seen['setting:reminders']=M.stable(window.PZPushSettings.snapshot());
   capture();await persist();
  }
  if(!channel)channel=client.channel('evidence-sync-'+owner).on('postgres_changes',{event:'*',schema:'public',table:'pz_sync_entries',filter:'user_id=eq.'+owner},queue).subscribe();
 }
 function describe(item){
  if(!item||item.deleted)return 'Trvale odstraněno';
  const r=item.payload?.record||item.payload||{};
  if(item.kind==='ride'||item.kind==='draft')return [r.name||'Bez jména',r.date,r.time,r.address,r.vehicle,r.status,r.phone,r.note,r.orderNo,r.net!=null?r.net+' Kč bez DPH':'',item.payload.bucket==='trash'?'V koši':''].filter(Boolean).join(' · ');
  if(item.kind==='run')return 'Probíhající rozvoz · '+(r.single?.rideId||r.merged?.rideId||'');
  if(item.kind==='break')return r.value?`${r.value.start||''}–${r.value.end||''}`:'Bez pauzy';
  return item.kind==='file'?(r.name||'Dokument'):'Nastavení aplikace';
 }
 function paintConflicts(){
  const box=$('pzSyncConflicts');if(!box||!state)return;
  box.replaceChildren();
  for(const [k,c] of Object.entries(state.conflicts)){
   const pending=state.outbox[k];if(!pending)continue;
   const card=document.createElement('article');card.className='pz-sync-conflict';
   const title=document.createElement('strong');title.textContent='Souběžná změna · '+({'ride':'jízda','draft':'koncept','run':'probíhající rozvoz','setting':'nastavení','break':'pauza','file':'dokument'}[pending.kind]||pending.kind);card.append(title);
   const columns=document.createElement('div');columns.className='pz-sync-versions';
   for(const [label,item] of [['Toto zařízení',pending],['Server',c.remote]]){const d=document.createElement('div'),b=document.createElement('b'),p=document.createElement('p');b.textContent=label;p.textContent=describe(item);d.append(b,p);const details=document.createElement('details'),s=document.createElement('summary'),pre=document.createElement('pre');s.textContent='Všechny údaje';pre.textContent=JSON.stringify(item.payload,null,2);details.append(s,pre);d.append(details);columns.append(d);}
   card.append(columns);
   for(const [choice,label] of [['remote','Použít verzi ze serveru'],['local','Použít verzi z tohoto zařízení']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>resolve(k,choice);card.append(b);}box.append(card);
  }
 }
 async function resolve(k,choice){
  if(working||editing())return;
  try{capture();const map=snapshot();if(M.resolve(state,map,k,choice,uuid)){if(choice==='remote')writeSnapshot(map);await persist();await sync(true);}}catch(e){lastError=e.message;}paint();
 }
 function paint(){
  if(!$('pzSyncStatus'))return;
  const count=Object.keys(state?.outbox||{}).length,conflicts=Object.keys(state?.conflicts||{}).length;
  let label=fatal||lastError||(!A.user?'Nepřihlášeno':!navigator.onLine?'Offline · změny čekají na připojení':!enabled?'Automatická synchronizace pozastavena':working?'Synchronizuji…':conflicts?`Vyřeš ${conflicts} souběžné změny`:remoteWaiting?'Načtení změn proběhne po zavření otevřeného okna':count?`${count} změn čeká na odeslání`:'Synchronizováno');
  $('pzSyncStatus').textContent=label;$('pzSyncStatus').classList.toggle('error',!!(fatal||lastError||conflicts));
  $('pzSyncSummary').textContent=label;$('pzSyncLogin').hidden=!!A.user;$('pzSyncAccount').hidden=!A.user;
  $('pzSyncEmailLabel').textContent=A.user?.email||'';
  $('pzSyncQueue').textContent=`Čeká na odeslání: ${count} · Souběžné změny: ${conflicts}`;
  $('pzSyncLast').textContent='Poslední úspěšné spojení: '+(state?.lastSync?new Date(state.lastSync).toLocaleString('cs-CZ'):'dosud neproběhlo');
  $('pzSyncNow').disabled=working||!A.user||!navigator.onLine||!!fatal;$('pzSyncLogout').disabled=working;
  $('pzSyncAuto').checked=enabled;
  const button=$('pzSyncTool');if(button){button.title=label;button.classList.toggle('syncing',working);button.classList.toggle('error',!!(lastError||conflicts||fatal));}
  $('pzSyncToast').textContent=label;$('pzSyncToast').classList.toggle('show',(working&&announce)||Date.now()<toastUntil||!!lastError||!!fatal||!!conflicts);
  // Keep conflict controls stable while the user is reading an expanded comparison.
  const signature=M.stable(state?.conflicts||{})+M.stable(state?.outbox||{});
  if(paint.lastConflicts!==signature){paint.lastConflicts=signature;paintConflicts();}
 }
 function install(){
  const old=document.querySelector('#v80SettingsHome .v80-row.future .v80-copy strong');
  const placeholder=[...document.querySelectorAll('#v80SettingsHome .v80-row.future')].find(x=>x.textContent.includes('Cloudová synchronizace'));
  if(!placeholder)return;
  const section=document.createElement('details');section.className='pz-sync-section';section.id='pzSyncSection';
  section.innerHTML=`<summary><span class="pz-sync-icon">↻</span><span><strong>Cloudová synchronizace</strong><small id="pzSyncSummary">Připravuji…</small></span><span>⌄</span></summary>
   <div class="pz-sync-body"><p>Stejná Evidence v telefonu, tabletu a počítači. Změny se ukládají i bez internetu a odešlou se po připojení.</p>
   <form id="pzSyncLogin"><label>E-mail účtu Evidence<input id="pzSyncEmail" type="email" autocomplete="username" required value="pilazeleznice@gmail.com"></label><label>Heslo<input id="pzSyncPassword" type="password" autocomplete="current-password" required></label><button type="submit" id="pzSyncSignIn">Přihlásit a synchronizovat</button><small>Použij účet z projektu Evidence, heslo může být jiné než v Konfigurátoru.</small></form>
   <div id="pzSyncAccount" hidden><strong id="pzSyncEmailLabel"></strong><label class="pz-sync-switch"><input id="pzSyncAuto" type="checkbox" checked> Automatická synchronizace na tomto zařízení</label><div class="pz-sync-actions"><button id="pzSyncNow" type="button">↻ Synchronizovat nyní</button><button id="pzSyncLogout" type="button" class="secondary">Odhlásit účet</button></div></div>
   <p id="pzSyncStatus" role="status" aria-live="polite"></p><small id="pzSyncQueue"></small><small id="pzSyncLast"></small>
   <div id="pzSyncConflicts"></div><small class="pz-sync-note">Synchronizují se jízdy včetně sloučených, koncepty, koš, průběh rozvozu, pauzy, výchozí adresa, dokumenty a nastavení připomínek. Oprávnění k oznámením patří každému zařízení zvlášť.</small></div>`;
  placeholder.closest('.v80-card').replaceWith(section);
  const tool=document.createElement('button');tool.type='button';tool.className='tool-btn';tool.id='pzSyncTool';tool.setAttribute('aria-label','Synchronizovat Evidenci');tool.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 5v6h-6M4 19v-6h6M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/></svg>';tool.onclick=()=>{if(A.user)sync(true);else{$('settingsToolBtn').click();section.open=true;}};document.querySelector('.tool-panel')?.insertBefore(tool,$('settingsToolBtn'));
  const toast=document.createElement('div');toast.id='pzSyncToast';toast.setAttribute('role','status');document.body.append(toast);
  $('pzSyncLogin').onsubmit=async e=>{e.preventDefault();const b=$('pzSyncSignIn');b.disabled=true;try{await initialized;const session=await A.login($('pzSyncEmail').value.trim(),$('pzSyncPassword').value);$('pzSyncPassword').value='';if(state&&state.owner!==session.user.id){await A.logout();throw Error('Přihlas se původním účtem tohoto zařízení.');}await bind(session.user.id);await sync(true);}catch(error){lastError=error.message;paint();}finally{b.disabled=false;}};
  $('pzSyncNow').onclick=()=>sync(true);
  $('pzSyncAuto').onchange=()=>{enabled=$('pzSyncAuto').checked;localStorage.setItem('pzSyncAuto',String(enabled));paint();if(enabled)sync();};
  $('pzSyncLogout').onclick=async()=>{if(working)return;if(Object.keys(state?.outbox||{}).length){lastError='Před odhlášením nejdřív odešli nebo vyřeš čekající změny.';paint();return;}try{if(channel){await client.removeChannel(channel);channel=null;}await A.logout();paint();}catch(e){lastError=e.message;paint();}};
  paint();
 }
 const initialized=(async()=>{
  try{
   db=await openDb('EvidenceRozvozuSync','state');filesDb=await openDb('EvidenceRozvozuFiles','files','id');state=await tx(db,'state','readonly',s=>s.get('main'))||null;
   enabled=localStorage.getItem('pzSyncAuto')!=='false';await A.ready;
   if(A.user)await bind(A.user.id);
  }catch(e){fatal='Synchronizace není připravená: '+e.message;}
 })();
 window.PZSync={sync,ready:initialized,get status(){return {working:working||lockPending,error:lastError,fatal,queued:Object.keys(state?.outbox||{}).length,conflicts:Object.keys(state?.conflicts||{}).length,lastSync:state?.lastSync};}};
 window.addEventListener('pz-cloud-auth',()=>{initialized.then(()=>{if(A.user){bind(A.user.id).then(()=>sync()).catch(e=>{lastError=e.message;paint();});}else paint();});});
 window.addEventListener('pz-reminders-changed',queue);
 window.addEventListener('online',()=>sync());window.addEventListener('offline',paint);
 window.addEventListener('pz-native-resume',()=>sync());window.addEventListener('focus',()=>sync());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
 window.addEventListener('storage',e=>{if(watched.has(e.key)){if(e.key===KEYS.rides&&!editing()){const rs=read(KEYS.rides,[]);window.rides?.splice(0,window.rides.length,...rs);window.render?.();}queue();}});
 setInterval(()=>{if(!document.hidden)sync();},15000);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();initialized.then(()=>sync());});else{install();initialized.then(()=>sync());}
})();
