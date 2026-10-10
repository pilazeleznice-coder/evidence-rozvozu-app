const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(p===root+'/')p+='index.html';if(!fs.existsSync(p)){res.writeHead(404);return res.end()};res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.html')?'text/html':p.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.PZ_CHROMIUM_EXECUTABLE?{executablePath:process.env.PZ_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}: {})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});await page.locator('#settingsToolBtn').click();
 await page.locator('#pzPushStatus').waitFor({state:'visible'});assert.match(await page.locator('#pzPushStatus').innerText(),/Zatím neaktivní/);assert.ok(await page.locator('#pzPushEnable').isDisabled());
 assert.match(await page.locator('.pz-push-card').innerText(),/5, 10 a 15 minut/);
 await page.locator('#v80SettingsClose').click();await page.locator('#addBtn').click();await page.locator('#formModal.show').waitFor();
 console.log('Full Evidence: settings panel, inactive state, schedule copy and existing new-ride dialog passed. Runtime errors:',JSON.stringify(errors));
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
