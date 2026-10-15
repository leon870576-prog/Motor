import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {brotliDecompressSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=resolve(process.argv[2] || fileURLToPath(new URL('../site',import.meta.url)));
const fixtureDir=fileURLToPath(new URL('./fixtures',import.meta.url));
const fixtures=JSON.parse(readFileSync(join(fixtureDir,'manifest.json')));
let executablePath=process.env.MOTOR_BROWSER_EXECUTABLE;
if(!executablePath){
 const cache=fileURLToPath(new URL('../.browser-cache/',import.meta.url));mkdirSync(cache,{recursive:true});executablePath=join(cache,'chromium');
 if(!existsSync(executablePath)){
  const entry=require.resolve('@sparticuz/chromium');const archive=resolve(dirname(entry),'../bin/chromium.br');
  writeFileSync(executablePath,brotliDecompressSync(readFileSync(archive)));chmodSync(executablePath,0o755);
 }
}
const browser=await chromium.launch({args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],executablePath,headless:true});
const passed=[],errors=[],dialogs=[],measurements=[];const pass=s=>{passed.push(s);console.log('PASS',s)};
try {
 const context=await browser.newContext({viewport:{width:360,height:740},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 let fixture=fixtures[0],posts=0;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'){posts++;return route.fulfill({status:200,contentType:'text/plain',body:'Captured test submission'});}
  if(url.pathname.endsWith('.php'))return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:readFileSync(join(fixtureDir,fixture.file))});
  const p=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404,body:''});
  const contentType=p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.gif')?'image/gif':'application/octet-stream';
  return route.fulfill({status:200,contentType,body:readFileSync(p)});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 const load=async f=>{fixture=f;await page.goto('https://motor.test'+f.url,{waitUntil:'networkidle'});};
 const field=()=>page.locator('[data-smile-picker]').first();
 const trigger=()=>page.locator('.smile-picker-toggle').first();
 // Every PHP-generated form must gain exactly one collapsed control per marked field.
 for(const f of fixtures.filter(f=>f.fields)){
  await load(f);assert.equal(await page.locator('.smile-picker-toggle').count(),f.fields,f.url);
  assert.equal(await page.locator('.smile-picker-panel:visible').count(),0,f.url);
  await trigger().click();assert.equal(await page.locator('.smile-picker-panel:visible').count(),1,f.url);
  assert.equal(await page.locator('.smile-picker-choice').count(),105,f.url);
  const expectedAdmin=f.role==='admin' && await field().getAttribute('data-smile-scope')!=='common';
  assert.equal(await page.getByRole('button',{name:'Админ',exact:true}).count(),expectedAdmin?1:0,f.url);
  await page.getByRole('button',{name:'Вставить :hello',exact:true}).click();
  assert.ok((await field().inputValue()).includes(':hello'),f.url);assert.equal(await page.locator('.smile-picker-panel:visible').count(),0);
 }
 assert.equal(posts,0);pass('all PHP-generated composition/edit/comment forms: compact toggle, correct catalogue, insertion, auto-close, no unintended POST');
 const forum=fixtures.find(f=>f.role==='member'&&f.url.startsWith('/forum/topic'));
 await load(forum);
 await field().fill('Начало середина конец');await field().evaluate(el=>{el.focus();el.setSelectionRange(7,15);});
 await trigger().click();await page.getByRole('button',{name:'Вставить :hello',exact:true}).click();
 assert.equal(await field().inputValue(),'Начало :hello конец');assert.equal(await field().evaluate(el=>el.selectionStart),14);
 await trigger().click();await page.getByRole('button',{name:'Эмодзи',exact:true}).click();assert.equal(await page.locator('.smile-picker-choice').count(),32);
 await page.getByRole('button',{name:'Вставить Улыбка',exact:true}).click();assert.ok((await field().inputValue()).includes('😊'));
 assert.ok(await field().evaluate(el=>document.activeElement===el));pass('cursor position, replacing selection, Unicode emoji and returning focus to text');
 await trigger().click();await page.getByRole('searchbox').fill('hello');assert.equal(await page.locator('.smile-picker-choice').count(),1);
 await page.getByRole('searchbox').press('Enter');assert.equal(posts,0);await page.getByRole('searchbox').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('.smile-picker-choice').count(),0);assert.equal(await page.locator('.smile-picker-grid img').count(),0);
 await page.getByRole('searchbox').press('Escape');assert.equal(await page.locator('.smile-picker-panel:visible').count(),0);assert.ok(await trigger().evaluate(el=>document.activeElement===el));
 await field().evaluate(el=>{el.maxLength=5;});await field().fill('12345');await trigger().click();await page.getByRole('button',{name:'Вставить :hello',exact:true}).click();assert.equal(await field().inputValue(),'12345');assert.ok((await page.locator('.smile-picker-status').first().innerText()).includes('лимит'));
 await page.getByRole('button',{name:'Закрыть смайлы'}).click();pass('search, empty result, escaping, Enter prevention, Escape/close and maxlength enforcement');
 const poll=fixtures.find(f=>f.url==='/mpanel/votes.php');await load(poll);
 const inputs=page.locator('[data-smile-picker]');await inputs.nth(0).fill('Вопрос');await inputs.nth(1).fill('Первый ответ');
 await page.locator('.smile-picker-toggle').nth(0).click();await page.locator('.smile-picker-toggle').nth(1).click();assert.equal(await page.locator('.smile-picker-panel:visible').count(),1);
 await page.getByRole('button',{name:'Вставить :hello',exact:true}).click();assert.equal(await inputs.nth(0).inputValue(),'Вопрос');assert.ok((await inputs.nth(1).inputValue()).includes(':hello'));
 await page.locator('.smile-picker-toggle').nth(1).click();await page.locator('h1, .page-topline').first().click();assert.equal(await page.locator('.smile-picker-panel:visible').count(),0);pass('multiple fields use one panel, correct destination, and outside-click dismissal');
 // Actual layout at narrow, normal, wide mobile and landscape sizes in all themes.
 for(const [width,height]of [[320,568],[360,740],[390,844],[430,932],[740,360]]){
  await page.setViewportSize({width,height});await load(forum);
  for(const theme of Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))))){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);await trigger().click();
   const m=await page.locator('.smile-picker-panel').evaluate(el=>{const box=el.getBoundingClientRect(),grid=el.querySelector('.smile-picker-grid'),cell=grid.querySelector('button').getBoundingClientRect();return{width:box.width,height:box.height,left:box.left,right:box.right,overflow:document.documentElement.scrollWidth>innerWidth,scrollable:grid.scrollHeight>grid.clientHeight,cellWidth:cell.width,cellHeight:cell.height,position:getComputedStyle(el).position};});
   assert.ok(m.height<=233,JSON.stringify(m));assert.ok(m.left>=0&&m.right<=width+1,JSON.stringify(m));assert.equal(m.overflow,false);assert.equal(m.scrollable,true);assert.ok(m.cellWidth>=43&&m.cellHeight>=43);assert.equal(m.position,'static');measurements.push({width,height,theme,...m});
   if(width===360&&theme==='lesika_dvor')await page.screenshot({path:fileURLToPath(new URL('./picker-mobile.png',import.meta.url))});
   await page.getByRole('button',{name:'Закрыть смайлы'}).click();
  }
 }
 pass('60 real Chromium mobile/landscape layouts: all twelve themes, <=232 px panel, no overlay/overflow, scrolling and 44 px smile targets');
 // Click the last catalogue item after scrolling: all 105 remain reachable.
 await load(forum);await trigger().click();await page.locator('.smile-picker-choice').last().scrollIntoViewIfNeeded();const label=await page.locator('.smile-picker-choice').last().getAttribute('aria-label');await page.locator('.smile-picker-choice').last().click();assert.ok((await field().inputValue()).includes(label.replace('Вставить ','')));pass('last smile is reachable and inserts correctly after scrolling');
 // Real touch events must still produce clicks after pointerdown prevention.
 await page.setViewportSize({width:360,height:740});await load(forum);await field().fill('Телефон');
 await trigger().tap();await page.getByRole('button',{name:'Эмодзи',exact:true}).tap();await page.getByRole('button',{name:'Вставить Улыбка',exact:true}).tap();
 assert.ok((await field().inputValue()).includes('😊'));assert.equal(await page.locator('.smile-picker-panel:visible').count(),0);
 await load(poll);await page.locator('.smile-picker-toggle').nth(0).tap();await page.locator('.smile-picker-toggle').nth(1).tap();await page.getByRole('button',{name:'Вставить :hello',exact:true}).tap();assert.ok((await page.locator('[data-smile-picker]').nth(1).inputValue()).includes(':hello'));
 pass('native touchscreen taps: opening, group selection, insertion, auto-close and switching fields');
 // The standalone catalogue can copy codes; this uses only the browser test clipboard stub.
 await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.testClipboard=text;}}});});
 await load(fixtures.find(f=>!f.fields));await page.locator('[data-smile-copy]').first().click();assert.equal(await page.evaluate(()=>window.testClipboard),await page.locator('[data-smile-copy]').first().getAttribute('data-smile-copy'));pass('standalone catalogue click-to-copy');
 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);assert.equal(posts,0);
 writeFileSync(new URL('./picker-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),passed,measurements,jsErrors:errors,unexpectedDialogs:dialogs,physical_devices:false},null,2));
}finally{await browser.close()}
