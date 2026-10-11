const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(p===root+'/')p+='index.html';if(!fs.existsSync(p)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':p.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.PZ_CHROMIUM_EXECUTABLE?{executablePath:process.env.PZ_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}: {})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});await page.locator('#settingsToolBtn').click();await page.locator('.pz-settings-section > summary').click();
 await page.locator('#pzPushStatus').waitFor({state:'visible'});assert.match(await page.locator('#pzPushStatus').innerText(),/Připoj toto zařízení/);assert.ok(await page.locator('#pzPushEnable').isEnabled());
 assert.equal(await page.locator('.pz-reminder').count(),6);
 assert.equal(await page.locator('#pz-value-day_before').inputValue(),'24');
 await page.locator('#pz-value-hour_before').fill('90');await page.locator('#pz-value-hour_before').press('Tab');await page.locator('#pzPrefSave').click();
 assert.match(await page.locator('#pzSaveStatus').innerText(),/Změny uloženy/);
 await page.reload();await page.locator('#settingsToolBtn').click();await page.locator('.pz-settings-section > summary').click();assert.equal(await page.locator('#pz-value-hour_before').inputValue(),'90');
 await page.locator('#pzPrefReset').click();assert.equal(await page.locator('#pz-value-hour_before').inputValue(),'60');
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('.pz-reminders').evaluate(el=>el.scrollWidth<=el.clientWidth),true);}
 assert.equal(await page.locator('#pzPref-detail').isChecked(),false);

 await page.locator('#v80SettingsClose').click();await page.locator('#addBtn').click();await page.locator('#formModal.show').waitFor();
 assert.deepEqual(errors,[]);console.log('Full Evidence: six controls, offline persistence, defaults, mobile/tablet/desktop layout and existing new-ride dialog passed. No runtime errors.');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
