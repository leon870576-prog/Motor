import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('./arcade-fixtures/',import.meta.url)),themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const errors=[],scenarios=[];let layouts=0;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let fixture='bandit-ready',reply='bandit-win',posts=0,documents=0,failure=false,delayed=false,forbidden=false,lastBody='';
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});
  if(request.method()==='POST'||(url.searchParams.has('new')&&request.headers().accept==='application/json')){
   if(request.method()==='POST'){posts++;lastBody=request.postData()||'';}
   if(failure)return route.abort('internetdisconnected');if(forbidden)return route.fulfill({status:403,contentType:'text/plain',body:'Session expired'});
   if(delayed)await new Promise(r=>setTimeout(r,200));
   return route.fulfill({contentType:'application/json',body:readFileSync(join(dir,(url.searchParams.has('new')?'naperstki-ready':reply)+'.json'))});
  }
  if(url.pathname.endsWith('.php')){documents++;return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture+'.html'))});}
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const id of ['bandit','kosti','naperstki'])for(const state of ['ready','result','win','empty']){
  fixture=id+'-'+state;await page.goto('https://motor.test/games/'+id+'.php');
  for(const theme of themes)for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});await page.evaluate(theme=>{document.body.dataset.theme=theme},theme);
   const m=await page.locator('#arcade').evaluate(root=>({overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...root.querySelectorAll('button,.arcade-play')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {height:r.height,left:r.left,right:r.right}}),symbols:[...root.querySelectorAll('.arcade-reels svg,.arcade-die,.arcade-cup')].map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}})}));
   assert.equal(m.overflow,false,JSON.stringify({id,state,width,theme}));for(const c of m.controls){assert.ok(c.height>=44);assert.ok(c.left>=0&&c.right<=width+1);}for(const c of m.symbols){assert.ok(c.width>=40&&c.height>=40);assert.ok(c.left>=0&&c.right<=width+1);}layouts++;
  }
 }
 scenarios.push('three games × four states × twelve themes × 320/390/768/1440px: no page overflow, 44px controls, legible SVG symbols');
 fixture='admin';await page.goto('https://motor.test/mpanel/arcade-settings.php');
 for(const theme of themes)for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});await page.evaluate(theme=>{document.body.dataset.theme=theme},theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('fieldset').count(),4);layouts++;}
 await page.locator('[name="21_mode"]').selectOption('percent');await page.locator('[name="21_percent"]').fill('37');assert.equal(await page.locator('[name="21_percent"]').inputValue(),'37');await page.locator('[name="21_percent"]').fill('101');assert.equal(await page.locator('[name="21_percent"]').evaluate(e=>e.checkValidity()),false);
 scenarios.push('admin settings across all themes, separate mode/percent/cost fields and numeric bounds');
 await page.setViewportSize({width:390,height:844});
 for(const id of ['bandit','kosti','naperstki']){
  fixture=id+'-ready';reply=id+'-win';await page.goto('https://motor.test/games/'+id+'.php');const before=posts,docs=documents;
  if(id==='naperstki')await page.getByRole('button',{name:'Выбрать напёрсток 2'}).press('Enter');else await page.locator('[data-arcade-form] [type=submit]').click();
  await page.locator('[data-phase=result]').waitFor();assert.equal(posts,before+1);assert.equal(documents,docs);assert.ok(lastBody.includes('name="rules_revision"'));
  if(id==='naperstki'){assert.ok(/name="choice"\r?\n\r?\n2/.test(lastBody));assert.equal(await page.locator('.arcade-ball').count(),1);await page.getByRole('link',{name:'Новая партия'}).click();await page.locator('[data-phase=ready]').waitFor();assert.equal(await page.locator('.arcade-ball').count(),0);assert.equal(posts,before+1);assert.equal(documents,docs);}
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,id+'-mobile.png'),fullPage:true,animations:'disabled'});
 }
 scenarios.push('actual UI submit data, keyboard cup choice, server results and next-cup view without reload or extra charge');
 fixture='kosti-ready';reply='kosti-win';await page.goto('https://motor.test/games/kosti.php');failure=true;await page.locator('[data-arcade-form] [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-arcade-network]').textContent.includes('Связь прервалась'));assert.equal(await page.locator('[data-arcade-form] [type=submit]').isEnabled(),true);assert.equal(await page.locator('[data-phase=ready]').count(),1);
 failure=false;delayed=true;const before=posts;await page.locator('[data-arcade-form] [type=submit]').evaluate(el=>{el.click();el.click();});await page.locator('[data-phase=result]').waitFor();assert.equal(posts,before+1);delayed=false;
 await page.goto('https://motor.test/games/kosti.php');forbidden=true;await page.locator('[data-arcade-form] [type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-arcade-network]').textContent.includes('Сессия завершилась'));forbidden=false;
 scenarios.push('network failure preserves state and retry; double tap sends once; expired session explained separately from lost connection');
 await page.emulateMedia({reducedMotion:'reduce'});fixture='naperstki-win';await page.goto('https://motor.test/games/naperstki.php');assert.equal(await page.locator('.arcade-cup').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 fixture='bandit-win';await page.goto('https://motor.test/games/bandit.php');await page.setViewportSize({width:320,height:844});await page.getByText('Выплаты по линиям',{exact:false}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(await page.locator('.arcade-paytable').evaluate(el=>[el,...el.querySelectorAll('*')].some(node=>node.scrollWidth>node.clientWidth&&['auto','scroll'].includes(getComputedStyle(node).overflowX))));
 scenarios.push('reduced motion; full payout table scrolls inside its own region on a narrow screen');
 assert.deepEqual(errors,[]);writeFileSync(new URL('./arcade-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:themes.length,scenarios,errors,physicalDevices:false},null,2)+'\n');console.log('SUCCESS',layouts,'layouts;',scenarios.length,'browser groups');
}finally{await browser.close();}
