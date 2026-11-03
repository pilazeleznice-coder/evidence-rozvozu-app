(function(){
 'use strict';
 const M=window.PZOperationsModel,$=id=>document.getElementById(id),KEY='evidenceRozvozu_operationsOptions';
 const defaults={conflicts:true,tomorrow:true,duplicate:true,cargo:true,payments:true,history:true,sync:true,period:'month',chart:'trips'};
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch{return f}};
 const options=()=>({...defaults,...read(KEY,{})}),rows=()=>window.rides||[],escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=x=>Number(x||0).toLocaleString('cs-CZ',{maximumFractionDigits:2})+' Kč',num=x=>Number(x||0).toLocaleString('cs-CZ',{maximumFractionDigits:2}),date=x=>x?new Date(x+'T12:00:00').toLocaleDateString('cs-CZ'):'Neurčeno',time=x=>new Date(x).toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}),duration=x=>Math.floor(Math.round(x/60000)/60)+' h '+(Math.round(x/60000)%60)+' min';
 const create=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
 const button=(text,fn,cls='ops-button')=>{const b=create('button',text,cls);b.type='button';b.onclick=fn;return b};
 let loaded={},mode=options().period,anchor=new Date(),chart=options().chart,customFrom=M.day(new Date()),customTo=M.day(new Date());
 function collect(){
  if(!$('opsCargo'))return {};
  return {cargo:$('opsCargo').value.trim(),volumeM3:$('opsVolume').value===''?null:Math.max(0,Number($('opsVolume').value)||0),unloadInstructions:$('opsUnload').value.trim(),transportNet:$('opsTransport').value===''?null:Math.max(0,Number($('opsTransport').value)||0),paymentState:$('opsPayment').value,paidGross:Math.max(0,Number($('opsPaid').value)||0)};
 }
 function load(r={}){
  loaded=r;
  for(const [id,key] of [['opsCargo','cargo'],['opsVolume','volumeM3'],['opsUnload','unloadInstructions'],['opsTransport','transportNet'],['opsPaid','paidGross']])if($(id))$(id).value=r[key]??'';
  if($('opsPayment'))$('opsPayment').value=r.paymentState||(r.payment==='Zaplaceno předem'?'paid':'unknown');
  paintPayment();
 }
 window.PZOperations={collect,load,detail:id=>decorateDetail(id)};
 function inputField(id,label,type='text'){
  const field=create('div',null,'field'+(type==='textarea'?' full':'')),l=create('label',label),input=create(type==='textarea'?'textarea':'input');input.id=id;l.htmlFor=id;
  if(type!=='textarea')input.type=type;if(type==='number'){input.min='0';input.step='0.01';input.inputMode='decimal'}
  field.append(l,input);return field;
 }
 function paintPayment(){if(!$('opsPayment'))return;const state=$('opsPayment').value;$('opsPaid').closest('.field').hidden=state!=='partial';const p=M.payments({...collect(),net:$('fNet').value,payment:$('fPayment').value});$('opsBalance').textContent=p.due==null?'Stav úhrady není ověřený.':'Zbývá uhradit: '+money(p.due)+' s DPH';}
 function settings(){
  const panel=create('details',null,'ride-options');panel.id='opsSettings';panel.append(create('summary','Plánování, platby a statistiky'));
  for(const [key,label] of [['conflicts','Kontrolovat překrývání jízd'],['tomorrow','Zobrazovat přehled zítřejších rozvozů'],['duplicate','Nabízet duplikování jízd'],['cargo','Zobrazovat údaje o nákladu a vykládce'],['payments','Zobrazovat stav úhrady a cenu dopravy'],['history','Nabízet historii zákazníka'],['sync','Zobrazovat stav synchronizace na úvodu']]){
   const l=create('label'),i=create('input');i.type='checkbox';i.checked=options()[key];i.dataset.opsOption=key;i.onchange=()=>{localStorage.setItem(KEY,JSON.stringify({...options(),[key]:i.checked}));paintVisibility();renderHome()};l.append(i,document.createTextNode(label));panel.append(l);
  }
  for(const [key,label,values] of [['period','Výchozí období statistik',[['day','Dnes'],['week','Týden'],['month','Měsíc'],['year','Rok']]],['chart','Výchozí graf',[['trips','Počet jízd'],['transport','Cena dopravy bez DPH'],['km','Kilometry']]]]){
   const l=create('label',label),s=create('select');s.setAttribute('aria-label',label);for(const [v,t] of values){const o=create('option',t);o.value=v;s.append(o)}s.value=options()[key];s.onchange=()=>{localStorage.setItem(KEY,JSON.stringify({...options(),[key]:s.value}));if(key==='period')mode=s.value;else chart=s.value;renderStats()};l.append(s);panel.append(l);
  }
  panel.append(create('p','Volby zobrazení platí pro toto zařízení. Údaje nákladu a plateb se ukládají k jízdám a konceptům. Překryvy počítáme z dostupného plánu včetně nakládky, rezervy a návratu.'));
  $('v80SettingsHome').append(panel);
 }
 function paintVisibility(){const o=options();$('opsCargoGroup').hidden=!o.cargo;$('opsPaymentGroup').hidden=!o.payments;$('opsHistory').hidden=!o.history;$('opsFormWarning').hidden=!o.conflicts;$('opsHome').hidden=!(o.tomorrow||o.conflicts||o.sync);}
 function form(){
  const details=create('details',null,'ops-more field full');details.id='opsMore';details.append(create('summary','Více údajů · náklad a platby'));
  const cargo=create('div',null,'ops-form-grid');cargo.id='opsCargoGroup';cargo.append(inputField('opsCargo','Co se veze','textarea'),inputField('opsVolume','Objem nákladu (m³)','number'),inputField('opsUnload','Pokyny k vykládce','textarea'));
  const pay=create('div',null,'ops-form-grid');pay.id='opsPaymentGroup';pay.append(inputField('opsTransport','Z toho doprava bez DPH (Kč)','number'));
  const f=create('div',null,'field'),l=create('label','Stav úhrady'),s=create('select');s.id='opsPayment';l.htmlFor=s.id;for(const [v,t] of [['unknown','Neověřeno'],['unpaid','Nezaplaceno'],['partial','Částečně zaplaceno'],['paid','Zaplaceno']]){const o=create('option',t);o.value=v;s.append(o)}f.append(l,s);pay.append(f,inputField('opsPaid','Uhrazeno celkem s DPH (Kč)','number'));const balance=create('p',null,'ops-muted');balance.id='opsBalance';pay.append(balance);details.append(cargo,pay,create('p','Cena jízdy zůstává celkovou částkou. Do tržeb za dopravu se započítává pouze samostatně vyplněná cena dopravy.','ops-muted'));
  $('formModal').querySelector('.form-grid').append(details);
  const historyBtn=button('Historie zákazníka',()=>showHistory());historyBtn.id='opsHistory';$('fPhone').closest('.field').append(historyBtn);
  const warning=create('p',null,'ops-warning');warning.id='opsFormWarning';warning.hidden=true;$('formModal').querySelector('.sheet-actions').before(warning);
  for(const id of ['opsPayment','opsPaid','fNet'])$(id).addEventListener('input',paintPayment);
  $('fPayment').addEventListener('change',()=>{if($('fPayment').value==='Zaplaceno předem'&&$('opsPayment').value==='unknown')$('opsPayment').value='paid';paintPayment()});
  $('addBtn').addEventListener('click',()=>{load();details.open=false;setTimeout(renderFormWarning,260)},true);
  const edit=window.openEdit;window.openEdit=function(id){edit(id);const r=rows().find(r=>String(r.id)===String(id));load(r);details.open=!!(r?.cargo||r?.unloadInstructions||r?.transportNet!=null||r?.paymentState);setTimeout(renderFormWarning,260);window.dispatchEvent(new Event('pz-editor-open'))};
  $('formModal').addEventListener('input',()=>setTimeout(renderFormWarning,0));$('formModal').addEventListener('change',renderFormWarning);
  $('formModal').addEventListener('click',e=>{
   if(!e.target.closest('#saveRide'))return;
   const n=Number($('fNet').value||0),t=$('opsTransport').value,p=$('opsPaid').value,v=$('opsVolume').value;
   if(!Number.isFinite(n)||n<0||(v!==''&&(!Number.isFinite(+v)||+v<0))||(t!==''&&(!Number.isFinite(+t)||+t<0||+t>n+.01))||($('opsPayment').value==='partial'&&(!p||+p<=0||+p>=Math.round(n*1.21)))){e.preventDefault();e.stopImmediatePropagation();details.open=true;$('opsPaymentGroup').hidden=false;$('opsCargoGroup').hidden=false;alert('Zkontroluj částky: cena dopravy nesmí přesáhnout celkovou cenu bez DPH. Částečná úhrada musí být větší než 0 a menší než celková cena s DPH.');return}
  },true);
  setInterval(()=>{if($('formModal').classList.contains('show'))renderFormWarning()},2000);
 }
 function renderFormWarning(){
  const w=$('opsFormWarning');if(!w||!options().conflicts)return;
  const parse=x=>{const h=x?.match(/(\d+)\s*h/),m=x?.match(/(\d+)\s*min/);return (h?+h[1]*60:0)+(m?+m[1]:0)};
  const candidate={...loaded,id:'preview',status:'planned',date:$('fDate').value,time:$('fTime').value,dateUndetermined:$('v72DateUnknown').checked,timeUndetermined:$('v72TimeUnknown').checked,routeOutMinutes:parse($('v39Out')?.textContent),routeBackMinutes:parse($('v39Back')?.textContent),plannedLoadMinutes:parse($('v39Load')?.textContent),plannedUnloadMinutes:parse($('v39Unload')?.textContent),deliveryReserveMinutes:Number(document.querySelector('[data-reserve].active')?.dataset.reserve||0),name:'Tato jízda'};
  const t=M.interval(candidate),pairs=M.conflicts([...rows().filter(r=>String(r.id)!==String(loaded?.id)),candidate]).filter(p=>p.a.id==='preview'||p.b.id==='preview');
  w.hidden=false;w.textContent=!t?'Kontrola návaznosti bude dostupná po výběru adresy v mapě a určení času.':pairs.length?'Pozor na překryv: '+pairs.map(p=>(p.a.id==='preview'?p.b.name:p.a.name)+' ('+p.minutes+' min)').join(', '):'Podle dostupných plánů se tato jízda nepřekrývá s jiným rozvozem.';
 }
 function dialog(title){
  const d=create('dialog',null,'ops-dialog');const h=create('header'),t=create('h2',title),close=button('×',()=>d.close(),'ops-close');close.setAttribute('aria-label','Zavřít');h.append(t,close);d.append(h);d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d;
 }
 function openRide(r){document.querySelectorAll('.ops-dialog').forEach(d=>d.close());$('v48Stats').classList.remove('open');$('v48Stats').setAttribute('aria-hidden','true');document.body.style.overflow='';if($('formModal').classList.contains('show'))$('detailModal').classList.add('ops-front');window.showInfo(r.parentId||r.id)}
 function rideList(target,list){
  if(!list.length){target.append(create('p','V tomto výběru nejsou žádné jízdy.','ops-muted'));return}
  for(const r of list){const box=create('article',null,'ops-list-row'),text=create('div'),p=M.payments(r),t=M.interval(r);text.append(create('strong',r.name||'Bez jména'),create('small',[date(r.date),r.time?'doručení '+r.time:'čas neurčen',r.vehicle,r.orderNo].filter(Boolean).join(' · ')),create('small',r.address||'Adresa chybí'));
   if(t)text.append(create('small','Odjezd '+time(t.departure)+' · návrat přibližně '+time(t.end)));
   if(r.cargo||r.volumeM3!=null)text.append(create('small',[r.cargo,r.volumeM3!=null?num(r.volumeM3)+' m³':''].filter(Boolean).join(' · ')));
   if(r.unloadInstructions)text.append(create('small','Vykládka: '+r.unloadInstructions));
   text.append(create('small',p.due==null?'Úhrada neověřena':p.due>0?'K úhradě '+money(p.due)+' s DPH':'Zaplaceno'));
   const actions=create('div',null,'ops-row-actions');actions.append(button('Detail',()=>openRide(r)));if(options().duplicate&&!r.mergedV51)actions.append(button('Duplikovat',()=>duplicate(r)));
   box.append(text,actions);target.append(box);
  }
 }
 function showHistory(){const number=$('fPhone').value,d=dialog('Historie zákazníka'),list=M.history(rows(),number);d.append(create('p',number?'Telefon: '+number:'Nejdřív vyplň telefon zákazníka.','ops-muted'));rideList(d,list)}
 function duplicate(r){
  if($('formModal').classList.contains('show')&&!confirm('Otevřít kopii jako novou jízdu? Rozpracovaný formulář tím nahradíš.'))return;
  document.querySelectorAll('.ops-dialog').forEach(d=>d.close());$('detailModal').classList.remove('show');$('v48Stats').classList.remove('open');$('v40Archive').classList.remove('open');document.body.style.overflow='';$('addBtn').click();
  setTimeout(()=>{const copy=M.duplicate(r);for(const [id,key] of [['fName','name'],['fPhone','phone'],['fAddress','address'],['fNet','net'],['fPayment','payment'],['fVehicle','vehicle'],['fNote','note']]){$(id).value=copy[key];$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}))}load(copy);loaded={};$('v72TimeUnknown').checked=true;$('v72TimeUnknown').dispatchEvent(new Event('change',{bubbles:true}));$('opsMore').open=true;$('formTitle').textContent='Nová jízda · kopie';},280);
 }
 function decorateDetail(id){
  const r=rows().find(r=>String(r.id)===String(id)),root=$('detailContent');if(!r||!root)return;root.querySelector('#opsDetail')?.remove();
  const card=create('section',null,'ops-card');card.id='opsDetail';
  for(const s of M.customers(r)){
   card.append(create('h3',s.name||'Náklad a úhrada'));
   if(options().cargo){card.append(create('p',s.cargo||'Náklad neuveden'));if(s.volumeM3!=null)card.append(create('p',num(s.volumeM3)+' m³'));if(s.unloadInstructions)card.append(create('p','Vykládka: '+s.unloadInstructions))}
   if(options().payments){const p=M.payments(s);card.append(create('p',s.transportNet==null?'Cena dopravy neuvedena':'Doprava bez DPH: '+money(s.transportNet)),create('p',p.due==null?'Úhrada neověřena':'Uhrazeno '+money(p.paid)+' · zbývá '+money(p.due)+' s DPH'))}
   if(options().cargo||options().payments)card.append(button('Upravit náklad a úhradu',()=>editBusiness(r,s)));
   if(options().duplicate)card.append(button('Duplikovat jako novou jízdu',()=>duplicate(s)));
   if(options().history&&s.phone)card.append(button('Historie zákazníka',()=>{const d=dialog('Historie zákazníka');rideList(d,M.history(rows(),s.phone))}));
  }root.append(card);
 }
 function detail(){const original=window.showInfo;window.showInfo=function(id){original(id);setTimeout(()=>decorateDetail(id),230)}}
 function editBusiness(parent,customer){
  const d=dialog('Náklad a úhrada · '+(customer.name||'zákazník')),fields={},form=create('form',null,'ops-form-grid'),error=create('p',null,'ops-warning');error.hidden=true;
  for(const [key,label,type] of [['cargo','Co se veze','textarea'],['volumeM3','Objem (m³)','number'],['unloadInstructions','Pokyny k vykládce','textarea'],['transportNet','Doprava bez DPH (Kč)','number'],['paidGross','Uhrazeno s DPH (Kč)','number']]){
   const l=create('label',label),i=create(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;if(type==='number'){i.min='0';i.step='.01'}i.value=customer[key]??'';i.dataset.business=key;fields[key]=i;l.append(i);form.append(l);
  }
  const label=create('label','Stav úhrady'),state=create('select');state.dataset.business='paymentState';for(const [v,t] of [['unknown','Neověřeno'],['unpaid','Nezaplaceno'],['partial','Částečně zaplaceno'],['paid','Zaplaceno']]){const o=create('option',t);o.value=v;state.append(o)}state.value=M.payments(customer).state;label.append(state);form.append(label);
  const paidVisibility=()=>fields.paidGross.closest('label').hidden=state.value!=='partial';state.onchange=paidVisibility;paidVisibility();
  const saveButton=button('Uložit údaje',()=>{});saveButton.type='submit';form.append(error,saveButton);d.append(form);
  form.onsubmit=e=>{e.preventDefault();const values={paymentState:state.value};for(const [key,i] of Object.entries(fields))values[key]=['volumeM3','transportNet'].includes(key)?i.value===''?null:Number(i.value):key==='paidGross'?Number(i.value)||0:i.value.trim();
   const total=M.payments(customer).total;
   if((values.transportNet!=null&&(!Number.isFinite(values.transportNet)||values.transportNet<0||values.transportNet>Number(customer.net||0)+.01))||(values.volumeM3!=null&&(!Number.isFinite(values.volumeM3)||values.volumeM3<0))||(values.paymentState==='partial'&&(values.paidGross<=0||values.paidGross>=total))){error.hidden=false;error.textContent='Zkontroluj objem a částky. Doprava nesmí být vyšší než celková cena bez DPH. Částečná úhrada musí být mezi 0 a celkovou cenou s DPH.';return}
   // Re-resolve the current record in case cloud data changed while this dialog was open.
   const current=rows().find(x=>String(x.id)===String(parent.id));if(!current){error.hidden=false;error.textContent='Jízda již není dostupná. Zavři dialog a obnov přehled.';return}
   const source=current.mergedV51?current.stops.find(x=>String(x.childId)===String(customer.id)):current;if(!source){error.hidden=false;error.textContent='Zastávka již není dostupná.';return}
   if(JSON.stringify(M.business(M.customers(current).find(x=>String(x.id)===String(customer.id))||current))!==JSON.stringify(M.business(customer))||Number((M.customers(current).find(x=>String(x.id)===String(customer.id))||current).net)!==Number(customer.net)){error.hidden=false;error.textContent='Údaje se mezitím změnily. Zavři dialog a otevři jej znovu.';return}
   Object.assign(source,values);if(current.mergedV51){Object.assign(source.original||{},values);const child=rows().find(x=>String(x.id)===String(customer.id));if(child)Object.assign(child,values)}window.save();window.render();d.close();decorateDetail(parent.id);renderStats();renderHome();
  };
 }

 let homeSignature='';
 function home(){const panel=create('section',null,'ops-home');panel.id='opsHome';document.querySelector('.work-area').before(panel);renderHome();setInterval(renderHome,3000)}
 function renderHome(){
  const root=$('opsHome');if(!root)return;const o=options(),signature=JSON.stringify([o,rows(),navigator.onLine,window.PZSync?.status,M.day(new Date())]);if(signature===homeSignature)return;homeSignature=signature;root.replaceChildren();
  if(o.tomorrow){const tomorrow=M.day(M.add(new Date(),1)),list=M.period(rows(),{from:tomorrow,to:tomorrow},'planned');const b=button('Zítra · '+M.summary(list).stops+' rozvozů',()=>showDay(tomorrow),'ops-home-button');b.id='opsTomorrow';root.append(b)}
  if(o.conflicts){const pairs=M.conflicts(rows()).filter(p=>p.a.date>=M.day(M.add(new Date(),-1))||p.b.date>=M.day(M.add(new Date(),-1)));if(pairs.length)root.append(button('Časové překryvy · '+pairs.length,()=>{const d=dialog('Kontrola návaznosti');d.append(create('p','Odhad pro jednoho řidiče včetně nakládky a návratu. Chybějící trasy nelze zkontrolovat.','ops-muted'));for(const p of pairs){d.append(create('p',p.a.name+' × '+p.b.name+' · překryv '+p.minutes+' min'));rideList(d,[p.a,p.b])}},'ops-home-button ops-alert'))}
  if(o.sync){const s=window.PZSync?.status;const badge=create('div',null,'ops-sync');badge.setAttribute('role','status');badge.textContent=!navigator.onLine?'Bez internetu · změny čekají v zařízení':s?.fatal||s?.error?'Synchronizace vyžaduje pozornost':s?.conflicts?'Synchronizace · '+s.conflicts+' konfliktů':s?.working?'Synchronizuji…':s?.queued?'Čeká k odeslání: '+s.queued:s?.lastSync?'Synchronizováno '+new Date(s.lastSync).toLocaleString('cs-CZ'):'Uloženo v zařízení · cloud zatím nepotvrzen';const b=button('Podrobnosti',()=>{$('settingsToolBtn').click();const p=$('pzSyncSection')||document.querySelector('.pz-sync-section');if(p){p.open=true;p.scrollIntoView({block:'start'})}});badge.append(b);root.append(badge)}
  root.hidden=!(o.tomorrow||o.conflicts||o.sync);
 }
 function showDay(initial){const d=dialog('Příprava rozvozů'),i=create('input');i.type='date';i.value=initial;i.setAttribute('aria-label','Den rozvozů');d.append(i);const list=create('div');d.append(list);const paint=()=>{list.replaceChildren();const rs=M.period(rows(),{from:i.value,to:i.value},'planned').sort((a,b)=>String(a.time||'99').localeCompare(String(b.time||'99')));const s=M.summary(rs);list.append(create('p',s.trips+' jízd · '+s.stops+' zákazníků · '+num(rs.flatMap(M.customers).reduce((n,r)=>n+Number(r.volumeM3||0),0))+' m³ z vyplněných údajů','ops-muted'));rideList(list,rs);for(const r of rs){const count=M.customers(r).reduce((n,s)=>n+(s.documents||[]).length,0);list.append(create('p',(r.name||'Jízda')+' · '+count+' příloh (otevřít přes Detail)','ops-muted'))}};i.onchange=paint;paint()}
 function statistics(){
  const wrap=$('v48Stats').querySelector('.v48-wrap'),old=create('details',null,'ops-legacy');old.append(create('summary','Podrobné časové statistiky · samostatný výběr období'));
  [...wrap.children].filter(e=>!e.classList.contains('v48-head')).forEach(e=>old.append(e));
  const root=create('div');root.id='opsStats';wrap.append(root,old);
  $('statsToolBtn').addEventListener('click',()=>{mode=options().period;chart=options().chart;anchor=new Date();renderStats()});
  window.addEventListener('pz-cloud-data',()=>{renderStats();renderHome()});
 }
 function drill(title,list){const d=dialog(title);rideList(d,list)}
 function renderStats(){
  const root=$('opsStats');if(!root)return;root.replaceChildren();const range=M.bounds(mode,anchor,customFrom,customTo);
  const controls=create('section',null,'ops-card');const tabs=create('div',null,'ops-tabs');for(const [v,t] of [['day','Den'],['week','Týden'],['month','Měsíc'],['year','Rok'],['custom','Vlastní']]){const b=button(t,()=>{mode=v;renderStats()});b.setAttribute('aria-pressed',String(mode===v));tabs.append(b)}controls.append(tabs);
  const nav=create('div',null,'ops-period');const shift=n=>{if(mode==='month')anchor=new Date(anchor.getFullYear(),anchor.getMonth()+n,1);else if(mode==='year')anchor=new Date(anchor.getFullYear()+n,0,1);else anchor=M.add(anchor,n*(mode==='week'?7:1));renderStats()};if(mode!=='custom'){nav.append(button('‹',()=>shift(-1)),create('strong',range?date(range.from)+' – '+date(range.to):'Období'),button('›',()=>shift(1)));controls.append(nav,button('Aktuální období',()=>{anchor=new Date();renderStats()}))}else{const c=create('div',null,'ops-form-grid');for(const [key,label] of [['from','Od'],['to','Do']]){const l=create('label',label),i=create('input');i.type='date';i.value=key==='from'?customFrom:customTo;i.onchange=()=>{if(key==='from')customFrom=i.value;else customTo=i.value;renderStats()};l.append(i);c.append(l)}controls.append(c)}root.append(controls);if(!range){root.append(create('p','Vyber platné datum od–do.','ops-warning'));return}
  const completed=M.period(rows(),range),planned=M.period(rows(),range,'planned'),s=M.summary(completed),prev=M.summary(M.period(rows(),range.previous));
  const intro=create('p','Dokončené jízdy · '+date(range.from)+' – '+date(range.to)+'. Plánované částky jsou uvedeny zvlášť.','ops-muted');root.append(intro);
  const kpis=create('div',null,'ops-kpis');const diff=(now,old)=>old?((now-old)/old*100).toLocaleString('cs-CZ',{maximumFractionDigits:0})+' % oproti předchozímu období':old===0&&now>0?'Předchozí období bez hodnot':'Beze změny';
  for(const [title,value,note,list] of [['Dokončené jízdy',s.trips,s.stops+' zákazníků · '+diff(s.trips,prev.trips),completed],['Doprava bez DPH',s.transportKnown?money(s.transport):'Neuvedeno','Chybějící ceny: '+s.transportMissing+' · '+(s.transportKnown&&prev.transportKnown?diff(s.transport,prev.transport):'Srovnání jen z vyplněných cen'),completed.filter(r=>M.customers(r).some(x=>x.transportNet!=null))],['Kilometry',num(s.km)+' km','Údaje uložené u jízd · '+diff(s.km,prev.km),completed],['Měřený čas',s.timeKnown?duration(s.ms):'Bez měření',s.timeKnown+' z '+s.trips+' jízd s měřením',completed.filter(r=>M.measured(r)!=null)],['Zbývá uhradit',money(s.due)+' s DPH',s.paymentUnknown+' úhrad neověřeno · celá objednávka',completed.filter(r=>M.customers(r).some(x=>M.payments(x).due>0))]]){const b=button('',()=>drill(title,list),'ops-kpi');b.append(create('small',title),create('strong',String(value)),create('span',note));kpis.append(b)}root.append(kpis);
  const ps=M.summary(planned);root.append(button('Plánované: '+ps.trips+' jízd · doprava '+(ps.transportKnown?money(ps.transport):'neuvedena')+' bez DPH',()=>drill('Plánované jízdy',planned),'ops-planned'));
  const graph=create('section',null,'ops-card');graph.append(create('h3','Vývoj rozvozů'));const metric=create('select');metric.setAttribute('aria-label','Veličina grafu');for(const [v,t] of [['trips','Počet dokončených jízd'],['transport','Doprava bez DPH (Kč)'],['km','Kilometry']]){const o=create('option',t);o.value=v;metric.append(o)}metric.value=chart;metric.onchange=()=>{chart=metric.value;renderStats()};graph.append(metric);
  const buckets=new Map(),monthly=mode==='year'||(Date.parse(range.to)-Date.parse(range.from)>93*86400000);
  for(let d=new Date(range.from+'T12:00:00'),end=new Date(range.to+'T12:00:00');d<=end;d=monthly?new Date(d.getFullYear(),d.getMonth()+1,1,12):M.add(d,1)){const key=M.day(d).slice(0,monthly?7:10);buckets.set(key,[])}
  for(const r of completed){const k=r.date.slice(0,monthly?7:10);if(buckets.has(k))buckets.get(k).push(r)}const data=[...buckets].map(([k,rs])=>({k,rs,s:M.summary(rs)})),max=Math.max(1,...data.map(b=>chart==='trips'?b.s.trips:chart==='km'?b.s.km:b.s.transport));
  const chartBox=create('div',null,'ops-chart');for(const b of data){const value=chart==='trips'?b.s.trips:chart==='km'?b.s.km:b.s.transport,bar=button('',()=>drill(b.k,b.rs),'ops-bar');bar.setAttribute('aria-label',b.k+': '+num(value)+(chart==='transport'?' Kč bez DPH':chart==='km'?' km':' jízd'));bar.title=bar.getAttribute('aria-label');const fill=create('i');fill.style.height=(value?Math.max(3,value/max*110):0)+'px';bar.append(create('small',value?num(value):'0'),fill,create('span',monthly?b.k.slice(5):b.k.slice(8)));chartBox.append(bar)}graph.append(chartBox,create('p','Klepnutím na sloupec otevřeš jízdy. Cena dopravy vychází pouze z vyplněných částek.','ops-muted'));root.append(graph);
  const vehicles=create('section',null,'ops-card');vehicles.append(create('h3','Soupravy'));for(const v of ['AK','TRM','TRMS','TRV','TRVS']){const rs=completed.filter(r=>r.vehicle===v),s=M.summary(rs);vehicles.append(button(v+' · '+s.trips+' jízd · '+num(s.km)+' km · '+(s.transportKnown?money(s.transport):'cena neuvedena'),()=>drill('Souprava '+v,rs),'ops-vehicle'))}root.append(vehicles);
 }
 function init(){settings();form();detail();home();statistics();paintVisibility();load();window.addEventListener('pz-ride-saved',()=>setTimeout(()=>{renderHome();renderStats()},300));}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
