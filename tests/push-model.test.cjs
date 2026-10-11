const {test}=require('node:test'), assert=require('node:assert/strict');
const {records,delta}=require('../push-model');
const ride={id:11,date:'2026-11-03',time:'10:30',name:'Novák',vehicle:'TRM',address:'Jičín',net:2000,status:'planned'};
test('full independent ride payload and START suppression',()=>{
 assert.equal(records([ride],[])[0].enabled,true);
 assert.deepEqual(records([ride],[])[0],{id:'11',name:'Novák',vehicle:'TRM',address:'Jičín',net:2000,date:'2026-11-03',time:'10:30',enabled:true});
 assert.equal(records([ride],[11])[0].enabled,false);
});
test('cancelled, completed, undetermined or trashed rides never notify',()=>{
 for(const change of [{status:'completed'},{status:'cancelled'},{time:''},{time:'25:00'},{timeUndetermined:true},{dateUndetermined:true},{trashedAt:1}]) assert.equal(records([{...ride,...change}],[])[0].enabled,false);
});
test('merge gives each customer one payload, parent vehicle/date, no duplicate child',()=>{
 const parent={...ride,id:20,mergedV51:true,date:'2026-11-04',vehicle:'TRVS',stops:[{...ride,childId:11},{...ride,childId:12,time:'11:00'},{...ride,childId:13,skipped:true}]};
 const list=records([parent,{...ride,mergedParentId:20}],[]);
 assert.deepEqual(list.map(r=>r.id),['11','12']); assert.equal(list[0].vehicle,'TRVS');assert.equal(list[0].date,'2026-11-04');
 assert.ok(records([parent],[20]).every(r=>!r.enabled));
});
test('only locally changed rides get uploaded; deletions are explicit',()=>{
 const prior=records([ride],[]);assert.deepEqual(delta(prior,prior),{changes:[],removed:[]});
 const next=records([{...ride,time:'12:00'}],[]);assert.equal(delta(next,prior).changes.length,1);
 assert.deepEqual(delta([],prior),{changes:[],removed:['11']});
 assert.deepEqual(delta(prior,[]).removed,[]);
});
