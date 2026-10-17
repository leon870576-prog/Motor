import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=resolve(process.argv[2]||fileURLToPath(new URL('../site',import.meta.url))),dir=fileURLToPath(new URL('./gallery-fixtures/',import.meta.url));
const fixtures=JSON.parse(readFileSync(join(dir,'manifest.json'))),passed=[],errors=[],measurements=[];let posts=0,originalRequests=0,fixture=fixtures[0];
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const pass=s=>{passed.push(s);console.log('PASS',s)};
try{
 const context=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST'){posts++;return route.fulfill({status:200,body:'Unexpected POST'});}
  if(url.pathname==='/gallery/fullsize.php'){originalRequests++;return route.fulfill({status:200,contentType:'image/jpeg',body:readFileSync(join(dir,'original.jpg'))});}
  if(url.pathname==='/gallery/resize.php')return route.fulfill({status:200,contentType:'image/jpeg',body:readFileSync(join(dir,'preview.jpg'))});
  if(url.pathname.endsWith('.php'))return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture.file))});
  const p=resolve(root,'.'+url.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404,body:''});
  return route.fulfill({status:200,contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.gif')?'image/gif':'application/octet-stream',body:readFileSync(p)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const load=async f=>{fixture=f;await page.goto('https://motor.test'+f.url,{waitUntil:'load'});if(await page.locator('.gallery-photo img').count())await page.locator('.gallery-photo img').first().evaluate(img=>img.decode());await page.evaluate(()=>new Promise(requestAnimationFrame));};
 const detail=fixtures.filter(f=>f.url.startsWith('/gallery/index.php?action=showimg'));
 for(const width of [320,360,390,430,768,1024,1440]){
  await page.setViewportSize({width,height:800});
  for(const f of detail){
   await load(f);
   const m=await page.evaluate(()=>{const img=document.querySelector('.gallery-photo img'),r=img.getBoundingClientRect(),p=img.closest('.gallery-card').getBoundingClientRect();return{theme:document.body.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth+1,left:r.left,right:r.right,width:r.width,height:r.height,cardWidth:p.width,loaded:img.complete&&img.naturalWidth>0};});
   assert.equal(m.overflow,false,JSON.stringify(m));assert.ok(m.left>=0&&m.right<=width+1&&m.width<=m.cardWidth&&m.loaded,JSON.stringify(m));measurements.push({viewport:width,...m});
  }
 }
 assert.equal(originalRequests,0);pass('84 layouts in all 12 themes: photo fits display, no overflow, originals are not downloaded automatically');
 // All new/modified administration and user forms remain usable on narrow phones.
 for(const f of fixtures.filter(f=>!f.url.includes('showimg'))){
  await page.setViewportSize({width:320,height:568});await load(f);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),f.url);
  if(f.url==='/mpanel/gallery-settings.php'){
   const watermark=page.getByLabel('Текст водяного знака',{exact:true});assert.equal(await watermark.inputValue(),'Лесика — сайт.ру');assert.equal(await watermark.getAttribute('maxlength'),'60');
   await watermark.fill('Мой город — фотографии');assert.equal(await watermark.inputValue(),'Мой город — фотографии');assert.ok(await page.locator('#watermark-help').isVisible());
   await page.screenshot({path:join(dir,'watermark-settings-mobile.png'),fullPage:true});
  }
  for(const b of await page.locator('button:visible,input[type=submit]:visible,select:visible,input[type=file]:visible,.gallery-actions a:visible').all()){
   const r=await b.boundingBox();assert.ok(r.height>=43&&r.width>=43,JSON.stringify({url:f.url,r}));
  }
  if(await page.locator('[data-smile-picker]').count()){await page.locator('.smile-picker-toggle').first().tap();await page.getByRole('button',{name:'Вставить :hello',exact:true}).tap();assert.ok((await page.locator('[data-smile-picker]').first().inputValue()).includes(':hello'));}
 }
 pass('upload, comments, moderator list/edit and admin settings fit 320 px; 44 px controls and smile insertion');
 await page.setViewportSize({width:360,height:740});await load(detail[0]);
 await page.locator('[data-gallery-zoom]').tap();await page.locator('.gallery-stage img:visible').waitFor();
 await page.waitForFunction(()=>document.querySelector('.gallery-stage img').naturalWidth>0);
 assert.equal(originalRequests,1);assert.equal(await page.locator('.gallery-viewer').evaluate(e=>e.open),true);
 assert.equal(await page.locator('.gallery-scale').innerText(),'100%');
 let m=await page.locator('.gallery-stage img').boundingBox();assert.ok(m.width<=360&&m.height<=740);
 await page.getByRole('button',{name:'Увеличить',exact:true}).tap();assert.equal(await page.locator('.gallery-scale').innerText(),'140%');
 await page.getByRole('button',{name:'Показать целиком',exact:true}).tap();assert.equal(await page.locator('.gallery-scale').innerText(),'100%');
 await page.screenshot({path:join(dir,'viewer-mobile.png')});
 const cdp=await context.newCDPSession(page);
 const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i,radiusX:4,radiusY:4,force:1}))});
 // Native two-finger pinch, then pan the enlarged picture.
 await touch('touchStart',[[140,300],[220,300]]);await touch('touchMove',[[100,300],[260,300]]);await touch('touchMove',[[60,300],[300,300]]);await touch('touchEnd',[]);
 assert.ok(parseInt(await page.locator('.gallery-scale').innerText())>150);
 const before=await page.locator('.gallery-stage img').evaluate(e=>e.style.transform);
 await touch('touchStart',[[180,320]]);await touch('touchMove',[[240,380]]);await touch('touchEnd',[]);
 const after=await page.locator('.gallery-stage img').evaluate(e=>e.style.transform);assert.notEqual(after,before);
 await page.getByRole('button',{name:'Показать целиком',exact:true}).tap();
 await page.waitForFunction(()=>document.querySelector('.gallery-scale').textContent==='100%',{},{timeout:2000});
 // Native double touch, cancellation and rotating the phone.

 await touch('touchStart',[[180,300]]);await touch('touchEnd',[]);await touch('touchStart',[[180,300]]);await touch('touchEnd',[]);
 assert.equal(await page.locator('.gallery-scale').innerText(),'250%');
 await touch('touchStart',[[180,300]]);await touch('touchCancel',[]);
 await page.setViewportSize({width:740,height:360});await page.getByRole('button',{name:'Показать целиком',exact:true}).tap();
 const stage=await page.locator('.gallery-stage').boundingBox(),image=await page.locator('.gallery-stage img').boundingBox();assert.ok(image.width<=stage.width+1&&image.height<=stage.height+1);
 for(const b of await page.locator('.gallery-toolbar button').all()){const r=await b.boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=740&&r.y+r.height<=360&&r.height>=44);}
 await page.getByRole('button',{name:'Закрыть просмотр'}).tap();await page.waitForFunction(()=>!document.querySelector('.gallery-viewer').open&&document.body.style.overflow!=='hidden');assert.equal(await page.locator('.gallery-viewer').evaluate(e=>e.open),false);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.ok(await page.locator('[data-gallery-zoom]').evaluate(e=>e===document.activeElement));
 pass('real Chromium touch pinch, pan, double tap, pointer cancellation, rotation, reset, close and focus restoration');
 // Keyboard operation, focus containment, upper zoom bound and enlarged text.
 await page.setViewportSize({width:320,height:568});await load(detail[0]);await page.locator('[data-gallery-zoom]').click();await page.locator('.gallery-stage img:visible').waitFor();
 for(let i=0;i<12;i++)await page.keyboard.press('+');assert.equal(await page.locator('.gallery-scale').innerText(),'500%');
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.gallery-viewer')));}
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.gallery-viewer').open&&document.body.style.overflow!=='hidden');assert.equal(await page.locator('.gallery-viewer').evaluate(e=>e.open),false);
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('[data-gallery-zoom]').click();await page.getByRole('button',{name:'Закрыть просмотр'}).click();
 pass('keyboard zoom bounded at 500%, focus stays in modal, Escape closes, 200% text and narrow-screen close button');
 assert.equal(posts,0);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./gallery-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),passed,measurements,jsErrors:errors,unexpected_posts:posts,physical_devices:false},null,2));
}finally{await browser.close();}
