const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub',true)::uuid$$; create role anon;create role authenticated;create role service_role;`);
 await db.exec(fs.readFileSync(require('path').join(__dirname,'../supabase/migrations/'+fs.readdirSync(require('path').join(__dirname,'../supabase/migrations')).find(x=>x.endsWith('_push_notifications.sql'))),'utf8'));
 await db.exec(fs.readFileSync(require('path').join(__dirname,'../supabase/migrations/20261011153326_push_preferences.sql'),'utf8'));
 for(const f of fs.readdirSync(require('path').join(__dirname,'../supabase/migrations')).filter(x=>x.endsWith('_push_preferences_validation.sql'))) await db.exec(fs.readFileSync(require('path').join(__dirname,'../supabase/migrations',f),'utf8'));
 const uid='00000000-0000-4000-8000-000000000001';
 await db.exec(`insert into auth.users values('${uid}'); set request.jwt.claim.sub='${uid}'; insert into public.pz_push_subscriptions(user_id,device_id,subscription) values('${uid}','00000000-0000-4000-8000-000000000002','{}'),('${uid}','00000000-0000-4000-8000-000000000003','{}');`);
 const sync=async(r,removed=[])=>db.query('select public.pz_sync_push($1::jsonb,$2::text[])',[JSON.stringify(r),removed]);
 const ride={id:'11',name:'Novák',vehicle:'TRM',address:'Jičín',net:2000,date:'2030-03-31',time:'10:30',enabled:true};
 await sync([ride]); const count=async()=>Number((await db.query('select count(*) n from public.pz_push_jobs')).rows[0].n);
 assert.equal(await count(),12); await sync([ride]);assert.equal(await count(),12);
 const morning=(await db.query("select due_at from public.pz_push_schedule('2030-03-31 10:30 Europe/Prague') where kind='morning'")).rows[0].due_at;
 assert.equal(morning.toISOString(),'2030-03-31T05:00:00.000Z');
 assert.equal((await db.query("select count(*) n from public.pz_push_schedule('2030-10-27 06:30 Europe/Prague')")).rows[0].n,5);
 await sync([{...ride,time:'11:00'}]);assert.equal(await count(),12);
 await sync([{...ride,enabled:false}]);assert.equal(await count(),0);
 await sync([ride]);assert.equal(await count(),12);
 await sync([],['11']);assert.equal(await count(),0);
 await db.query('set role authenticated');
 await assert.rejects(()=>db.query("select * from public.pz_claim_push()"));
 await db.query('reset role');
 // Due-time claiming, lease deduplication and stale-expiration.
 const at=new Date(Date.now()-60000).toISOString();
 await db.query('insert into public.pz_push_rides(user_id,ride_id,name,vehicle,address,net,delivery_at,enabled) values($1,$2,$3,$4,$5,2000,$6,true)',[uid,'12','Novák','AK','Jičín',at]);
 await db.query("insert into public.pz_push_jobs(user_id,ride_id,subscription_id,kind,due_at) select $1,'12',id,'late_5',$2::timestamptz from public.pz_push_subscriptions",[uid,at]);
 const claimed=await db.query('select * from public.pz_claim_push()');assert.equal(claimed.rows.length,2);
 assert.equal((await db.query('select * from public.pz_claim_push()')).rows.length,0);
 await sync([{...ride,id:'12',enabled:false}]);assert.equal(await count(),0);
 // Preferences are global, validated, revisioned and preserve sent history.
 await sync([ride]);
 let prefs=(await db.query('select public.pz_push_defaults() p')).rows[0].p;
 const save=async(settings,revision)=>db.query('select public.pz_set_push_preferences($1::jsonb,$2) p',[JSON.stringify(settings),revision]);
 prefs.hour_before.minutes=90;prefs.morning.time='08:15';prefs.late_10.enabled=false;
 let saved=(await save(prefs,0)).rows[0].p;assert.equal(saved.revision,1);assert.equal(await count(),10);
 const morningCustom=(await db.query("select due_at from public.pz_push_schedule('2030-10-27 10:30 Europe/Prague',$1) where kind='morning'",[JSON.stringify(prefs)])).rows[0].due_at;
 assert.equal(morningCustom.toISOString(),'2030-10-27T07:15:00.000Z');
 await assert.rejects(()=>save(prefs,0),/another device/);
 await assert.rejects(()=>save({...prefs,late_5:{enabled:true,minutes:-1}},1),/Invalid minutes/);
 await db.query("update public.pz_push_jobs set state='sent',sent_at=now() where id=(select min(id) from public.pz_push_jobs)");
 prefs.enabled=false;saved=(await save(prefs,1)).rows[0].p;assert.equal(await count(),1);
 prefs.enabled=true;await save(prefs,2);assert.equal(await count(),10);
 await sync([],['11']);assert.equal(await count(),1); // deletion keeps sent audit row
 await sync([ride]);assert.equal(await count(),10); // restore cannot duplicate sent reminder
 const device='00000000-0000-4000-8000-000000000002';
 await db.query('select public.pz_test_push($1)',[device]);
 assert.equal((await db.query('select * from public.pz_claim_push()')).rows[0].kind,'test');
 await assert.rejects(()=>db.query('select public.pz_test_push($1)',[device]),/Wait one minute/);
 await assert.rejects(()=>db.query('select public.pz_test_push($1)',['00000000-0000-4000-8000-000000000009']),/not registered/);
 console.log('Custom reminders, global toggle, privacy defaults, revision conflict, invalid input, retained sent history and server test rate limit passed.');
 console.log('SQL migration, six schedules, DST, early morning, two devices, reschedule, START/cancel, delete, privileges and lease deduplication passed.');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
