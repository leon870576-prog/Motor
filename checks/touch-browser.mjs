import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=resolve(process.argv[2] || fileURLToPath(new URL('../site',import.meta.url)));
const local=fileURLToPath(new URL('.',import.meta.url));
const themes=JSON.parse(readFileSync(join(root,'includes/lesika/themes.json')));
const fixtures=[...JSON.parse(readFileSync(join(local,'touch-fixtures/manifest.json'))).map(f=>({...f,directory:'touch-fixtures'})),...JSON.parse(readFileSync(join(local,'fixtures/manifest.json'))).map(f=>({...f,directory:'fixtures'}))];
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE || fileURLToPath(new URL('../.browser-cache/chromium',import.meta.url)),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const results={browser:browser.version(),pages:[],layouts:[],passed:[],jsErrors:[],physical_devices:false};
const pass=s=>{results.passed.push(s);console.log('PASS',s)};
let fixture=fixtures[0],posts=0;
try{
 const context=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(new URL(route.request().url()).pathname==='/chat/updates.php')return route.fulfill({status:204,body:''});
  if(route.request().method()==='POST'){posts++;return route.fulfill({body:'Captured in isolated test'});}
  if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(local,fixture.directory,fixture.file))});
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.gif')?'image/gif':'application/octet-stream',body:readFileSync(path)});
 });
 const page=await context.newPage();page.on('pageerror',e=>results.jsErrors.push(e.message));
 async function load(f){fixture=f;await page.goto('https://motor.test'+f.url,{waitUntil:'load'});await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--visual-height'));}
 async function layout(){return page.evaluate(compactIds=>{
  const rect=e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height});
  const visible=e=>Boolean(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const targetSize=compactIds.includes(document.body.dataset.theme)&&innerWidth>=900&&matchMedia('(hover:hover) and (pointer:fine)').matches?36:44;
  const targets=[...document.querySelectorAll('input[type="submit"],button:not(:disabled),summary,.touch-link,.icon-button,.bottom-nav a,.nav a,.choice-hit,label:has(>input[type="checkbox"]),label:has(>input[type="radio"])')].filter(visible);
  const tiny=targets.map(e=>({tag:e.tagName,text:(e.textContent||e.value||'').trim().slice(0,45),class:e.className,...rect(e)})).filter(e=>e.width<targetSize-.5||e.height<targetSize-.5);
  const textInputs=[...document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="submit"]):not([type="button"]),textarea,select')].filter(visible);
  return {targetSize,fine:matchMedia('(pointer:fine)').matches,hover:matchMedia('(hover:hover)').matches,theme:document.body.dataset.theme,viewport:innerWidth,document:document.documentElement.scrollWidth,bodyFont:parseFloat(getComputedStyle(document.body).fontSize),tiny,smallInputs:textInputs.filter(e=>parseFloat(getComputedStyle(e).fontSize)<(targetSize===36?14:16)).map(e=>e.name),shell:rect(document.querySelector('.site-shell')).width,navVisible:visible(document.querySelector('.desktop-nav')),bottomVisible:visible(document.querySelector('.bottom-nav'))};
 },Object.keys(themes).filter(id=>themes[id].density==='compact'));}
 // Every actual public/admin form, including comments, retains native values/ownership.
 for(const f of fixtures){
  await page.setViewportSize({width:320,height:680});await load(f);
  const m=await layout();assert.ok(m.document<=m.viewport+1,JSON.stringify({f,m}));assert.ok(m.bodyFont >= (themes[m.theme]?.density === 'compact' ? 14 : 16));assert.deepEqual(m.tiny,[],f.url);assert.deepEqual(m.smallInputs,[],f.url);
  const sameForms=await page.evaluate(html=>{
   const original=new DOMParser().parseFromString(html,'text/html');
   const serialize=doc=>[...doc.forms].map(form=>[...form.elements].filter(e=>e.name).map(e=>({tag:e.tagName,name:e.name,type:e.type,value:e.value,checked:e.checked,disabled:e.disabled})));
   return JSON.stringify(serialize(document))===JSON.stringify(serialize(original));
  },readFileSync(join(local,f.directory,f.file),'utf8'));
  assert.ok(sameForms,'native form fields changed: '+f.url);
  results.pages.push({url:f.url,role:f.role,theme:f.theme||'stored',width:320,minTarget:m.targetSize,noOverflow:true});
 }
 pass(`${fixtures.length} PHP-generated pages/forms at 320px: readable text, 44px actions, no overflow and unchanged form values`);
 const home=fixtures.find(f=>f.url==='/index.php'&&f.role==='guest');
 for(const [width,height]of [[320,568],[360,780],[390,844],[430,932],[768,1024],[1024,768],[1440,1000]]){
  await page.setViewportSize({width,height});await load(home);
  for(const [theme,info]of Object.entries(themes)){
   await page.evaluate(t=>document.body.dataset.theme=t,theme);
   const m=await layout();assert.ok(m.document<=width+1,JSON.stringify({width,theme,m}));assert.deepEqual(m.tiny,[],JSON.stringify({width,theme,m}));assert.deepEqual(m.smallInputs,[]);
   const columns=await page.locator('.home-sections').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
   if(width<600)assert.equal(columns,1);
   if(width>=900&&info.layout==='web'){assert.ok(m.shell>850,JSON.stringify(m));assert.ok(m.navVisible);assert.equal(m.bottomVisible,false);assert.ok(columns>=2);}
   if(width<600){assert.equal(m.navVisible,false);assert.ok(m.bottomVisible);}
   results.layouts.push({width,height,theme,columns,shell:m.shell,noOverflow:true});
   if(width===1440&&info.layout==='web')await page.screenshot({path:join(local,theme+'.png'),fullPage:true});
   if(width===390&&theme==='lesika_dvor')await page.screenshot({path:join(local,'touch-mobile.png'),fullPage:true});
  }
 }
 pass('84 real Chromium layouts: 12 themes, 320–1440px, adaptive columns and desktop navigation');
 // Touch menu remains scrollable and can be closed without hunting for a tiny icon.
 await page.setViewportSize({width:360,height:640});await load(home);
 await page.locator('.site-menu summary').tap();assert.ok(await page.locator('.menu-panel').isVisible());
 const menu=await page.locator('.menu-panel').evaluate(e=>({h:e.clientHeight,scroll:e.scrollHeight,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}));
 assert.ok(menu.bottom<=640&&menu.scroll>=menu.h);await page.locator('.menu-panel a').last().scrollIntoViewIfNeeded();
 await page.keyboard.press('Escape');assert.equal(await page.locator('.site-menu').getAttribute('open'),null);
 await page.locator('.site-menu summary').tap();await page.locator('.welcome').tap({position:{x:3,y:20}});assert.equal(await page.locator('.site-menu').getAttribute('open'),null);
 pass('native touch menu, internal scrolling, outside dismissal and keyboard Escape');
 const settings=fixtures.find(f=>f.url==='/pages/setting.php');await load(settings);
 const radio=page.locator('input[type="radio"][value="0"]').first();const label=radio.locator('..');await label.tap();assert.ok(await radio.isChecked());assert.equal(posts,0);
 const media=fixtures.find(f=>f.url==='/mpanel/attachments.php');await load(media);
 const check=page.locator('input[type="checkbox"]').first();const before=await check.isChecked();await check.locator('..').tap();assert.equal(await check.isChecked(),!before);assert.equal(posts,0);
 pass('touch radio/checkbox labels preserve native behavior without submitting');
 // Larger system font must reflow without disabling zoom.
 await page.setViewportSize({width:360,height:780});await load(home);await page.evaluate(()=>document.documentElement.style.fontSize='200%');let m=await layout();assert.ok(m.document<=361,JSON.stringify(m));
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');assert.ok(!/maximum-scale|user-scalable=no/.test(viewport));
 pass('200% text reflow and user zoom remain available');
 // Simulate the VisualViewport signals used by Android/iOS keyboards and pinch zoom.
 const login=fixtures.find(f=>f.url==='/pages/login.php');await load(login);await page.locator('input[name="login"]').focus();
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-300});visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>document.body.hasAttribute('data-keyboard-open'));
 assert.equal(await page.locator('body').getAttribute('data-keyboard-open'),'');assert.equal(await page.locator('.bottom-nav').isVisible(),false);
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'scale',{configurable:true,value:2});visualViewport.dispatchEvent(new Event('resize'));});
 await page.waitForFunction(()=>!document.body.hasAttribute('data-keyboard-open'));
 assert.equal(await page.locator('body').getAttribute('data-keyboard-open'),null);
 pass('simulated visual viewport: navigation yields space to keyboard, pinch zoom does not hide it');
 assert.deepEqual(results.jsErrors,[]);assert.equal(posts,0);results.unintendedPosts=posts;
 writeFileSync(join(local,'touch-browser-results.json'),JSON.stringify(results,null,2));
}finally{await browser.close();}
