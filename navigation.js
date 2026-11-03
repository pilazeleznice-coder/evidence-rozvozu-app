/* Android/Chrome Back uses the same safe close paths as the visible controls.
   A single same-document guard is reused, including after reload: opening and
   closing UI never appends an unbounded series of history entries. */
(function(){
 'use strict';
 const KEY='pzEvidenceBack',visible=e=>!!e&&e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
 const state=()=>history.state&&typeof history.state==='object'?history.state:{};
 function arm(){if(history.state?.[KEY]==='guard')return;history.replaceState({...state(),[KEY]:'base'},'',location.href);history.pushState({...state(),[KEY]:'guard'},'',location.href)}
 const click=(root,selector)=>{const b=selector.startsWith('#')?document.querySelector(selector):root.querySelector(selector);if(b&&!b.disabled){b.click();return true}return false};
 const routes=[
  ['#formModal','#v40FormClose'],['#detailModal','.v68-sheet-close'],
  ['#timelinePage','.v53-back'],['#v48Stats','#v48StatsBack'],
  ['#v80Settings','#v80SettingsClose'],['#v80BackupPage','#v80BackupBack'],['#v80StoragePage','#v80StorageBack'],
  ['#v40Archive','#v40ArchiveClose'],['#v40Drafts','#v40DraftClose'],['#v38TrashOverlay','#v38TrashClose'],
  ['#v40LeaveNew','#v40LeaveNo'],['#v40LeaveEdit','#v40EditContinue'],['.v76-exit','.v76-stay'],
  ['#activeRun','#runMinimize'],['#v51MergedRun','#v51RunClose'],
  ['#calendarModal','#closeCalendar'],['#calendarOverlay','#calClose'],['#durationOverlay','#durationCancel'],
  ['#confirmModal','#confirmNo'],['#cancelReasonModal','@hide'],['#breakOverlay','@hide'],
  ['#startConfirmOverlay','#startNo'],['#v38ConfirmOverlay','#v38ConfirmNo'],['#v46ReturnOverlay','#v46ReturnNo'],
  ['#v81RestoreOverlay','#v81RestoreCancel'],['#v52Dialog','#v52DialogNo'],
  ['#v51MergeModal','#v51MergeCancel'],['#v52EditMergedModal','#v52EditCancel'],['#v52TrashMergedModal','#v52TrashCancel'],
  ['#v52ReorderModal','#v52ReorderCancel'],['#v52SuggestionsModal','#v52SuggestionsClose'],['#v51CalendarPick','#v51CalendarPickClose']
 ];
 const ages=new WeakMap();let clock=0;
 function candidates(){const out=[];
  for(const [selector,close] of routes)for(const e of document.querySelectorAll(selector))if(visible(e))out.push({e,close:()=>close==='@hide'?(e.classList.remove('show','open'),true):click(e,close)});
  for(const e of document.querySelectorAll('#v80Settings details[open]'))if(visible(e))out.push({e,close:()=>{e.open=false;return true}});
  for(const e of document.querySelectorAll('dialog[open]'))if(visible(e))out.push({e,dialog:true,close:()=>{const cancel=new Event('cancel',{cancelable:true});if(e.dispatchEvent(cancel))e.close();return true}});
  for(const x of out)if(!ages.has(x.e))ages.set(x.e,++clock);
  return out;
 }
 // Account for ancestor stacking contexts and nested Settings screens.
 function rank(e){let score=0,depth=0;for(let p=e;p;p=p.parentElement){const z=Number.parseInt(getComputedStyle(p).zIndex,10);if(Number.isFinite(z))score=Math.max(score,z);depth++}return score*1000+depth}
 function back(){const list=candidates().sort((a,b)=>(b.dialog?1:0)-(a.dialog?1:0)||rank(b.e)-rank(a.e)||ages.get(b.e)-ages.get(a.e));const top=list[0];if(top)top.close();}
 const watchedDialogs=new WeakSet(),baseline=new WeakMap();
 const snapshot=e=>JSON.stringify([...e.querySelectorAll('form input,form textarea,form select')].filter(i=>!['submit','button','password'].includes(i.type)).map(i=>[i.name||i.id||i.dataset.business,i.type==='checkbox'?i.checked:i.value]));
 function scan(){const current=candidates();for(const [selector] of routes)for(const e of document.querySelectorAll(selector))if(!visible(e))ages.delete(e);
  for(const e of document.querySelectorAll('dialog[open]'))if(!watchedDialogs.has(e)){watchedDialogs.add(e);baseline.set(e,snapshot(e));e.addEventListener('cancel',event=>{if(e.querySelector('form')&&baseline.get(e)!==snapshot(e)&&!confirm('Zahodit neuložené změny tohoto okna?'))event.preventDefault()})}
 }
 function start(){arm();scan();new MutationObserver(scan).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','style','hidden']});}
 window.addEventListener('popstate',()=>{arm();back()});
 window.addEventListener('pageshow',()=>arm());
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
