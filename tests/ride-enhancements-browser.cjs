const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'),server=http.createServer((req,res)=>{let p=path.join(root,new URL(req.url,'http://localhost').pathname);if(p===root+'/')p+='index.html';if(!fs.existsSync(p)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/json');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PZ_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
 await page.addInitScript(()=>{if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');localStorage.setItem('pzCalculationRecordsV1',JSON.stringify([{type:'archive',snapshot:{contact:{name:'Novák',phone:'+420 777 123 456',address:'Jičín'}}},{type:'draft',snapshot:{contact:{name:'Tajný koncept',phone:'888888888'}}}]))}});
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});
 await page.locator('#addBtn').click();await page.waitForTimeout(250);
 await page.locator('#fPhone').fill('777123');await page.locator('.ride-contact-results button').click();
 assert.equal(await page.locator('#fName').inputValue(),'Novák');assert.equal(await page.locator('#fAddress').inputValue(),'Jičín');assert.match(await page.locator('#fPhone').inputValue(),/777/);
 await page.locator('#fDocuments').setInputFiles({name:'objednavka.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nTest')});
 await page.locator('#saveRide').click();await page.waitForTimeout(400);
 let rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('evidenceRozvozu_v4')));assert.equal(rows.length,1);assert.equal(rows[0].documents.length,1);const id=rows[0].id,docId=rows[0].documents[0].id;
 const blob=await page.evaluate(id=>new Promise(resolve=>{const q=indexedDB.open('EvidenceRozvozuFiles',1);q.onsuccess=()=>{const r=q.result.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve({size:r.result?.blob.size,name:r.result?.name})}}),docId);assert.equal(blob.name,'objednavka.pdf');assert.ok(blob.size>0);
 await page.locator('#addBtn').click();await page.waitForTimeout(200);await page.locator('#fDocuments').setInputFiles({name:'neplatna.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});await page.locator('#saveRide').click();await page.waitForTimeout(300);
 rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('evidenceRozvozu_v4')));assert.equal(rows.length,1);assert.equal(rows[0].documents.length,1);assert.equal(rows[0].documents[0].id,docId);
 if(await page.locator('#v52Dialog.show').count())await page.locator('#v52Dialog button').last().click();
 // Save a draft with its own document and reopen it before final creation.
 await page.locator('#fName').fill('Koncept');await page.locator('#fPhone').fill('666123456');await page.locator('#fAddress').fill('Libuň');await page.locator('#v41SaveDraft').click();await page.waitForTimeout(200);
 await page.locator('#draftToolBtn').click();await page.locator('[data-draft]').first().click();await page.waitForTimeout(450);assert.equal(await page.locator('#fName').inputValue(),'Koncept');await page.locator('#saveRide').click();await page.waitForTimeout(400);
 rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('evidenceRozvozu_v4')));assert.equal(rows.length,2);const draftRide=rows.find(r=>r.name==='Koncept');assert.equal(draftRide.documents.length,1);assert.equal(draftRide.documents[0].name,'neplatna.txt');
 await page.evaluate(id=>window.openEdit(id),id);await page.waitForTimeout(250);await page.locator('#fDocuments').setInputFiles({name:'dalsi.txt',mimeType:'text/plain',buffer:Buffer.from('edit')});await page.locator('#saveRide').click();await page.waitForTimeout(400);
 rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('evidenceRozvozu_v4')));assert.equal(rows.find(r=>r.id===id).documents.length,2);assert.equal(rows.find(r=>r.id===draftRide.id).documents.length,1);
 await page.reload();
 const manifest=await page.evaluate(()=>fetch('./manifest.webmanifest').then(r=>r.json()));assert.equal(manifest.id,'/evidence-rozvozu-app/');assert.equal(manifest.display,'standalone');
 await page.evaluate(()=>{window.installCalled=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>window.installCalled++;e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e)});await page.locator('.ride-install').click();assert.equal(await page.evaluate(()=>installCalled),1);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.context().setOffline(true);await page.reload();await page.locator('#addBtn').click();await page.waitForTimeout(200);assert.equal(await page.locator('.ride-contact-pick').count(),1);await page.context().setOffline(false);
 assert.deepEqual(errors,[]);
 console.log('Contacts from configurator archive; real IndexedDB attachment upload; invalid form isolation; draft reopen/final save without duplicates; editing only target ride; reload without runtime errors: passed.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
