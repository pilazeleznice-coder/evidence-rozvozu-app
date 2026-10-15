(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PZSyncModel=api;})(globalThis,function(){
 'use strict';
 function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
 const key=(kind,id)=>kind+':'+id;
 const content=r=>r&&!r.deleted?stable(r.payload):null;
 function empty(owner){return {version:1,owner,cursor:0,seen:{},revisions:{},outbox:{},conflicts:{},files:{},lastSync:null};}
 function capture(state,snapshot,uuid){
  for(const k of new Set([...Object.keys(state.seen),...Object.keys(snapshot)])){
   const item=snapshot[k],now=item?stable(item.payload):null,was=state.seen[k]??null;
   if(now===was)continue;
   const split=k.indexOf(':'),old=state.outbox[k];
   state.outbox[k]={kind:k.slice(0,split),id:k.slice(split+1),payload:item?.payload??null,deleted:!item,
    expected_revision:old?.expected_revision??state.revisions[k]??0,mutation_id:uuid()};
   if(now===null)delete state.seen[k];else state.seen[k]=now;
  }
 }
 function acknowledge(state,op,row){
  const k=key(op.kind,op.id),pending=state.outbox[k];state.revisions[k]=row.revision;
  if(!pending)return;
  if(pending.mutation_id===op.mutation_id||content(pending)===content(row)){
   delete state.outbox[k];delete state.conflicts[k];
  }else{pending.expected_revision=row.revision;delete state.conflicts[k];}
 }
 function receive(state,snapshot,rows){
  let changed=false;
  for(const row of rows){
   const k=key(row.kind,row.id),pending=state.outbox[k];
   if(pending){
    if(content(pending)===content(row)){acknowledge(state,pending,row);}
    else if(pending.expected_revision!==row.revision)state.conflicts[k]={remote:row};
   }else{
    if(row.deleted){if(snapshot[k])changed=true;delete snapshot[k];delete state.seen[k];}
    else{if(stable(snapshot[k]?.payload)!==stable(row.payload))changed=true;snapshot[k]={kind:row.kind,id:row.id,payload:row.payload};state.seen[k]=stable(row.payload);}
    state.revisions[k]=row.revision;
   }
   state.cursor=Math.max(state.cursor,row.revision);
  }
  return changed;
 }
 function resolve(state,snapshot,k,choice,uuid){
  const remote=state.conflicts[k]?.remote;if(!remote)return false;
  if(choice==='local'){
   const pending=state.outbox[k];if(!pending)return false;
   pending.expected_revision=remote.revision;pending.mutation_id=uuid();state.revisions[k]=remote.revision;
  }else{
   delete state.outbox[k];state.revisions[k]=remote.revision;
   if(remote.deleted){delete snapshot[k];delete state.seen[k];}
   else{snapshot[k]={kind:remote.kind,id:remote.id,payload:remote.payload};state.seen[k]=stable(remote.payload);}
  }
  delete state.conflicts[k];return true;
 }
 return {stable,key,content,empty,capture,acknowledge,receive,resolve};
});
