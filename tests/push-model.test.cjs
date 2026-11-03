const {test}=require('node:test'), assert=require('node:assert/strict');
const {records,delta}=require('../push-model');
const ride={id:11,date:'2026-11-03',time:'10:30',name:'Novák',vehicle:'TRM',address:'Jičín',net:2000,status:'planned',routeOutMinutes:30};
test('full independent ride payload and START suppression',()=>{
 assert.equal(records([ride],[])[0].enabled,true);
 assert.deepEqual(records([ride],[])[0],{payment:'',orderNo:'',id:'11',name:'Novák',vehicle:'TRM',address:'Jičín',net:2000,date:'2026-11-03',time:'10:00',enabled:true});
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

test('departure is delivery minus map travel, without loading/reserve',()=>{
 const r={...ride,time:'09:00',plannedLoadMinutes:20,deliveryReserveMinutes:10};
 assert.equal(records([r],[])[0].time,'08:30');assert.equal(r.time,'09:00');
 const {departure}=require('../push-model');assert.deepEqual(departure({...r,date:'2026-01-01',time:'00:10'},null),{date:'2025-12-31',time:'23:40'});
 assert.equal(records([{...r,routeOutMinutes:undefined}],[])[0].enabled,false);
 assert.equal(records([{...r,routeOutMinutes:NaN}],[])[0].enabled,false);
 assert.equal(records([{...r,routeOutMinutes:0}],[])[0].enabled,false);
 assert.equal(records([{...r,routeOutMinutes:undefined,routeDurationSeconds:1801}],[])[0].time,'08:29');
});
test('merged route notifies once at departure from the mill; START suppresses all stops',()=>{
 const parent={...ride,id:20,mergedV51:true,time:'09:00',routeV51:{segments:[{seconds:1800}]},stops:[{...ride,childId:11,time:'09:00'},{...ride,childId:12,time:'10:00'}]};
 const result=records([parent],[]);assert.equal(result[0].time,'08:30');assert.equal(result[0].enabled,true);assert.equal(result[1].enabled,false);
 assert.ok(records([parent],[20]).every(r=>!r.enabled));
});

test('Czech DST transition subtracts elapsed map duration regardless of device timezone',()=>{
 const {departure}=require('../push-model');
 assert.deepEqual(departure({...ride,date:'2026-03-29',time:'03:10',routeOutMinutes:30}),{date:'2026-03-29',time:'01:40'});
 assert.equal(departure({...ride,date:'2026-03-29',time:'02:10'}),null);
});
