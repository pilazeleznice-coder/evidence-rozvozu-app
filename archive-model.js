(function(root){
 'use strict';
 const clean=x=>String(x??'').trim(),fold=x=>clean(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function merge(local,cloud,tombstones=[]){
  const map=new Map(),deleted=new Set(tombstones.map(r=>r.id));
  for(const r of [...local,...cloud]){if(!r||typeof r.id!=='string')continue;if(r.type==='__deleted'||r.type==='tombstone'||r.deletedAt||r.type==='deleted'){deleted.add(r.id);continue}const old=map.get(r.id);if(!old||Number(r.updatedAt||0)>Number(old.updatedAt||0))map.set(r.id,r)}
  return [...map.values()].filter(r=>r.type==='archive'&&!deleted.has(r.id)).sort((a,b)=>(b.archivedAt||b.updatedAt||0)-(a.archivedAt||a.updatedAt||0));
 }
 function map(record){
  const s=record.snapshot||{},i=s.inputs||{},c=s.contact||record.contact||{},state=s.state||{},cart=Array.isArray(state.cart)?state.cart:[],delivery=cart.find(x=>x.type==='delivery');
  const phone=clean(c.phone||record.phone||[i['pz-contact-phone-prefix'],i['pz-contact-phone']].filter(Boolean).join(' '));
  const contactAddress=clean(c.address||i['pz-contact-address']||record.address);
  const deliveryAddress=delivery?[delivery.street,[delivery.postcode,delivery.city].filter(Boolean).join(' ')].filter(Boolean).join(', '):'';
  const address=deliveryAddress||[i['pz-delivery-street'],[i['pz-delivery-postcode'],i['pz-delivery-city']].filter(Boolean).join(' ')].filter(Boolean).join(', ')||contactAddress;
  const gross=Number(record.total),net=cart.length?cart.reduce((sum,it)=>{const d=it.type==='delivery',calc=it.calc||{},base=Number(d?(it.originalWithoutVat??it.priceWithoutVat??0):(calc.originalWithoutVat??calc.withoutVat??0));const own=Number(d?it.discountPct:(it.discountPct??calc.discountPct))||0,pct=own>0?own:Math.max(0,Math.min(100,Number(state.globalDiscount)||0)),mode=own>0?(it.adjustmentMode||calc.adjustmentMode||'discount'):(state.globalAdjustmentMode||'discount');return sum+base*(1-pct/100*(mode==='surcharge'?-1:1))},0):(Number.isFinite(gross)?gross/1.21:null);
  const vehicle={car:'AK','small-trailer':'TRM','small-trailer-unloading':'TRMS','large-trailer':'TRV','large-trailer-unloading':'TRVS'}[delivery?.deliveryType]||'';
  const notes=[record.kgNumber?`Objednávka ${record.kgNumber}`:'',c.company||i['pz-contact-company']||record.company,c.email||i['pz-contact-email']||record.email,(c.ico||i['pz-contact-ico'])?'IČO: '+(c.ico||i['pz-contact-ico']):'',(c.dic||i['pz-contact-dic'])?'DIČ: '+(c.dic||[i['pz-contact-dic-prefix'],i['pz-contact-dic']].filter(Boolean).join('')):'',contactAddress&&contactAddress!==address?'Kontaktní adresa: '+contactAddress:'',...cart.map(it=>it.note).filter(Boolean)].filter(Boolean).join('\n');
  // Archive timestamps are never delivery appointments. Only explicit saved
  // delivery appointment fields can populate date/time.
  const date=clean(delivery?.deliveryDate||i['pz-delivery-date']),time=clean(delivery?.deliveryTime||i['pz-delivery-time']);
  const adjusted=it=>{const calc=it.calc||{},base=Number(it.type==='delivery'?(it.originalWithoutVat??it.priceWithoutVat??0):(calc.originalWithoutVat??calc.withoutVat??0)),own=Number(it.discountPct??calc.discountPct)||0,pct=own>0?own:Math.max(0,Math.min(100,Number(state.globalDiscount)||0)),mode=own>0?(it.adjustmentMode||calc.adjustmentMode||'discount'):(state.globalAdjustmentMode||'discount');return base*(1-pct/100*(mode==='surcharge'?-1:1))};
  const wood=cart.filter(x=>x.type!=='delivery'),deliveries=cart.filter(x=>x.type==='delivery');
  const volumeM3=wood.some(x=>Number.isFinite(Number(x.calc?.met?.volume)))?wood.reduce((n,x)=>n+(Number(x.calc?.met?.volume)||0),0):null;
  const cargo=wood.map(x=>{const c=x.calc||{},v=c.vals||{};return [c.prod?.label||({tramy:'Trámy',prkna_stejna:'Prkna stejně široká',prkna_ruzne_3_5:'Prkna různých šířek'}[x.product])||x.product,x.material,[v.height,v.width].filter(Boolean).join(' × ')?[v.height,v.width].filter(Boolean).join(' × ')+' cm':'',v.length?v.length+' m':'',v.pieces?v.pieces+' ks':'',Number(c.met?.volume)>0?Number(c.met.volume).toLocaleString('cs-CZ',{maximumFractionDigits:3})+' m³':'',x.note].filter(Boolean).join(' · ')}).join('\n');
  const transportNet=deliveries.length?deliveries.reduce((n,x)=>n+adjusted(x),0):null;
  return {id:record.id,orderNo:clean(record.kgNumber),name:clean(c.name||i['pz-contact-name']||record.customer||c.company||record.company),phone,address,net:Number.isFinite(net)?net:null,vehicle,note:notes,date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',time:/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'',payment:clean(delivery?.payment||i['pz-payment']),hasItems:!!cart.length,cargo,volumeM3,transportNet,unloadInstructions:clean(delivery?.unloadInstructions)};
 }
 function search(rows,q){const query=fold(q),numbers=clean(q).replace(/\D/g,'');return rows.filter(r=>{const c=map(r);return [c.orderNo,c.name,c.phone,c.address].some(v=>fold(v).includes(query))||(numbers.length>=3&&c.phone.replace(/\D/g,'').includes(numbers))})}
 const api={merge,map,search};if(typeof module==='object'&&module.exports)module.exports=api;else root.PZArchiveModel=api;
})(globalThis);
