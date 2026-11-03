(function(root) {
 'use strict';
 // The scheduling protocol uses date/time for the reminder anchor. Keep the
 // original delivery fields on the ride; never mutate customer delivery times.
 function departure(r, parent) {
  const date = parent?.date || r.date || '', time = r.time || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  let minutes = r.routeOutMinutes ?? r.routeMinutes ?? (r.routeDurationSeconds == null ? null : Math.ceil(r.routeDurationSeconds / 60));
  if (parent) {
   // One departure for the whole merged run, anchored at the first active stop.
   const first = (parent.stops || []).find(s => !s.skipped);
   if (!first || first !== r) return null;
   const seconds = parent.routeV51?.segments?.[0]?.seconds;
   minutes = seconds == null ? null : Math.ceil(seconds / 60);
  }
  if (minutes == null || !Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
  const [y,m,d] = date.split('-').map(Number), [h,min] = time.split(':').map(Number);
  const format = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall = date+' '+time, local = Date.UTC(y,m-1,d,h,min);
  // Resolve Czech wall time independently of the device zone, choosing the
  // later occurrence in autumn just like PostgreSQL. Skip nonexistent times.
  const candidates = [60,120].map(offset=>local-offset*60000).filter(epoch=>format.format(new Date(epoch))===wall);
  if (!candidates.length) return null;
  const value = new Date(Math.max(...candidates)-Math.ceil(Number(minutes))*60000), parts=format.format(value).split(' ');
  return {date:parts[0],time:parts[1]};
 }
 function records(rides, activeIds) {
  const active = new Set((activeIds || []).map(String)), output = [];
  const add = (r, id, parent, running) => {
   const net = Number(r.net || 0), anchor = departure(r, parent);
   output.push({ id: String(id), name: String(r.name || ''), address: String(r.address || ''), vehicle: String(parent?.vehicle || r.vehicle || ''),
    payment: String(r.payment || ''), orderNo: String(r.orderNo || ''), net: Number.isFinite(net) ? net : 0, date: anchor?.date || String(parent?.date || r.date || ''), time: anchor?.time || String(r.time || ''),
    enabled: !!anchor && (parent?.status || r.status) === 'planned' && !running && !r.trashedAt && !r.dateUndetermined && !r.timeUndetermined && !parent?.dateUndetermined && !parent?.timeUndetermined && /^\d{4}-\d{2}-\d{2}$/.test(parent?.date || r.date || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time || '') });
  };
  for (const r of rides || []) {
   if (r.mergedParentId) continue;
   const running = active.has(String(r.id));
   if (r.mergedV51 && Array.isArray(r.stops)) {
    for (const s of r.stops) if (!s.skipped) add(s, s.childId, r, running || active.has(String(s.childId)));
   } else add(r, r.id, null, running);
  }
  return output.sort((a,b)=>a.id.localeCompare(b.id));
 }
 function delta(current, previous) {
  const old = new Map((previous || []).map(r => [r.id, JSON.stringify(r)]));
  const ids = new Set(current.map(r => r.id));
  return { changes: current.filter(r => old.get(r.id) !== JSON.stringify(r)), removed: [...old.keys()].filter(id => !ids.has(id)) };
 }
 const api = { records, delta, departure };
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
 else root.PZPushModel = api;
})(typeof window === 'undefined' ? globalThis : window);
