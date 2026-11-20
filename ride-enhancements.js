(function(){
 'use strict';
 const $=id=>document.getElementById(id), clean=x=>String(x||'').trim();
 const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const optionsKey='evidenceRozvozu_contactOptions';
 const options=()=>({picker:true,suggest:true,...read(optionsKey)});
 const fold=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs');
 const digits=x=>clean(x).replace(/\D/g,'').replace(/^00420/,'420').replace(/^420(?=\d{9}$)/,'');
 function contacts(){
  const rows=[];
  // Both apps live on the same GitHub Pages origin. Read only archived
  // customers from the configurator, never its drafts or account credentials.
  for(const r of read('pzCalculationRecordsV1')||[]){
   if(r.type!=='archive')continue;
   const c=r.snapshot?.contact||r.snapshot?.customer||r.contact||r;
   const i=r.snapshot?.inputs||r.snapshot?.state?.inputs||{};
   rows.push({name:c.name||c.customer||r.customer||i['pz-contact-name'],phone:c.phone||r.phone||(i['pz-contact-phone']?clean(i['pz-contact-phone-prefix'])+' '+i['pz-contact-phone']:''),address:c.address||r.address||i['pz-contact-address'],updatedAt:r.archivedAt||r.updatedAt||0});
  }
  for(const r of read('evidenceRozvozu_v4')||[]){
   if(r.trashedAt||r.status==='cancelled')continue;
   if(r.mergedV51)rows.push(...(r.stops||[]).filter(s=>!s.skipped));else rows.push(r);
  }
  rows.sort((a,b)=>(b.updatedAt||Number(b.id)||0)-(a.updatedAt||Number(a.id)||0));
  const unique=new Map();
  for(const r of rows){if(!clean(r.phone))continue;const key=digits(r.phone)+'|'+fold(r.name);if(!unique.has(key))unique.set(key,{name:clean(r.name),phone:clean(r.phone),address:clean(r.address)})}
  return [...unique.values()];
 }
 function setup(){
  const phone=$('fPhone'),name=$('fName'),address=$('fAddress');if(!phone||!name)return;
  const field=phone.closest('.field'),row=document.createElement('div');row.className='ride-contact-row';phone.before(row);row.append(phone);
  const picker=document.createElement('button');picker.type='button';picker.className='ride-contact-pick';picker.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="16" height="18" rx="2"/><path d="M3 7h2M3 12h2M3 17h2"/><circle cx="13" cy="10" r="2"/><path d="M9 17c.5-2 7.5-2 8 0"/></svg>';picker.setAttribute('aria-label','Vybrat kontakt z telefonu');picker.title='Vybrat kontakt z telefonu';row.append(picker);
  const list=document.createElement('div');list.className='ride-contact-results';list.hidden=true;list.setAttribute('aria-label','Nabízené kontakty');field.append(list);
  const hide=()=>{list.hidden=true;phone.setAttribute('aria-expanded','false')};phone.setAttribute('aria-expanded','false');
  async function assign(c,fromPhone=false){
   const target={fPhone:c.phone,fName:c.name,fAddress:c.address};
   const replace=Object.entries(target).some(([id,v])=>v&&clean($(id)?.value)&&(id==='fPhone'?digits($(id).value)!==digits(v):fold($(id).value)!==fold(v)));
   if(replace){
    if(fromPhone)trace('CONFIRM','Kontakt se vrátil. Čekám na potvrzení přepsání údajů.');
    const message='Některé údaje jsou již vyplněné. Nahradit jméno a telefon údaji vybraného kontaktu?';
    const accepted=fromPhone?(window.v52Confirm?await window.v52Confirm('Použít vybraný kontakt?',message):await choose('Použít vybraný kontakt?',[{label:'Nahradit údaje',value:'yes'},{label:'Zachovat původní údaje',value:'no'}],message)==='yes'):confirm('Některé údaje jsou již vyplněné. Nahradit je údaji vybraného kontaktu?');
    if(!accepted){if(fromPhone)trace('CANCELLED','Přepsání údajů nebylo potvrzené.');return false;}
   }
   if(!$('formModal').classList.contains('show')){if(fromPhone)trace('FORM-CLOSED','Kontakt se vrátil, ale formulář nové jízdy už není otevřený.',true);return false;}
   for(const [id,value] of Object.entries(target)){if(!value||!$(id))continue;$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}))}
   hide();return true;
  }
  function suggest(input=phone){
   hide();if(!options().suggest)return;
   const query=fold(input.value),number=digits(input.value);if(query.length<2)return;
   const matches=contacts().filter(c=>fold(c.name).includes(query)||fold(c.phone).includes(query)||(number.length>=2&&digits(c.phone).includes(number))).slice(0,8);
   input.closest('.field').append(list);list.replaceChildren();for(const c of matches){const b=document.createElement('button');b.type='button';const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=c.name||'Zákazník';sub.textContent=[c.phone,c.address].filter(Boolean).join(' · ');b.append(title,sub);b.addEventListener('pointerdown',e=>e.preventDefault());b.onclick=()=>assign(c);list.append(b)}list.hidden=!matches.length;phone.setAttribute('aria-expanded',String(!!matches.length));
  }
  for(const input of [phone,name]){input.addEventListener('input',()=>suggest(input));input.addEventListener('focus',()=>suggest(input))}phone.addEventListener('keydown',e=>{if(e.key==='Escape')hide();if(e.key==='ArrowDown'&&!list.hidden){e.preventDefault();list.querySelector('button')?.focus()}});
  document.addEventListener('click',e=>{if(!field.contains(e.target)&&!name.closest('.field').contains(e.target))hide()});
  new MutationObserver(()=>{if(!$('formModal').classList.contains('show'))hide()}).observe($('formModal'),{attributes:true,attributeFilter:['class']});
  const feedback=document.createElement('p');feedback.className='ride-contact-feedback';feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');field.append(feedback);
  let stage='READY',selectPending=false,editRevision=0,requestNumber=0,banner=null;
  function report(text,error=false){
   feedback.textContent=text+' [K2-'+stage+']';feedback.hidden=false;feedback.dataset.error=String(error);
   if(stage!=='READY'&&stage!=='OPEN'&&!$('formModal').classList.contains('show')){
    if(!banner){banner=document.createElement('div');banner.className='ride-contact-diagnostic';banner.setAttribute('role','status');banner.setAttribute('style','position:fixed;left:12px;right:12px;bottom:20px;z-index:90000;padding:14px;border:1px solid #b9cdb6;border-radius:12px;background:#fff;color:#104c29;font:13px/1.5 sans-serif;box-shadow:0 6px 24px #0003');document.body.append(banner)}
    banner.textContent=feedback.textContent;banner.hidden=false;
   }else if(banner)banner.hidden=true;
  }
  function trace(next,text,error=false){stage=next;report(text,error)}
  trace('READY','Výběr kontaktů připraven.');
  for(const input of [phone,name])input.addEventListener('input',e=>{if(e.isTrusted)editRevision++});
  function checkReturn(){const current=requestNumber;setTimeout(()=>{if(selectPending&&requestNumber===current)trace('WAITING','Telefon se vrátil, ale zatím nepředal výsledek výběru kontaktu.',true)},1500)}
  window.addEventListener('focus',()=>{if(selectPending)checkReturn()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&selectPending)checkReturn()});
  function choose(title,items,description=''){
   return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='archive-import-dialog ride-phone-choice';dialog.setAttribute('aria-label',title);
    const head=document.createElement('div');head.className='archive-import-head';const h=document.createElement('h2');h.textContent=title;
    const close=document.createElement('button');close.type='button';close.className='archive-import-close';close.textContent='×';close.setAttribute('aria-label','Zavřít');close.onclick=()=>dialog.close();head.append(h,close);dialog.append(head);
    if(description){const p=document.createElement('p');p.textContent=description;dialog.append(p)}
    let value=null;for(const item of items){const b=document.createElement('button');b.type='button';b.className='archive-import-result';b.textContent=item.label;if(item.phone)b.dataset.phone=item.value;b.onclick=()=>{value=item.value;dialog.close()};dialog.append(b)}
    dialog.addEventListener('close',()=>{dialog.remove();resolve(value)},{once:true});document.body.append(dialog);dialog.showModal();
   });
  }
  const values=value=>(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string').map(clean).filter(Boolean);
  picker.onclick=async()=>{
   hide();
   if(!navigator.contacts?.select){stage='UNSUPPORTED';report('Výběr kontaktů z telefonu zde není dostupný. Otevři Evidenci v Chromu na Androidu; našeptávání uložených zákazníků funguje i bez tohoto přístupu.',true);return}
   if(picker.disabled)return;picker.disabled=true;selectPending=true;requestNumber++;trace('OPEN','Otevírám kontakty telefonu…');
   try{
    const selected=await navigator.contacts.select(['name','tel'],{multiple:false}),contact=selected?.[0];
    selectPending=false;
    if(!contact){trace('EMPTY','Telefon dokončil výběr, ale nepředal žádný kontakt. Návrat: '+(Array.isArray(selected)?'seznam o délce '+selected.length:typeof selected)+'.',true);return}
    trace('RETURN','Kontakt se vrátil. Telefonní pole: '+(Array.isArray(contact.tel)?'seznam o délce '+contact.tel.length:typeof contact.tel)+'.');
    const phones=[...new Map(values(contact.tel).filter(v=>/\d/.test(v)).map(v=>[digits(v),v])).values()];
    if(!phones.length){stage='NO-NUMBER';report('Vybraný kontakt neobsahuje dostupné telefonní číslo. Vyber jiný kontakt nebo při výběru povol sdílení čísla.',true);return}
    if(phones.length>1)trace('NUMBER-CHOICE','Kontakt obsahuje více čísel. Čekám na výběr čísla.');
    const name=values(contact.name)[0]||'',phone=phones.length===1?phones[0]:await choose('Vyber telefonní číslo',phones.map(value=>({label:value,value,phone:true})),name);
    if(!phone){trace('CANCELLED','Výběr čísla byl zrušený.');return}
    if(await assign({name,phone},true)){
     const revision=editRevision,current=requestNumber;
     const verify=()=>{if(requestNumber!==current||editRevision!==revision||!$('formModal').classList.contains('show'))return;
      if(digits($('fPhone')?.value)!==digits(phone)||(name&&fold($('fName')?.value)!==fold(name)))trace('RESET','Vyplnění proběhlo, ale hodnotu pole potom změnila jiná část formuláře.',true);
      else trace('FILLED','Telefon'+(name?' a jméno':'')+' byly doplněny z kontaktu.');
     };verify();setTimeout(verify,250);setTimeout(verify,1200);
    }
   }catch(e){
    if(e?.name==='AbortError')trace('ABORT','Telefon ukončil výběr bez předání kontaktu.');
    else{const code=['NotAllowedError','SecurityError','TypeError','NotSupportedError','InvalidStateError'].includes(e?.name)?e.name:'OtherError';trace('ERROR-'+code,'Kontakt se nepodařilo načíst. Zkus výběr znovu a povol sdílení telefonního čísla.',true)}
   }
   finally{selectPending=false;picker.disabled=false}
  };
  const settings=$('v80SettingsHome')||$('v80Settings');
  if(settings){const panel=document.createElement('details');panel.className='ride-options';const summary=document.createElement('summary');summary.textContent='Kontakty a zákazníci';panel.append(summary);for(const [key,label] of [['picker','Výběr kontaktů z telefonu'],['suggest','Našeptávání uložených zákazníků']]){const l=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=options()[key];input.onchange=()=>{localStorage.setItem(optionsKey,JSON.stringify({...options(),[key]:input.checked}));refresh()};l.append(input,document.createTextNode(label));panel.append(l)}settings.append(panel)}
  function refresh(){picker.hidden=!options().picker;if(!options().suggest)hide()}refresh();
  // Show the actual notification anchor alongside the existing loading plan.
  const note=document.createElement('p');note.className='ride-departure-note';note.setAttribute('role','status');$('v39Planning')?.append(note);
  function preview(){
   const seconds=clean($('v39Out')?.textContent),time=$('fTime')?.value,date=$('fDate')?.value;
   if(!seconds||seconds==='Vyber adresu'||!time||!date||$('v72DateUnknown')?.checked||$('v72TimeUnknown')?.checked){note.textContent='Oznámení se naplánují až po určení data, času doručení a trasy z mapy.';return}
   const h=seconds.match(/(\d+)\s*h/),m=seconds.match(/(\d+)\s*min/),minutes=(h?+h[1]*60:0)+(m?+m[1]:0);
   const anchor=window.PZPushModel.departure({date,time,routeOutMinutes:minutes});
   note.textContent=anchor?`Odjezd pro oznámení: ${anchor.time}${anchor.date!==date?' ('+anchor.date+')':''}. Předstih se počítá od odjezdu, bez nakládky a rezervy.`:'';
  }
  const plan=$('v39Planning');if(plan)new MutationObserver(preview).observe(plan,{subtree:true,childList:true,characterData:true});
  // Avoid observing the note itself, which would create a mutation loop.
  if(plan){note.remove();plan.after(note)}
  for(const id of ['fTime','fDate','v72DateUnknown','v72TimeUnknown'])$(id)?.addEventListener('change',preview);preview();
 }
 // Keep the install prompt tied to a user gesture; never claim installation
 // succeeded just because Chrome accepted the prompt.
 let installPrompt;
 const button=document.createElement('button');button.type='button';button.className='ride-install';button.textContent='Nainstalovat Evidenci';button.hidden=true;
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;button.hidden=false});
 window.addEventListener('appinstalled',()=>{installPrompt=null;button.hidden=true});
 button.onclick=async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;button.hidden=true;await prompt.prompt();await prompt.userChoice};
 function start(){document.getElementById('v80SettingsHome')?.append(button);setup()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

