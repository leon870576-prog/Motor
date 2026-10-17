import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('./game21-fixtures/',import.meta.url));
const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const errors=[],scenarios=[];let layouts=0;
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 let fixture='ready',reply='playing',posts=0,documents=0,failure=false,delayed=false;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});
  if(request.method()==='POST'){
   posts++;
   if(failure)return route.abort('internetdisconnected');
   if(delayed)await new Promise(r=>setTimeout(r,200));
   return route.fulfill({status:200,contentType:'application/json',body:readFileSync(join(dir,reply+'.json'))});
  }
  if(url.pathname.endsWith('.php')){documents++;return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture+'.html'))});}
  const path=resolve(root,'.'+url.pathname);
  if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});
  return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(fixture of ['ready','playing','finished','empty']){
  await page.goto('https://motor.test/games/21.php',{waitUntil:'load'});
  for(const theme of themes)for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});await page.evaluate(theme=>{document.body.dataset.theme=theme},theme);
   const m=await page.locator('#g21').evaluate(root=>({overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...root.querySelectorAll('.g21-card')].map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}}),buttons:[...root.querySelectorAll('button')].filter(el=>el.getClientRects().length).map(el=>({h:el.getBoundingClientRect().height,label:el.textContent,disabled:el.disabled})),inputs:[...root.querySelectorAll('input:not([type=hidden])')].map(el=>getComputedStyle(el).fontSize)}));
   assert.equal(m.overflow,false,JSON.stringify({fixture,theme,width}));
   for(const card of m.cards){assert.ok(card.width>=68 && card.height>=98);assert.ok(card.left>=0&&card.right<=width+1);}
   for(const b of m.buttons)assert.ok(b.h>=44,JSON.stringify({fixture,theme,width,b}));
   for(const size of m.inputs)assert.ok(parseFloat(size)>=16);
   layouts++;
  }
 }
 scenarios.push('ready/playing/result/empty across 12 themes and 320–1440px: full cards, no overflow, 44px+ controls, 16px+ input');
 fixture='ready';reply='playing';await page.setViewportSize({width:390,height:844});await page.goto('https://motor.test/games/21.php');await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,'game21-ready-mobile.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-g21-bet="50"]').click();assert.equal(await page.locator('#g21-bet').inputValue(),'50');
 await page.locator('#g21-bet').fill('101');const beforeInvalid=posts;await page.getByRole('button',{name:'Раздать карты'}).click();assert.equal(posts,beforeInvalid);await page.locator('#g21-bet').fill('10');
 const docs=documents;await page.getByRole('button',{name:'Раздать карты'}).click();await page.locator('[data-phase=playing]').waitFor();assert.equal(documents,docs);assert.equal(await page.locator('.g21-card-back').count(),2);
 reply='hit';await page.getByRole('button',{name:'Взять карту'}).click();await page.waitForFunction(()=>document.querySelector('[data-g21-score]').textContent.trim().startsWith('17'));assert.equal(documents,docs);assert.equal(await page.locator('.g21-player .g21-card').count(),3);
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,'game21-playing-mobile.png'),fullPage:true,animations:'disabled'});
 reply='finished';await page.getByRole('button',{name:'Открыться',exact:true}).click();await page.locator('[data-phase=finished]').waitFor();assert.equal(documents,docs);assert.equal(await page.locator('.g21-card-back').count(),0);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,'game21-result-mobile.png'),fullPage:true,animations:'disabled'});
 scenarios.push('quick bet, client validation, start/hit/stand without document reload, dealer hidden until reveal');
 fixture='playing';reply='hit';await page.goto('https://motor.test/games/21.php');failure=true;
 await page.getByRole('button',{name:'Взять карту'}).click();await page.waitForFunction(()=>document.querySelector('[data-g21-network]').textContent.includes('Связь прервалась'));assert.equal(await page.locator('.g21-player .g21-card').count(),2);assert.equal(await page.getByRole('button',{name:'Взять карту'}).isEnabled(),true);
 failure=false;delayed=true;const p=posts;await page.locator('[data-g21-focus=hit]').evaluate(el=>{el.click();el.click();});await page.waitForFunction(()=>document.querySelector('.g21-player').children.length===3);assert.equal(posts,p+1);delayed=false;
 scenarios.push('lost connection preserves hand and permits safe retry; rapid double tap sends one request');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('https://motor.test/games/21.php');assert.equal(await page.locator('.g21-card').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.getByText('Как играть',{exact:false}).click();assert.equal(await page.locator('.g21-rules').getAttribute('open'),'');
 // Long hands wrap rather than clipping cards or forcing page sideways.
 await page.evaluate(()=>{const hand=document.querySelector('.g21-player');for(let i=0;i<8;i++)hand.append(hand.firstElementChild.cloneNode(true));});await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 scenarios.push('reduced motion, rules toggle and long hands on 320px');
 const plain=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:844}});await plain.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html',body:readFileSync(join(dir,'ready.html'))});const path=resolve(root,'.'+url.pathname);return path.startsWith(root+'/')&&existsSync(path)?route.fulfill({body:readFileSync(path),contentType:path.endsWith('.css')?'text/css':'image/gif'}):route.fulfill({status:404});});const nojs=await plain.newPage();await nojs.goto('https://motor.test/games/21.php');assert.equal(await nojs.locator('[data-g21-presets]').isVisible(),false);assert.equal(await nojs.getByRole('button',{name:'Раздать карты'}).isEnabled(),true);await plain.close();
 scenarios.push('JavaScript disabled: normal bet form remains usable, inert quick buttons hidden');
 assert.deepEqual(errors,[]);writeFileSync(new URL('./game21-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:themes.length,scenarios,errors,physicalDevices:false},null,2)+'\n');console.log('SUCCESS',layouts,'layouts;',scenarios.length,'browser scenarios');
} finally {await browser.close();}
