(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PZContactVcard=api;})(globalThis,()=>{
 'use strict';
 const MAX_BYTES=10*1024*1024,MAX_CONTACTS=5000;
 const clean=x=>String(x||'').replace(/\0/g,'').trim();
 const unescape=x=>clean(x).replace(/\\([nN,;\\])/g,(_,c)=>/[nN]/.test(c)?'\n':c);
 function split(value,separator=';'){
  const parts=[];let text='',escaped=false;
  for(const c of value){if(escaped){text+='\\'+c;escaped=false}else if(c==='\\')escaped=true;else if(c===separator){parts.push(text);text=''}else text+=c}
  if(escaped)text+='\\';parts.push(text);return parts;
 }
 function decode(value,params){
  const charset=clean(params.CHARSET||'utf-8').replace(/^"|"$/g,'');let bytes;
  if(/^QUOTED-PRINTABLE$/i.test(params.ENCODING||'')){
   const out=[];for(let i=0;i<value.length;){if(value[i]==='='&&/^[0-9a-f]{2}$/i.test(value.slice(i+1,i+3))){out.push(parseInt(value.slice(i+1,i+3),16));i+=3}else{const c=String.fromCodePoint(value.codePointAt(i));out.push(...new TextEncoder().encode(c));i+=c.length}}bytes=new Uint8Array(out);
  }else if(/^(B|BASE64)$/i.test(params.ENCODING||'')){
   try{bytes=Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))}catch{throw Error('Jméno ve vizitce má neplatné kódování.')}
  }
  if(bytes){try{return new TextDecoder(charset).decode(bytes)}catch{throw Error('Kódování jména ve vizitce není podporované. Vyexportuj kontakt v UTF-8.')}}return value;
 }
 function lines(text){
  const out=[];for(const raw of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
   const last=out.at(-1);
   if(last&&/;ENCODING="?QUOTED-PRINTABLE"?/i.test(last)&&last.endsWith('='))out[out.length-1]=last.slice(0,-1)+raw.replace(/^[ \t]/,'');
   else if(last&&/^[ \t]/.test(raw))out[out.length-1]+=raw.slice(1);
   else out.push(raw);
  }return out;
 }
 function parse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES)throw Error('Soubor kontaktů je příliš velký. Vyber soubor do 10 MB.');
  let current=null,seen=0;const contacts=[];
  for(const line of lines(text)){
   if(/^BEGIN:VCARD\s*$/i.test(line)){if(current)throw Error('Soubor kontaktů je poškozený.');current={names:[],structured:'',tel:[]};if(++seen>MAX_CONTACTS)throw Error('Soubor obsahuje příliš mnoho kontaktů. Vyexportuj menší výběr.');continue}
   if(/^END:VCARD\s*$/i.test(line)){
    if(!current)continue;const tel=[...new Map(current.tel.map(t=>[t.replace(/\D/g,''),t])).values()];
    if(tel.length)contacts.push({name:[current.names[0]||current.structured].filter(Boolean),tel});current=null;continue;
   }
   if(!current)continue;
   const colon=line.indexOf(':');if(colon<0)continue;const head=line.slice(0,colon).split(';'),property=head.shift().split('.').at(-1).toUpperCase();
   if(!['FN','N','TEL'].includes(property))continue;
   const params={};for(const item of head){const i=item.indexOf('=');if(i>0)params[item.slice(0,i).toUpperCase()]=item.slice(i+1).replace(/^"|"$/g,'')}
   const value=decode(line.slice(colon+1),params);
   if(property==='FN'){const name=unescape(value);if(name)current.names.push(name)}
   if(property==='N'){const p=split(value).map(unescape);current.structured=[p[3],p[1],p[2],p[0],p[4]].filter(Boolean).join(' ')}
   if(property==='TEL'){
    let number=unescape(value).replace(/^tel:/i,'');try{number=decodeURIComponent(number)}catch{}
    // URI parameters are not part of the dialable number.
    number=number.split(';')[0].replace(/[^\d+().\-\s]/g,'').trim();if((number.match(/\d/g)||[]).length>=3)current.tel.push(number);
   }
  }
  if(current)throw Error('Soubor kontaktů není úplný.');
  if(!seen)throw Error('Vybraný soubor není vizitka VCF.');
  if(!contacts.length)throw Error('Ve vybraném souboru není žádný kontakt s telefonním číslem.');return contacts;
 }
 function parseBuffer(buffer){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);if(bytes.byteLength>MAX_BYTES)throw Error('Soubor kontaktů je příliš velký. Vyber soubor do 10 MB.');
  const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';return parse(new TextDecoder(encoding).decode(bytes));
 }
 return {parse,parseBuffer,MAX_BYTES};
});
