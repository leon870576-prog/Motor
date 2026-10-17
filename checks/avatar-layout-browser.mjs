import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),checks=fileURLToPath(new URL('.',import.meta.url));
const fixtures=['avatar-layout-fixtures','avatar-fixtures'].flatMap(directory=>JSON.parse(readFileSync(join(checks,directory,'manifest.json'))).map(f=>({...f,directory})));
const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const report={pages:[],layouts:0,imagesChecked:0,jsErrors:[],unexpectedPosts:0};
let fixture;
try {
 const context=await browser.newContext({viewport:{width:320,height:780},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(new URL(route.request().url()).pathname==='/chat/updates.php')return route.fulfill({status:204,body:''});
  if(request.method()!=='GET'){report.unexpectedPosts++;return route.abort();}
  if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(checks,fixture.directory,fixture.file))});
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.gif')?'image/gif':'application/octet-stream',body:readFileSync(file)});
 });
 const page=await context.newPage();page.on('pageerror',e=>report.jsErrors.push(e.message));
 async function load(f) {
  fixture=f;await page.goto('https://motor.test'+f.url,{waitUntil:'load'});
  await page.locator('img.motor-avatar').evaluateAll(images=>Promise.all(images.map(e=>{e.loading='eager';return e.decode();})));
 }
 async function check() {
  const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.querySelectorAll('img.motor-avatar')].map(e=>{
   const r=e.getBoundingClientRect(),s=getComputedStyle(e),header=e.closest('.b'),h=header?.getBoundingClientRect();
   return {w:r.width,h:r.height,size:Number(e.getAttribute('width')),natural:e.naturalWidth,fit:s.objectFit,radius:s.borderTopLeftRadius,card:!!e.closest('.avatar-card'),headerFits:!h||(r.top>=h.top&&r.bottom<=h.bottom),right:r.right};
  })}));
  assert.ok(!data.overflow,'horizontal overflow: '+fixture.url);assert.ok(data.images.length>0,fixture.url+' has no avatars');
  for(const im of data.images){assert.ok(Math.abs(im.w-im.h)<.6,JSON.stringify(im));assert.equal(im.fit,'contain');assert.equal(im.radius,'0px');assert.ok(im.headerFits,fixture.url+' header clips image');assert.ok(im.natural>=128);assert.ok(im.card?im.w>=70&&im.w<=96.1:Math.abs(im.w-im.size)<.6,fixture.url+' wrong size '+JSON.stringify(im));}
  report.layouts++;report.imagesChecked+=data.images.length;
 }
 for(const f of fixtures) {
  await load(f);
  for(const width of [320,390,1440]) {
   await page.setViewportSize({width,height:780});
   for(const theme of themes){await page.evaluate(t=>document.body.dataset.theme=t,theme);await check();}
  }
  report.pages.push(f.url);
 }
 const chat=fixtures.find(f=>f.url==='/chat/index.php'&&f.directory==='avatar-fixtures');
 await load(chat);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.body.dataset.theme='lesika_dvor');
 await page.screenshot({path:join(checks,'chat-avatars-mobile.png'),fullPage:true});
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');await check();
 // A rectangular personal upload must also remain entirely visible in its square box.
 const first=page.locator('img.motor-avatar').first();
 await first.evaluate(async e=>{e.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="400" height="80" fill="gold"/><rect width="20" height="80" fill="blue"/><rect x="380" width="20" height="80" fill="red"/></svg>');await e.decode();});
 assert.equal(await first.evaluate(e=>getComputedStyle(e).objectFit),'contain');
 assert.deepEqual(report.jsErrors,[]);assert.equal(report.unexpectedPosts,0);
 writeFileSync(join(checks,'avatar-layout-results.json'),JSON.stringify(report,null,2));
 console.log('PASS',JSON.stringify({pages:report.pages.length,layouts:report.layouts,imagesChecked:report.imagesChecked,themes:themes.length,fullImages:true,unexpectedPosts:0}));
} finally {await browser.close();}
