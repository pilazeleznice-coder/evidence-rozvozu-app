const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
(async()=>{
 const db=new PGlite();await db.exec(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create role anon;create role authenticated;grant usage on schema auth to authenticated;`);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261015110007_evidence_sync.sql'),'utf8').split('-- Immutable, content-addressed attachments;')[0];await db.exec(sql);
 const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
 const owner=async(id)=>{await db.query('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.query('set role authenticated');};
 const apply=async changes=>(await db.query('select pz_sync_apply($1::jsonb) result',[JSON.stringify(changes)])).rows[0].result;
 const change=(id,rev,payload,deleted=false)=>({kind:'ride',id,expected_revision:rev,payload,deleted,mutation_id:randomUUID()});
 await owner(a);const first=change('1',0,{name:'A'});let rows=await apply([first]);assert.equal(rows[0].ok,true);assert.equal(rows[0].row.revision,1);
 rows=await apply([first]);assert.equal(rows[0].row.revision,1); // lost acknowledgement retry
 rows=await apply([change('1',0,{name:'stale'})]);assert.equal(rows[0].ok,false);assert.equal(rows[0].row.payload.name,'A');
 rows=await apply([change('1',1,{name:'B'})]);assert.equal(rows[0].row.revision,2);
 assert.equal((await db.query('select count(*)::int n from pz_sync_history')).rows[0].n,1);
 rows=await apply([change('1',2,null,true)]);assert.equal(rows[0].row.deleted,true);
 rows=await apply([change('1',0,{name:'resurrect'})]);assert.equal(rows[0].ok,false);
 await owner(b);assert.equal((await db.query('select count(*)::int n from pz_sync_entries')).rows[0].n,0);
 rows=await apply([change('1',0,{name:'Other owner'})]);assert.equal(rows[0].row.revision,1);assert.equal(rows[0].row.user_id,b);
 await assert.rejects(()=>db.query('insert into pz_sync_entries values($1,$2,$3,$4,false,10,$5,now())',[a,'ride','hack','{}',randomUUID()]),/row-level security/);
 await assert.rejects(()=>db.query('delete from pz_sync_entries'),/permission denied/);
 await db.query('reset role');await db.query('set role anon');await assert.rejects(()=>apply([first]),/permission denied/);await db.query('reset role');
 await owner(a);await assert.rejects(()=>apply(Array.from({length:101},()=>first)),/100 changes/);
 console.log('Sync SQL: replay, atomic revision check, history, tombstones, account isolation, anon denial, immutable retention and batch limit passed.');await db.close();
})().catch(e=>{console.error(e);process.exit(1);});
