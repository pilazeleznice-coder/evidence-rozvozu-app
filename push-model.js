(function(root) {
 'use strict';
 function records(rides, activeIds) {
  const active = new Set((activeIds || []).map(String)), output = [];
  const add = (r, id, parent, running) => {
   const net = Number(r.net || 0);
   output.push({ id: String(id), name: String(r.name || ''), address: String(r.address || ''), vehicle: String(parent?.vehicle || r.vehicle || ''),
    payment: String(r.payment || ''), orderNo: String(r.orderNo || ''), net: Number.isFinite(net) ? net : 0, date: String(parent?.date || r.date || ''), time: String(r.time || ''),
    enabled: (parent?.status || r.status) === 'planned' && !running && !r.trashedAt && !r.dateUndetermined && !r.timeUndetermined && !parent?.dateUndetermined && !parent?.timeUndetermined && /^\d{4}-\d{2}-\d{2}$/.test(parent?.date || r.date || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time || '') });
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
 const api = { records, delta };
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
 else root.PZPushModel = api;
})(typeof window === 'undefined' ? globalThis : window);
