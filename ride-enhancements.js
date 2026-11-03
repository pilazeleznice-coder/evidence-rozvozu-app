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
  function assign(c){
   const target={fPhone:c.phone,fName:c.name,fAddress:c.address};
   if(Object.entries(target).some(([id,v])=>v&&clean($(id)?.value)&&(id==='fPhone'?digits($(id).value)!==digits(v):fold($(id).value)!==fold(v))) && !confirm('Některé údaje jsou již vyplněné. Nahradit je údaji vybraného kontaktu?'))return;
   for(const [id,value] of Object.entries(target)){if(!value||!$(id))continue;$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}))}
   hide();
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
  picker.onclick=async()=>{
   if(!navigator.contacts?.select){alert('Výběr kontaktů z telefonu zde není dostupný. Otevřete Evidenci přímo v Chromu na Androidu. Našeptávání uložených zákazníků funguje i bez přístupu ke kontaktům.');return}
   try{const chosen=await navigator.contacts.select(['name','tel'],{multiple:false});if(chosen?.[0])assign({name:chosen[0].name?.[0]||'',phone:chosen[0].tel?.[0]||''})}catch(e){if(e.name!=='AbortError')alert('Kontakt se nepodařilo načíst: '+e.message)}
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
