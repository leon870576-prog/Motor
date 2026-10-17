import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),local=fileURLToPath(new URL('.',import.meta.url)),dir=join(local,'chat-fixtures');
const fixture=n=>readFileSync(join(dir,n),'utf8'),pack=n=>JSON.parse(fixture(n+'.json'));
const before=pack('before'),fresh=pack('new'),sent=pack('sent'),edited=pack('edited'),empty=pack('empty');
const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const results={browser:browser.version(),layouts:[],scenarios:[],errors:[],physicalDevices:false};
const same=(a,b,label)=>assert.ok(Math.abs(a-b)<=1,`${label}: ${a} -> ${b}`);
async function setup(width=390,theme='lesika_dvor',file='before.html'){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600}),page=await context.newPage();
 const state={docs:0,polls:0,posts:0,reply:null,send:sent,code:200,delay:0,bodies:[],gate:null};
 page.on('pageerror',e=>results.errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.pathname==='/chat/updates.php'){
   state.polls++;assert.equal(request.method(),'POST');assert.match(request.postData(),/uid=[a-f0-9]{64}/);
   if(state.gate)await state.gate;
   if(state.reply)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state.reply)});
   return route.fulfill({status:204,body:''});
  }
  if(u.pathname==='/chat/add.php'){
   state.posts++;state.bodies.push(request.postData());assert.equal(request.method(),'POST');assert.ok(request.postData().includes('name="uid"'));assert.ok(request.postData().includes('name="message_id"'));
   if(state.gate)await state.gate;
   return route.fulfill({status:state.code,contentType:'application/json',body:JSON.stringify(state.send)});
  }
  if(request.resourceType()==='document'){state.docs++;return route.fulfill({contentType:'text/html; charset=utf-8',body:fixture(file).replace(/data-theme="[^"]+"/,`data-theme="${theme}"`)});}
  assert.equal(request.method(),'GET','unexpected POST');
  const path=resolve(root,'.'+decodeURIComponent(u.pathname));if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});
 });
 await page.goto('https://motor.test/'+(file==='settings.html'?'mpanel/chat-settings.php':'chat/index.php'+(file==='history.html'?'?start=10':'')),{waitUntil:'load'});
 await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
 return {context,page,state};
}
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const refresh=page=>page.evaluate(()=>document.querySelector('[data-chat-refresh]').click());
const revision=(page,r)=>page.waitForFunction(r=>document.querySelector('#chat-live').dataset.revision===r,r);
const atSent=(page,id)=>page.waitForFunction(id=>{
 const e=document.getElementById('chat-message-'+id);
 return e && document.activeElement===e && Math.abs(e.getBoundingClientRect().top-90)<=1 && document.querySelector('[data-chat-new]').hidden;
},id,{timeout:5000}).then(()=>frame(page)).catch(async error=>{
 console.error('send scroll',await page.evaluate(id=>{const e=document.getElementById('chat-message-'+id);return {width:innerWidth,motion:matchMedia('(prefers-reduced-motion: reduce)').matches,top:e?.getBoundingClientRect().top,scroll:scrollY,focus:document.activeElement?.id,buttonHidden:document.querySelector('[data-chat-new]').hidden,status:document.querySelector('[data-chat-send-status]').textContent,margin:e&&getComputedStyle(e).scrollMarginTop};},id));throw error;
});
try{
 for(const width of [320,390,1440])for(const theme of themes){
  const {page,state,context}=await setup(width,theme);
  try{
   const input=page.locator('#chat-message');await input.fill('Мой черновик 🙂 [b]текст[/b]');await input.focus();
   await page.evaluate(()=>{const e=document.querySelector('#chat-message');e.setSelectionRange(3,9);e.scrollIntoView({block:'center'});window.savedTextarea=e;window.keptNode=document.querySelector('[data-chat-id]');});await frame(page);
   const old=await page.evaluate(()=>({top:document.querySelector('[data-chat-composer]').getBoundingClientRect().top,value:document.querySelector('#chat-message').value}));
   state.reply=fresh;await refresh(page);await revision(page,fresh.revision);await frame(page);
   const after=await page.evaluate(()=>{const e=document.querySelector('#chat-message');return {top:document.querySelector('[data-chat-composer]').getBoundingClientRect().top,value:e.value,start:e.selectionStart,end:e.selectionEnd,focused:document.activeElement===e,same:e===savedTextarea,width:document.documentElement.scrollWidth,avatars:[...document.querySelectorAll('#chat-feed .motor-avatar')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,fit:getComputedStyle(e).objectFit}))}});
   same(old.top,after.top,'composer position');assert.equal(after.value,old.value);assert.equal(after.start,3);assert.equal(after.end,9);assert.ok(after.focused&&after.same);assert.ok(after.width<=width+1);assert.ok(after.avatars.length>0);for(const a of after.avatars){same(a.w,56,'avatar width');same(a.h,56,'avatar height');assert.equal(a.fit,'contain');}
   assert.equal(state.docs,1);assert.equal(state.posts,0);
   results.layouts.push({width,theme,composerShift:after.top-old.top,documentRequests:state.docs});
   if(width===390&&theme==='lesika_dvor'){await input.blur();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(local,'chat-mobile.png'),fullPage:true});}
  }finally{await context.close();}
 }
 results.scenarios.push('36 layouts: twelve themes, 320/390/1440px, draft/focus/selection/scroll preserved, avatars fully visible');
 // Preserve the visible message while reading with the composer unfocused.
 {
  const {page,state,context}=await setup();try{
   await page.evaluate(()=>{const e=document.querySelectorAll('.chat-message')[3];e.scrollIntoView({block:'start'});window.readingId=e.dataset.chatId;});await frame(page);
   const top=await page.evaluate(()=>document.querySelector('[data-chat-id="'+readingId+'"]').getBoundingClientRect().top);
   state.reply=fresh;await refresh(page);await revision(page,fresh.revision);await frame(page);
   same(top,await page.evaluate(()=>document.querySelector('[data-chat-id="'+readingId+'"]').getBoundingClientRect().top),'reading position');
  }finally{await context.close();}
 }
 results.scenarios.push('visible reading position preserved while new messages arrive');
 // Target the human's saved ID, although the immediately following bot reply is first.
 for(const width of [320,390,1440])for(const reducedMotion of ['reduce','no-preference']){
  const {page,state,context}=await setup(width);try{
   await page.emulateMedia({reducedMotion});assert.equal(sent.ids[1],sent.sent_message_id);assert.notEqual(sent.ids[0],sent.sent_message_id);
   await page.locator('#chat-message').fill('Настя, расскажи о кино');await page.locator('[data-chat-form] [type=submit]').click();await atSent(page,sent.sent_message_id);
   assert.equal(await page.locator('#chat-message').inputValue(),'');assert.equal(state.docs,1);assert.equal(state.posts,1);
   const target=page.locator('#chat-message-'+sent.sent_message_id),top=(await target.boundingBox()).y;
   state.reply=edited;await refresh(page);await revision(page,edited.revision);await frame(page);same(top,(await target.boundingBox()).y,'position after send and background edit');
  }finally{await context.close();}
 }
 results.scenarios.push('own sent message visible below header, not bot reply: 320/390/1440px, smooth and reduced motion; later polling preserves position');
 {
  const {page,state,context}=await setup();try{
   state.reply=sent;await refresh(page);await revision(page,sent.revision);
   state.send={...sent,saved:false};await page.locator('#chat-message').fill('Повтор после потерянного ответа');await page.locator('[data-chat-form] [type=submit]').click();await atSent(page,sent.sent_message_id);
   assert.equal(state.posts,1);assert.equal(state.docs,1);
  }finally{await context.close();}
 }
 results.scenarios.push('idempotent retry scrolls to own message even when revision is already current');
 // Real timer and unchanged revision keep existing nodes, no reload.
 {
  const {page,state,context}=await setup();try{
   await page.evaluate(()=>window.keptNode=document.querySelector('[data-chat-id]'));
   await page.waitForFunction(()=>document.querySelector('[data-chat-status]').textContent==='Автообновление включено');
   await page.waitForTimeout(3200);assert.ok(state.polls>=1);assert.ok(await page.evaluate(()=>keptNode===document.querySelector('[data-chat-id]')));
   state.reply=fresh;await revision(page,fresh.revision);assert.ok((await page.locator('#chat-feed').innerText()).includes('Настюха'));assert.equal(state.docs,1);
   state.reply=edited;await refresh(page);await revision(page,edited.revision);assert.ok((await page.locator('#chat-feed').innerText()).includes('Сообщение исправлено'));
   state.reply=empty;await refresh(page);await revision(page,empty.revision);assert.equal(await page.locator('.chat-message').count(),0);assert.ok(await page.locator('.chat-empty').isVisible());
  }finally{await context.close();}
 }
 results.scenarios.push('actual 3-second timer, unchanged 204 keeps nodes, external bot reply, edits and empty chat');
 // Submission stays asynchronous and protects text typed while awaiting response.
 {
  const {page,state,context}=await setup();let release;try{
   const input=page.locator('#chat-message');await input.fill('Настя, сообщение для отправки');state.gate=new Promise(r=>release=r);
   await page.locator('[data-chat-form] [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[type=submit]').disabled);
   await page.evaluate(()=>document.querySelector('[data-chat-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
   await input.fill('Следующий черновик');release();state.gate=null;await revision(page,sent.revision);await atSent(page,sent.sent_message_id);assert.equal(state.posts,1);assert.equal(await input.inputValue(),'Следующий черновик');assert.equal(state.docs,1);
   state.send={...edited,sent_message_id:sent.sent_message_id,message_id:'b'.repeat(32)};await page.locator('[data-chat-form] [type=submit]').click();await revision(page,edited.revision);await atSent(page,sent.sent_message_id);assert.equal(await input.inputValue(),'');assert.equal(await page.locator('[name=message_id]').inputValue(),'b'.repeat(32));
   await input.fill('Несохранённый новый текст');await input.evaluate(e=>e.scrollIntoView({block:'center'}));await frame(page);const failedScroll=await page.evaluate(()=>scrollY);
   state.code=503;state.send={error:'Временная ошибка'};await page.evaluate(()=>document.querySelector('[data-chat-form]').requestSubmit());await page.waitForFunction(()=>document.querySelector('[data-chat-send-status]').textContent==='Временная ошибка');await frame(page);assert.equal(await input.inputValue(),'Несохранённый новый текст');same(failedScroll,await page.evaluate(()=>scrollY),'failure must not scroll');
   state.code=409;state.send={error:'Повторите новый текст',message_id:'c'.repeat(32)};await page.locator('[data-chat-form] [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[name=message_id]').value==='c'.repeat(32));assert.equal(await input.inputValue(),'Несохранённый новый текст');
  }finally{release?.();await context.close();}
 }
 results.scenarios.push('AJAX send, CSRF fields, duplicate click, draft typed during send, normal clear, failure keeps draft, 409 changes retry ID');
 {
  const {page,state,context}=await setup(390,'lesika_dvor','history.html');try{
   const old=await page.locator('#chat-feed').innerHTML();state.reply=fresh;await page.waitForTimeout(3200);assert.equal(await page.locator('#chat-feed').innerHTML(),old);assert.ok(await page.locator('[data-chat-new]').isVisible());
   await page.locator('#chat-message').fill('Настя, отвечаю из истории');await page.locator('[data-chat-form] [type=submit]').click();await revision(page,sent.revision);await atSent(page,sent.sent_message_id);assert.ok((await page.locator('#chat-feed').innerText()).includes('Настюха'));assert.equal(await page.locator('#chat-live').getAttribute('data-start'),'0');assert.equal(state.docs,1);
  }finally{await context.close();}
 }
 results.scenarios.push('history page stays stable; own send switches to latest messages without reload');
 {
  const {page,state,context}=await setup();let release;try{
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const p=state.polls;await page.waitForTimeout(3200);assert.equal(state.polls,p);
   state.reply=fresh;await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await revision(page,fresh.revision);
   await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});const offline=state.polls;await page.waitForTimeout(3200);assert.equal(state.polls,offline);
   state.reply=edited;await page.evaluate(()=>{delete navigator.onLine;dispatchEvent(new Event('online'));});await revision(page,edited.revision);
   state.reply=empty;state.gate=new Promise(r=>release=r);await refresh(page);await page.waitForTimeout(50);const inFlight=state.polls;await refresh(page);await refresh(page);assert.equal(state.polls,inFlight);release();state.gate=null;await revision(page,empty.revision);
   state.reply={...fresh,revision:'d'.repeat(64),enabled:false};await refresh(page);await revision(page,'d'.repeat(64));const paused=state.polls;await page.waitForTimeout(3200);assert.equal(state.polls,paused);
  }finally{release?.();await context.close();}
 }
 results.scenarios.push('hidden/offline pause, visibility/reconnection resume, one request in flight, admin disable stops timers');
 for(const width of [320,1440]){
  const {page,context}=await setup(width,'lesika_dvor','settings.html');try{assert.ok(await page.locator('#phrases').isVisible());assert.ok(await page.locator('#refresh_seconds').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===320)await page.screenshot({path:join(local,'chat-settings-mobile.png'),fullPage:true});}finally{await context.close();}
 }
 assert.deepEqual(results.errors,[]);writeFileSync(join(local,'chat-browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log('PASS',results.layouts.length,'layouts;',results.scenarios.length,'interaction groups; no JS errors');
}finally{await browser.close();}
