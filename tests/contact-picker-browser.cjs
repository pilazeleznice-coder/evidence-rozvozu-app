const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'),server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(p===root+'/')p+='index.html';if(!fs.existsSync(p)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PZ_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.')?r.continue():r.abort());
  await page.addInitScript(()=>{window.nativeContactResult=[];window.nativeContactError=null;window.confirm=()=>false;Object.defineProperty(navigator,'contacts',{configurable:true,value:{select:async(props,opts)=>{window.pickerRequest={props,opts};if(window.nativeContactError)throw Object.assign(new Error('test failure'),{name:window.nativeContactError});return window.nativeContactResult}}})});
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});await page.locator('#addBtn').click();await page.waitForTimeout(300);
  // Returning from the phone picker must not depend on a browser confirm popup.
  await page.locator('#fName').fill('Předvyplněný zákazník');await page.locator('#fAddress').fill('Původní adresa');
  await page.evaluate(()=>window.nativeContactResult=[{name:['Novák'],tel:['+420 777 123 456']}]);await page.locator('.ride-contact-pick').click();
  await page.locator('#v52Dialog.show').waitFor({timeout:1800});await page.locator('#v52DialogYes').click();
  assert.equal(await page.locator('#fPhone').inputValue(),'+420 777 123 456');assert.equal(await page.locator('#fName').inputValue(),'Novák');assert.equal(await page.locator('#fAddress').inputValue(),'Původní adresa');
  // A cancelled replacement leaves every field intact.
  await page.evaluate(()=>window.nativeContactResult=[{name:['Jiný zákazník'],tel:['888222333']}]);await page.locator('.ride-contact-pick').click();await page.locator('#v52Dialog.show').waitFor();await page.locator('#v52DialogNo').click();assert.equal(await page.locator('#fName').inputValue(),'Novák');assert.equal(await page.locator('#fPhone').inputValue(),'+420 777 123 456');
  // Empty first values and an unshared name must not hide a usable number.
  await page.locator('#fName').fill('');await page.locator('#fPhone').fill('');await page.evaluate(()=>window.nativeContactResult=[{name:[],tel:['','   ','+420 666 333 222']}]);await page.locator('.ride-contact-pick').click();assert.equal(await page.locator('#fPhone').inputValue(),'+420 666 333 222');
  // More than one usable number gets an explicit choice instead of silently taking tel[0].
  await page.locator('#fPhone').fill('');await page.evaluate(()=>window.nativeContactResult=[{name:['Dvě čísla'],tel:['777000111','888000222','777 000 111']}]);await page.locator('.ride-contact-pick').click();assert.equal(await page.locator('.ride-phone-choice button[data-phone]').count(),2);await page.locator('.ride-phone-choice button[data-phone="888000222"]').click();assert.equal((await page.locator('#fPhone').inputValue()).replace(/\D/g,''),'888000222');assert.equal(await page.locator('#fName').inputValue(),'Dvě čísla');
  const before=await page.locator('#fPhone').inputValue();await page.evaluate(()=>window.nativeContactResult=[{name:['Bez čísla'],tel:['','   ']}]);await page.locator('.ride-contact-pick').click();assert.equal(await page.locator('#fPhone').inputValue(),before);assert.match(await page.locator('.ride-contact-feedback').innerText(),/neobsahuje.*číslo/);
  await page.evaluate(()=>window.nativeContactError='AbortError');await page.locator('.ride-contact-pick').click();assert.equal(await page.locator('#fPhone').inputValue(),before);assert.equal(await page.locator('.ride-contact-pick').isEnabled(),true);
  await page.evaluate(()=>window.nativeContactError='NotAllowedError');await page.locator('.ride-contact-pick').click();assert.match(await page.locator('.ride-contact-feedback').innerText(),/nepodařilo/);assert.equal(await page.locator('.ride-contact-pick').isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.pickerRequest),{props:['name','tel'],opts:{multiple:false}});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('evidenceRozvozu_v4')||'[]').length),0);assert.deepEqual(errors,[]);
  console.log('Phone contact return: in-app replacement with blocked browser confirm, cancel safety, empty first number, missing name, number choice/deduplication, no-number feedback and permission/cancel recovery passed (mocked native picker).');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
