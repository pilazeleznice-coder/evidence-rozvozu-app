const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(p===root+'/')p+='index.html';if(!fs.existsSync(p)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PZ_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  delete window.Notification;delete window.PushManager;
  window.nativeCalls=[];window.nativeState={enabled:false,permission:false,exact:false,count:0,lastSync:0};
  window.PZAndroidNative={postMessage(raw){const q=JSON.parse(raw);window.nativeCalls.push(q);
   if(q.action==='enable')window.nativeState.enabled=true;
   if(q.action==='disable')window.nativeState.enabled=false;
   if(q.action==='sync'){window.nativeState.lastSync=Date.now();window.nativeState.count=q.payload.rides.filter(r=>r.enabled).length;window.nativePayload=q.payload;}
   queueMicrotask(()=>window.PZAndroidNative.onmessage({data:JSON.stringify({id:q.id,result:window.nativeState})}));
  }};
 });
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});await page.locator('#settingsToolBtn').click();await page.locator('.pz-settings-section > summary').click();
 await page.waitForFunction(()=>window.nativeCalls.some(x=>x.action==='sync'));
 assert.equal(await page.locator('#pzPushLogin').isHidden(),true);
 assert.match(await page.locator('#pzAppMode').innerText(),/Android aplikace/);
 await page.locator('#pzPushEnable').click();await page.waitForFunction(()=>window.nativeCalls.some(x=>x.action==='permission'));
 assert.ok(!await page.evaluate(()=>window.nativeCalls.some(x=>x.action==='enable')));
 await page.evaluate(()=>{nativeState.permission=true;nativeState.exact=true;dispatchEvent(new Event('pz-native-resume'));});
 await page.waitForFunction(()=>document.querySelector('#pzPermission').textContent.includes('povoleno'));
 await page.locator('#pzPushEnable').click();await page.locator('#pzPushTest').waitFor({state:'visible'});
 await page.evaluate(()=>localStorage.setItem('evidenceRozvozu_v4',JSON.stringify([{id:'native-test',name:'Test',status:'planned',date:'2030-06-15',time:'09:00',vehicle:'AK'}])));
 await page.waitForFunction(()=>window.nativePayload?.rides[0]?.enabled===true);
 await page.evaluate(()=>localStorage.setItem('evidenceRozvozu_activeRun_v24',JSON.stringify({rideId:'native-test'})));
 await page.waitForFunction(()=>window.nativePayload?.rides[0]?.enabled===false);
 await page.locator('#pz-value-hour_before').fill('90');await page.locator('#pz-value-hour_before').press('Tab');await page.locator('#pzPrefSave').click();
 await page.waitForFunction(()=>window.nativePayload.settings.hour_before.minutes===90);
 await page.locator('#pzPushTest').click();assert.match(await page.locator('#pzPushStatus').innerText(),/10 sekund/);
 await page.locator('#pzPushDisable').click();await page.locator('#pzPushTest').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);assert.ok(!await page.evaluate(()=>nativeCalls.some(x=>x.action.includes('auth'))));
 console.log('Native bridge: missing web push APIs, permission gate, enable, START cancellation payload, preferences, delayed test and disconnect passed.');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
