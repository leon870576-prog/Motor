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
  if(new URL(route.request().url()).pathname==='/chat/updates.php')return route.fulfill({status:204,body:''});
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
 const trigger=()=>page.locator('.tag-picker-toggle').first();
 for(const f of fixtures.filter(f=>f.fields)) {
  await load(f);assert.equal(await page.locator('.tag-picker-toggle').count(),f.fields,f.url);
  assert.equal(await page.locator('.tag-picker-panel:visible').count(),0);
  await field().fill('Текст');await field().evaluate(el=>{el.focus();el.setSelectionRange(0,5);});
  await trigger().tap();await page.getByRole('button',{name:'Вставить тег: Жирный',exact:true}).tap();
  assert.equal(await field().inputValue(),'[b]Текст[/b]',f.url);assert.equal(await page.locator('.tag-picker-panel:visible').count(),0);
 }
 assert.equal(posts,0);pass('all 27 PHP-generated message/comment/edit forms get functional tag pickers without POST');
 const forum=fixtures.find(f=>f.role==='member'&&f.url.startsWith('/forum/topic'));
 await load(forum);
 for(const [tag,name] of [['b','Жирный'],['i','Курсив'],['u','Подчёркнутый'],['del','Зачёркнутый'],['q','Цитата'],['code','Код'],['big','Крупный'],['small','Мелкий'],['red','Красный'],['green','Зелёный'],['blue','Синий'],['yellow','Золотой']]) {
  await field().fill('Текст');await field().evaluate(el=>{el.focus();el.setSelectionRange(0,5);});await trigger().tap();
  await page.getByRole('button',{name:'Вставить тег: '+name,exact:true}).tap();assert.equal(await field().inputValue(),`[${tag}]Текст[/${tag}]`);
 }
 await field().fill('До после');await field().evaluate(el=>{el.focus();el.setSelectionRange(3,3);});await trigger().tap();await page.getByRole('button',{name:'Вставить тег: Жирный',exact:true}).tap();
 assert.equal(await field().inputValue(),'До [b][/b]после');assert.equal(await field().evaluate(el=>el.selectionStart),6);
 await field().fill('Сайт');await field().evaluate(el=>{el.focus();el.setSelectionRange(0,4);});await trigger().tap();await page.getByRole('button',{name:'Вставить тег: Ссылка',exact:true}).tap();
 for(const address of ['', 'javascript:alert(1)', 'javascript://example.test', 'data:text/html,x', 'ftp://example.test', 'https://user:pass@example.test', 'user@example.test', 'https://x.test/"onerror=x', '/example.test', '?example.test', '#example.test', 'example.test/[b]', 'example.test\\bad', 'не адрес.ру']){
  await page.getByRole('textbox',{name:'Адрес ссылки',exact:true}).fill(address);await page.getByRole('button',{name:'Вставить ссылку',exact:true}).tap();assert.equal(await field().inputValue(),'Сайт');
 }
 await page.getByRole('textbox',{name:'Адрес ссылки',exact:true}).fill('https://example.test/path?a=1&b=2');await page.getByRole('button',{name:'Вставить ссылку',exact:true}).tap();assert.equal(await field().inputValue(),'[url=https://example.test/path?a=1&b=2]Сайт[/url]');
 for(const [address,expected] of [
  ['сайт.ру','https://сайт.ру'],['пример.рф/страница?а=1&б=2#раздел','https://пример.рф/страница?а=1&б=2#раздел'],
  ['example.com','https://example.com'],[' www.example.com/path?q=1#part ','https://www.example.com/path?q=1#part'],
  ['example.com:8443/path','https://example.com:8443/path'],['http://example.com/path','http://example.com/path']
 ]) {
  await field().fill('Сайт');await field().evaluate(el=>{el.focus();el.setSelectionRange(0,4);});await trigger().tap();await page.getByRole('button',{name:'Вставить тег: Ссылка',exact:true}).tap();
  const addressField=page.getByRole('textbox',{name:'Адрес ссылки',exact:true});await addressField.fill(address);await addressField.press('Enter');
  assert.equal(await field().inputValue(),`[url=${expected}]Сайт[/url]`);assert.equal(await page.locator('.tag-picker-url').evaluate(e=>e.validity.valid),true,'bare address must not block form submission');
 }
 assert.equal(posts,0);pass('bare Latin/Cyrillic domains, paths, queries and ports get HTTPS; explicit HTTP preserved; invalid schemes rejected without form submission');
 await trigger().tap();await page.getByRole('searchbox',{name:'Поиск тега'}).fill('жир');assert.equal(await page.locator('.tag-picker-choice').count(),1);
 await page.getByRole('searchbox',{name:'Поиск тега'}).press('Enter');assert.equal(posts,0);
 await page.getByRole('searchbox',{name:'Поиск тега'}).fill('<svg/onload=alert(1)>');assert.equal(await page.locator('.tag-picker-choice').count(),0);await page.keyboard.press('Escape');assert.equal(await page.locator('.tag-picker-panel:visible').count(),0);
 await field().evaluate(e=>e.maxLength=5);await field().fill('12345');await field().evaluate(e=>{e.focus();e.setSelectionRange(5,5);});await trigger().tap();await page.getByRole('button',{name:'Вставить тег: Жирный',exact:true}).tap();assert.equal(await field().inputValue(),'12345');assert.ok((await page.locator('.tag-picker-status').first().innerText()).includes('лимит'));await page.keyboard.press('Escape');
 pass('12 formatting tags, caret/selection, validated HTTPS links, search, keyboard, maxlength and text escaping');
 await load(fixtures.find(f=>f.url==='/mpanel/votes.php'));
 const inputs=page.locator('[data-smile-picker]');await inputs.nth(0).fill('Вопрос');await inputs.nth(1).fill('Ответ');
 await page.locator('.tag-picker-toggle').nth(0).tap();await page.locator('.tag-picker-toggle').nth(1).tap();await page.getByRole('button',{name:'Вставить тег: Курсив',exact:true}).tap();
 assert.equal(await inputs.nth(0).inputValue(),'Вопрос');assert.equal(await inputs.nth(1).inputValue(),'Ответ[i][/i]');
 await trigger().tap();await page.locator('.smile-picker-toggle').first().tap();assert.equal(await page.locator('.tag-picker-panel:visible').count(),0);assert.equal(await page.locator('.smile-picker-panel:visible').count(),1);
 await trigger().tap();assert.equal(await page.locator('.tag-picker-panel:visible').count(),1);assert.equal(await page.locator('.smile-picker-panel:visible').count(),0);
 await page.locator('.page-topline').click();assert.equal(await page.locator('.tag-picker-panel:visible').count(),0);
 pass('multiple inputs, switching smile/tag panels, one visible panel, outside dismissal');
 const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
 for(const [width,height] of [[320,568],[360,740],[390,844],[740,360],[1440,900]]){
  await page.setViewportSize({width,height});await load(forum);
  for(const theme of themes){
   await page.evaluate(theme=>document.body.dataset.theme=theme,theme);await trigger().tap();
   const m=await page.locator('.tag-picker-panel').evaluate(el=>{const r=el.getBoundingClientRect();return{h:r.height,l:r.left,r:r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,scroll:el.scrollHeight>el.clientHeight}});
   assert.ok(m.h<=233 && m.l>=0 && m.r<=width+1 && !m.overflow,JSON.stringify({width,theme,m}));
   for(const b of await page.locator('.tag-picker-choice').all()){const q=await b.boundingBox();assert.ok(q.height>=44&&q.width>=44);}
   measurements.push({width,theme,...m});await page.keyboard.press('Escape');
  }
 }
 await page.setViewportSize({width:360,height:740});await load(forum);await trigger().tap();await page.screenshot({path:join(fixtureDir,'tags-mobile.png')});
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 pass('60 layouts across all 12 themes, mobile/landscape/desktop, 44px targets, bounded panel and 200% text');
 const avatars=JSON.parse(readFileSync(new URL('./avatar-fixtures/manifest.json',import.meta.url)));
 for(const f of avatars){
  fixture=f;const source=readFileSync(new URL('./avatar-fixtures/'+f.file,import.meta.url));
  await page.route('**/*.php*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:source}));
  await page.goto('https://motor.test'+f.url,{waitUntil:'networkidle'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),f.url);
  for(const im of await page.locator('img.motor-avatar').all()) {await im.scrollIntoViewIfNeeded();await im.evaluate(e=>e.decode());assert.equal(await im.evaluate(e=>e.naturalWidth),/images\/img\/(mag|bot|shut)\.gif/.test(await im.getAttribute('src'))?256:128);}
  await page.unroute('**/*.php*');
 }
 const security=JSON.parse(readFileSync(new URL('./security-fixture.json',import.meta.url)));
 await page.setContent('<!doctype html><html><body>'+security.security_outputs.map(s=>'<div>'+s+'</div>').join('')+'</body></html>');
 assert.equal(await page.locator('script,iframe,object,svg').count(),0);assert.equal(await page.locator('[onerror],[onload],[onmouseover]').count(),0);
 for(const link of await page.locator('a').all())assert.ok(await link.evaluate(e=>['http:','https:'].includes(e.protocol)));
 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);assert.equal(posts,0);
 pass('128px avatars load and fit narrow screens; real DOM has no injected scripts, handlers or unsafe links');
 writeFileSync(new URL('./tags-browser-results.json',import.meta.url),JSON.stringify({passed,measurements,jsErrors:errors,unexpectedDialogs:dialogs,posts},null,2));
} finally {await browser.close();}
