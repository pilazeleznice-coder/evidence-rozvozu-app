(function(){
 'use strict';
 const $=id=>document.getElementById(id),M=window.PZArchiveModel,KEY='evidenceRozvozu_contactOptions';
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
 const opts=()=>({import:true,pdf:true,cloud:true,documents:true,...read(KEY,{})});
 let client,selection=null,rows=[],serial=0,busy=false;
 function cloud(){if(!client)client=window.PZSupabase.createClient('https://nnuptyxxyceqwtxdjpbi.supabase.co','sb_publishable__CUybnOrIgbDA4gUiXfzHg_7YdAXEuZ',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return client}
 const make=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e};
 function start(){
  const dialog=make('dialog',null,'archive-import-dialog');dialog.setAttribute('aria-label','Načíst objednávku z konfigurátoru');
  const head=make('div',null,'archive-import-head'),title=make('h2','Objednávky z konfigurátoru'),close=make('button','×','archive-import-close');close.type='button';close.setAttribute('aria-label','Zavřít');head.append(title,close);
  const search=make('input');search.type='search';search.placeholder='Číslo KG, zákazník nebo telefon';search.setAttribute('aria-label',search.placeholder);
  const refresh=make('button','Obnovit seznam','archive-action');refresh.type='button';
  const status=make('p',null,'archive-import-status');status.setAttribute('role','status');const list=make('div',null,'archive-import-list');
  dialog.append(head,search,refresh,status,list);document.body.append(dialog);
  close.onclick=()=>{if(!busy){serial++;dialog.close()}};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else serial++});
  const opener=make('button','Načíst z konfigurátoru','archive-action');opener.type='button';opener.id='archiveImportOpen';$('formModal').querySelector('.form-grid').before(opener);
  const summary=make('p',null,'archive-import-summary');summary.hidden=true;opener.after(summary);
  const array=key=>{const value=read(key,[]);return Array.isArray(value)?value:[]},local=()=>array('pzCalculationRecordsV1'),tombs=()=>array('pzCalculationTombstonesV1');
  async function load(){
   const ticket=++serial;rows=M.merge(local(),[],tombs());render();status.textContent='Načítám místní Archiv…';refresh.disabled=true;
   try{
    if(!opts().cloud){status.textContent='Místní Archiv · cloud je vypnutý v Nastavení.';return}
    if(!navigator.onLine){status.textContent='Bez internetu · pouze místní Archiv. Cloudové změny zde nemusí být aktuální.';return}
    const {data,error}=await cloud().auth.getUser();if(error||!data?.user){status.textContent='Pouze místní Archiv. Pro cloud se přihlas ke konfigurátoru v Nastavení → Objednávky z konfigurátoru.';return}
    const remote=[];for(let offset=0;;offset+=500){const {data:page,error}=await cloud().from('configurations').select('id,data').eq('user_id',data.user.id).order('id').range(offset,offset+499);if(error)throw Error('Cloudový Archiv se nepodařilo načíst. Zkus to znovu.');remote.push(...page.map(x=>x.data).filter(Boolean));if(page.length<500)break;if(offset>=49500)throw Error('Archiv je příliš velký pro toto načtení. Kontaktuj správce.')}
    if(ticket!==serial||!dialog.open)return;rows=M.merge(local(),remote,tombs());render();status.textContent=`Cloud a zařízení · ${rows.length} objednávek v Archivu.`;
   }catch(e){if(ticket===serial)status.textContent=e.message+' Zobrazuji pouze místní Archiv.'}finally{if(ticket===serial)refresh.disabled=false}
  }
  opener.onclick=()=>{if(!opts().import)return;search.value='';dialog.showModal();load()};refresh.onclick=load;search.oninput=render;
  function render(){list.replaceChildren();const matches=M.search(rows,search.value);for(const r of matches.slice(0,100)){const c=M.map(r),b=make('button',null,'archive-import-result');b.type='button';const strong=make('strong',[c.orderNo,c.name].filter(Boolean).join(' · ')),small=make('small',[c.phone,c.address,c.net==null?'Cena chybí':c.net.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' Kč bez DPH'].filter(Boolean).join(' · '));b.append(strong,small);b.onclick=()=>apply(r);list.append(b)}if(!matches.length)list.append(make('p','Žádná odpovídající objednávka v Archivu.'));if(matches.length>100)list.append(make('p','Zobrazeno prvních 100 výsledků. Zpřesni hledání.'))}
  function set(id,value){const e=$(id);if(e&&value!==''&&value!=null){e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}}
  async function apply(record){
   if(busy)return;
   const data=M.map(record),fields={fName:data.name,fPhone:data.phone,fAddress:data.address,fNet:data.net,fVehicle:data.vehicle};
   if(Object.entries(fields).some(([id,v])=>id!=='fVehicle'&&(id!=='fNet'||Number($(id)?.value)!==0)&&v!==''&&v!=null&&$(id)?.value.trim()&&String($(id).value).trim()!==String(v).trim())&&!confirm('Načtená objednávka nahradí vyplněné údaje zákazníka, adresu, cenu, dopravu a poznámku. Pokračovat?'))return;
   busy=true;close.disabled=true;refresh.disabled=true;search.disabled=true;list.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent=opts().pdf?'Připravuji PDF objednávky…':'Načítám objednávku…';
   try{
    const context=data.hasItems?window.PZArchivePdf.context(record):null;
    let file;if(opts().pdf){if(!context)throw Error('Objednávka nemá položky potřebné pro vytvoření PDF. Pro načtení bez PDF vypni jeho přenos v Nastavení.');const blob=await context.create();file=new File([blob],(data.orderNo||'objednavka').replace(/[^a-zA-Z0-9_-]/g,'-')+'.pdf',{type:'application/pdf'})}
    if(file){const transfer=new DataTransfer();transfer.items.add(file);$('fDocuments').files=transfer.files;$('fDocuments').dispatchEvent(new Event('change',{bubbles:true}));await window.PZRideDocuments.ready();if(window.PZRideDocuments.failed())throw Error('PDF se nepodařilo uložit do zařízení. Uvolni místo a zkus to znovu.')}
    // Apply after PDF succeeds. Merely searching never creates or saves a ride.
    for(const [id,value] of Object.entries(fields))set(id,value);
    const notes=[data.note,context?.rows.map(r=>r.text).filter(x=>x.trim()).join('\n')].filter(Boolean).join('\n\n');set('fNote',notes);
    window.PZRideDocuments.setOrderNo?.(data.orderNo);
    window.PZOperations?.load({...data,cargo:data.cargo,volumeM3:data.volumeM3,transportNet:data.transportNet,paymentState:'unknown',paidGross:0});
    const du=$('v72DateUnknown'),tu=$('v72TimeUnknown');
    if(du){du.checked=!data.date;du.dispatchEvent(new Event('change',{bubbles:true}))}if(data.date)set('fDate',data.date);
    if(tu){tu.checked=!data.time;tu.dispatchEvent(new Event('change',{bubbles:true}))}if(data.time)set('fTime',data.time);
    if(data.payment&&[...$('fPayment').options].some(o=>o.value===data.payment))set('fPayment',data.payment);
    selection={id:record.id,kgNumber:data.orderNo,updatedAt:record.updatedAt};
    document.querySelectorAll('.ride-contact-results').forEach(e=>e.hidden=true);
    summary.hidden=false;summary.textContent=`Načteno ${data.orderNo||'z Archivu'}${file?' včetně PDF':''}. Zkontroluj údaje a doplň datum, čas, typ platby a ověř adresu v nabídce Mapy.com. Jízda zatím není uložená.`;
    serial++;dialog.close();
   }catch(e){status.textContent='Načtení se nezdařilo: '+e.message}finally{busy=false;close.disabled=false;refresh.disabled=false;search.disabled=false;render()}
  }
  const settings=$('v80SettingsHome'),panel=make('details',null,'ride-options');panel.id='archiveImportSettings';panel.append(make('summary','Objednávky z konfigurátoru a přílohy'));
  for(const [key,label] of [['import','Načítání objednávek z Archivu'],['cloud','Hledat také v cloudovém Archivu'],['pdf','Přiložit PDF při načtení objednávky'],['documents','Zobrazovat přikládání dokumentů']]){const row=make('label'),input=make('input');input.type='checkbox';input.checked=opts()[key];input.dataset.archiveOption=key;input.onchange=()=>{localStorage.setItem(KEY,JSON.stringify({...read(KEY,{}),[key]:input.checked}));paint()};row.append(input,document.createTextNode(label));panel.append(row)}
  const info=make('p','Cloud používá účet konfigurátoru. Pokud už jsi v tomto prohlížeči přihlášený, použije se jeho přihlášení.');panel.append(info);
  const auth=make('form'),email=make('input'),password=make('input'),login=make('button','Připojit účet konfigurátoru','archive-action'),authStatus=make('p');email.type='email';email.placeholder='E-mail účtu konfigurátoru';email.autocomplete='username';email.setAttribute('aria-label',email.placeholder);password.type='password';password.placeholder='Heslo ke konfigurátoru';password.autocomplete='current-password';password.setAttribute('aria-label',password.placeholder);login.type='submit';auth.append(email,password,login,authStatus);panel.append(auth);settings.append(panel);
  auth.onsubmit=async e=>{e.preventDefault();login.disabled=true;authStatus.textContent='Přihlašuji…';try{const {error}=await cloud().auth.signInWithPassword({email:email.value.trim(),password:password.value});if(error)throw Error('Přihlášení se nezdařilo. Ověř účet konfigurátoru.');password.value='';authStatus.textContent='Účet konfigurátoru je připojený.'}catch(e){authStatus.textContent=e.message}finally{login.disabled=false}};
  function paint(){opener.hidden=!opts().import;const upload=$('uploadCard');if(upload)upload.hidden=!opts().documents;document.documentElement.classList.toggle('ride-hide-upload',!opts().documents);auth.hidden=!opts().cloud}
  paint();$('addBtn').addEventListener('click',()=>{selection=null;summary.hidden=true});
  window.addEventListener('pz-ride-saved',e=>{if(!selection)return;const r=rides.find(r=>String(r.id)===String(e.detail.id));if(r){r.sourceConfiguration={...selection};r.orderNo=selection.kgNumber;save()}});
  const priorEdit=window.openEdit;window.openEdit=function(id){selection=null;summary.hidden=true;return priorEdit(id)};
  window.PZArchiveImport={selection:()=>selection,restoreSelection:value=>{selection=value||null}};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
