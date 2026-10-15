(function(){
 'use strict';
 const cfg=window.PZ_PUSH_CONFIG;
 const client=window.PZSupabase.createClient(cfg.supabaseUrl,cfg.publicKey,{auth:{storageKey:'pzEvidenceAuthV1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:(url,init={})=>fetch(url,{...init,signal:init.signal||AbortSignal.timeout(30000)})}});
 let current=null;
 const ready=(async()=>{
  let {data,error}=await client.auth.getSession();if(error)throw error;
  if(!data.session){let legacy;try{legacy=JSON.parse(localStorage.getItem('pzPushSession')||'null');}catch{}
   if(legacy?.access_token&&legacy.refresh_token){const r=await client.auth.setSession(legacy);if(!r.error)data=r.data;}
  }
  current=data.session;return current;
 })();
 client.auth.onAuthStateChange((event,session)=>{
  current=session;
  // Notification code and sync use the same refresh-token owner.
  let old;try{old=JSON.parse(localStorage.getItem('pzPushSession')||'null');}catch{}
  if(session)localStorage.setItem('pzPushSession',JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at,userId:session.user.id,subscribed:old?.userId===session.user.id&&!!old.subscribed}));
  else if(event==='SIGNED_OUT')localStorage.removeItem('pzPushSession');
  queueMicrotask(()=>window.dispatchEvent(new CustomEvent('pz-cloud-auth',{detail:{event,user:session?.user||null}})));
 });
 window.PZCloudAuth={client,ready,get user(){return current?.user||null;},
  async token(){await ready;const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session)throw Error('Přihlas se k účtu Evidence.');return data.session.access_token;},
  async login(email,password){await ready;const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw Error('Přihlášení se nezdařilo. Zkontroluj e-mail a heslo.');return data.session;},
  async logout(){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}
 };
})();
