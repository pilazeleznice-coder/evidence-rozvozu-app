(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PZOperationsModel=api;})(globalThis,()=>{
 'use strict';
 const money=x=>Math.round((Number(x)||0)*100)/100;
 const positive=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
 const day=d=>{const t=new Date(d);return [t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0')].join('-')};
 const add=(d,n)=>{const t=new Date(d);t.setDate(t.getDate()+n);return t};
 function bounds(mode,anchor=new Date(),from,to){
  const a=new Date(anchor);a.setHours(0,0,0,0);let start,end;
  if(mode==='custom'){start=new Date(from+'T00:00:00');end=add(new Date(to+'T00:00:00'),1)}
  else if(mode==='day'){start=a;end=add(a,1)}
  else if(mode==='week'){start=add(a,-(a.getDay()+6)%7);end=add(start,7)}
  else if(mode==='year'){start=new Date(a.getFullYear(),0,1);end=new Date(a.getFullYear()+1,0,1)}
  else{start=new Date(a.getFullYear(),a.getMonth(),1);end=new Date(a.getFullYear(),a.getMonth()+1,1)}
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)return null;
  // Compare the same number of calendar days for a custom range.
  let previousStart,previousEnd=start;
  if(mode==='month')previousStart=new Date(start.getFullYear(),start.getMonth()-1,1);
  else if(mode==='year')previousStart=new Date(start.getFullYear()-1,0,1);
  else{const days=Math.round((Date.UTC(end.getFullYear(),end.getMonth(),end.getDate())-Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86400000);previousStart=add(start,-days)}
  return {from:day(start),to:day(add(end,-1)),previous:{from:day(previousStart),to:day(add(previousEnd,-1))}};
 }
 const phone=x=>String(x||'').replace(/\D/g,'').replace(/^00420/,'420').replace(/^420(?=\d{9}$)/,'');
 const business=r=>Object.fromEntries(['cargo','volumeM3','unloadInstructions','transportNet','paymentState','paidGross'].map(k=>[k,r?.[k]??null]));
 function payments(r){
  const total=Math.round(positive(r.net)*1.21),state=r.paymentState|| (r.payment==='Zaplaceno předem'?'paid':'unknown');
  const paid=state==='paid'?total:state==='unpaid'?0:state==='partial'?Math.min(total,money(positive(r.paidGross))):null;
  return {state,total,paid,due:paid==null?null:money(total-paid)};
 }
 function journeys(rows){return (rows||[]).filter(r=>!r.trashedAt&&!r.mergedParentId&&r.status!=='merged-child')}
 function customers(r){return r.mergedV51?(r.stops||[]).filter(s=>!s.skipped).map(s=>({...s,...business({...s.original,...s}),date:r.date,status:r.status,vehicle:r.vehicle,parentId:r.id,id:s.childId})): [r]}
 function period(rows,range,status='completed'){return journeys(rows).filter(r=>r.status===status&&!r.dateUndetermined&&r.date>=range.from&&r.date<=range.to)}
 function measured(r){const d=r.actualDurations||r.durations||r.runDurations||{};const xs=['loading','outbound','unloading','payment','return'].map(k=>positive(d[k]));return xs.some(x=>x>0)?xs.reduce((s,x)=>s+x,0):null}
 function summary(rows){
  const stops=rows.flatMap(customers),known=stops.filter(s=>s.transportNet!==null&&s.transportNet!==''&&s.transportNet!==undefined&&Number.isFinite(Number(s.transportNet))),times=rows.map(measured).filter(x=>x!==null);
  return {trips:rows.length,stops:stops.length,transport:money(known.reduce((n,r)=>n+positive(r.transportNet),0)),transportKnown:known.length,transportMissing:stops.length-known.length,km:money(rows.reduce((n,r)=>n+positive(r.km),0)),ms:times.reduce((n,x)=>n+x,0),timeKnown:times.length,due:money(stops.reduce((n,r)=>n+(payments(r).due||0),0)),paymentUnknown:stops.filter(r=>payments(r).due==null).length};
 }
 function history(rows,number){const n=phone(number);if(n.length<6)return [];return journeys(rows).flatMap(r=>customers(r).map(s=>({...s,parentId:r.id}))).filter(s=>phone(s.phone)===n).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))}
 function interval(r){
  if(r.status!=='planned'||r.dateUndetermined||r.timeUndetermined||!r.date)return null;
  if(r.mergedV51){
   const first=(r.stops||[]).find(s=>!s.skipped),segments=r.routeV51?.segments||[],out=positive(segments[0]?.seconds)/60,total=positive(r.estimatedMinutes);
   if(!first||!out||!total||!/^\d{2}:\d{2}$/.test(first.time||'')||!Number.isFinite(Date.parse(r.date+'T00:00:00')))return null;
   const [h,m]=first.time.split(':').map(Number),arrival=Date.parse(r.date+'T00:00:00')+(h*60+m)*60000;
   // New merged rides store the same loading estimate as their plan. Legacy
   // parents without one remain unchecked rather than inventing a start time.
   if(r.plannedLoadMinutes==null)return null;
   const departure=arrival-out*60000,start=departure-(positive(r.plannedLoadMinutes)+positive(r.deliveryReserveMinutes))*60000;
   return {start,end:start+total*60000,departure};
  }
  if(!/^\d{2}:\d{2}$/.test(r.time||''))return null;
  const out=positive(r.routeOutMinutes??r.routeMinutes??r.routeDurationSeconds/60);if(!out)return null;
  if(!Number.isFinite(Date.parse(r.date+'T00:00:00')))return null;
  const [h,m]=r.time.split(':').map(Number),arrival=Date.parse(r.date+'T00:00:00')+(h*60+m)*60000;
  const load=positive(r.plannedLoadMinutes),reserve=positive(r.deliveryReserveMinutes),unload=positive(r.plannedUnloadMinutes),back=positive(r.routeBackMinutes??r.returnRouteMinutes??out);
  return {start:arrival-(out+load+reserve)*60000,end:arrival+(unload+back)*60000,departure:arrival-out*60000};
 }
 function conflicts(rows){const rs=journeys(rows).map(r=>({r,t:interval(r)})).filter(x=>x.t).sort((a,b)=>a.t.start-b.t.start),out=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length&&rs[j].t.start<rs[i].t.end;j++)out.push({a:rs[i].r,b:rs[j].r,minutes:Math.ceil((Math.min(rs[i].t.end,rs[j].t.end)-rs[j].t.start)/60000)});return out}
 function duplicate(r){return {name:r.name||'',phone:r.phone||'',address:r.address||'',net:r.net??'',payment:r.payment==='Zaplaceno předem'?'Hotově':r.payment||'Hotově',vehicle:r.vehicle||'AK',note:r.note||'',...business(r),paymentState:'unpaid',paidGross:0}}
 return {day,add,bounds,phone,business,payments,journeys,customers,period,summary,measured,history,interval,conflicts,duplicate};
});
