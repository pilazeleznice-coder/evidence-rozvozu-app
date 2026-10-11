const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(windows=[]) {
 const handlers={},shown=[],opened=[],self={addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:()=>{},registration:{scope:'https://example.test/evidence/',showNotification:async(title,options)=>shown.push({title,options})},clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../sw.js'),'utf8'),{self,URL,Date,String});
 async function push(payload){let done;handlers.push({data:{json:()=>payload},waitUntil:p=>done=p});await done;}
 async function click(data){let done,closed=false;handlers.notificationclick({notification:{data,close:()=>closed=true},waitUntil:p=>done=p});await done;assert.equal(closed,true);}
 return {shown,opened,push,click};
}
test('push shows supplied customer information, stable tag and app link',async()=>{
 const h=harness();await h.push({title:'Za hodinu',body:'Novák · TRM · Jičín · 2 000 Kč bez DPH',tag:'ride-11-hour-before',rideId:'11',url:'https://example.test/evidence/?pushRide=11',expiresAt:Date.now()+10000});
 assert.equal(h.shown.length,1);assert.match(h.shown[0].options.body,/Novák/);assert.equal(h.shown[0].options.data.rideId,'11');assert.equal(h.shown[0].options.tag,'ride-11-hour-before');
});
test('expired pushes and outside-app destinations are discarded',async()=>{
 const h=harness();await h.push({expiresAt:Date.now()-1});await h.push({url:'https://evil.test/'});await h.push({url:'https://example.test/another-app/'});assert.equal(h.shown.length,0);
});
test('click focuses existing app and opens ride without reload',async()=>{
 let focused=false,message;const h=harness([{url:'https://example.test/evidence/',focus:async()=>focused=true,postMessage:m=>message=m}]);
 await h.click({url:'https://example.test/evidence/?pushRide=11',rideId:'11'});assert.equal(focused,true);assert.equal(message.rideId,'11');assert.equal(h.opened.length,0);
});
test('click launches closed app at selected ride',async()=>{const h=harness();await h.click({url:'https://example.test/evidence/?pushRide=12'});assert.equal(h.opened[0],'https://example.test/evidence/?pushRide=12');});
