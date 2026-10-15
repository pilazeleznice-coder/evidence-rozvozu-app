const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../sync-model');
let n=0;const uuid=()=>String(++n),item=(payload)=>({'ride:1':{kind:'ride',id:'1',payload}});
const row=(revision,payload,deleted=false)=>({kind:'ride',id:'1',revision,payload,deleted});
test('offline outbox survives restart, stable key order, deletion and no inferred remote deletions',()=>{
 const s=M.empty('owner');M.capture(s,item({name:'A',date:'2030'}),uuid);const op=s.outbox['ride:1'];
 M.capture(s,item({date:'2030',name:'A'}),uuid);assert.equal(s.outbox['ride:1'].mutation_id,op.mutation_id);
 const restored=JSON.parse(JSON.stringify(s));M.acknowledge(restored,op,row(1,op.payload));M.capture(restored,{},uuid);assert.equal(restored.outbox['ride:1'].deleted,true);
 const fresh=M.empty('owner'),map={};M.receive(fresh,map,[row(10,{name:'remote'})]);M.capture(fresh,map,uuid);assert.equal(Object.keys(fresh.outbox).length,0);
});
test('edit during in-flight upload rebases on acknowledged revision without losing changes',()=>{
 const s=M.empty('owner');M.capture(s,item({name:'A'}),uuid);const op=structuredClone(s.outbox['ride:1']);M.capture(s,item({name:'B'}),uuid);M.acknowledge(s,op,row(7,op.payload));
 assert.equal(s.outbox['ride:1'].payload.name,'B');assert.equal(s.outbox['ride:1'].expected_revision,7);
});
test('concurrent edits preserve local copy and explicit remote/local choices',()=>{
 const s=M.empty('owner'),map={};M.receive(s,map,[row(1,{name:'A'})]);M.capture(s,item({name:'B'}),uuid);M.receive(s,map,[row(2,{name:'C'})]);
 assert.equal(s.outbox['ride:1'].payload.name,'B');assert.equal(s.conflicts['ride:1'].remote.payload.name,'C');
 const local=structuredClone(s);M.resolve(local,map,'ride:1','local',uuid);assert.equal(local.outbox['ride:1'].expected_revision,2);
 M.resolve(s,map,'ride:1','remote',uuid);assert.equal(map['ride:1'].payload.name,'C');assert.equal(Object.keys(s.outbox).length,0);
});
test('remote tombstones stop stale devices from resurrecting permanently deleted rides',()=>{
 const s=M.empty('owner');M.capture(s,item({name:'old'}),uuid);M.receive(s,{},[row(9,null,true)]);assert.ok(s.conflicts['ride:1']);
 const map=item({name:'old'});M.resolve(s,map,'ride:1','remote',uuid);assert.deepEqual(map,{});M.capture(s,map,uuid);assert.deepEqual(s.outbox,{});
});
test('identical replay clears outbox and cursor advances over conflicting rows',()=>{
 const s=M.empty('owner');M.capture(s,item({name:'A'}),uuid);M.receive(s,item({name:'A'}),[row(20,{name:'A'})]);assert.deepEqual(s.outbox,{});assert.equal(s.cursor,20);
 M.capture(s,item({name:'B'}),uuid);M.receive(s,{},[row(22,{name:'C'})]);assert.equal(s.cursor,22);assert.ok(s.conflicts['ride:1']);
});
