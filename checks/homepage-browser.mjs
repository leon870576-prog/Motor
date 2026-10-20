import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json'))),dir=new URL('./homepage-fixtures/',import.meta.url);
const fixtures=[['guest-home.html','/index.php'],['full-home.html','/index.php'],['admin.html','/mpanel/home-settings.php'],['picker.html','/mpanel/home-settings.php?block=board'],['gallery-80.html','/index.php'],['gallery-480.html','/index.php'],['photos-only-home.html','/index.php'],['no-media-home.html','/index.php']];
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let fixture=fixtures[0],theme=themes[0],layouts=0;const errors=[],posts=[],compactGallery=[];
try{
 const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:320,height:844}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.pathname==='/chat/updates.php')return route.fulfill({status:204});
  if(req.method()==='POST'){posts.push({url:req.url(),data:Object.fromEntries(new URLSearchParams(req.postData()))});return route.fulfill({body:'Captured safely'});}
  if(u.pathname==='/attachment.php'){const video=u.searchParams.get('file')==='2'.repeat(32);return route.fulfill({contentType:video?'video/mp4':'image/gif',body:video?readFileSync(new URL('./sample.mp4',import.meta.url)):readFileSync(root+'/images/avators/1.gif')});}
  if(u.pathname==='/gallery/resize.php')return route.fulfill({contentType:'image/gif',body:readFileSync(root+'/images/avators/1.gif')});
  if(u.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(new URL(fixture[0],dir),'utf8').replace(/data-theme="[^"]+"/,'data-theme="'+theme+'"')});
  const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404});
  return route.fulfill({contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(p)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(fixture of fixtures)for(theme of themes)for(const width of [320,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test'+fixture[1],{waitUntil:'load'});if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const m=await page.evaluate(()=>{
   const shown=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
   const fields=[...document.querySelectorAll('.home-settings-form input:not([type=hidden]):not([type=checkbox]),.home-settings-form select,.home-picker input[type=search]')].filter(shown);
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,small:fields.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.name),tiny:[...document.querySelectorAll('.home-settings-form button,.home-picker button:not(:disabled),.home-open')].filter(shown).filter(e=>e.getBoundingClientRect().height<43.5).map(e=>e.textContent),blocks:[...document.querySelectorAll('[data-home-block]')].map(e=>e.dataset.homeBlock),photos:[...document.querySelectorAll('.home-photo img')].map(e=>({fit:getComputedStyle(e).objectFit,width:e.getBoundingClientRect().width,parent:e.parentElement.getBoundingClientRect().width})),settings:document.querySelector('.home-settings-form')?.method};
  });
  assert.equal(m.overflow,false,JSON.stringify({fixture,theme,width,zoom,m}));if(width<900)assert.deepEqual(m.small,[],JSON.stringify({fixture,theme,width,zoom,m}));assert.deepEqual(m.tiny,[],JSON.stringify({fixture,theme,width,zoom,m}));
  for(const p of m.photos){assert.equal(p.fit,'contain');assert.ok(p.width<=p.parent+1);}
  const homepage=fixture[1]==='/index.php',galleryVisible=homepage&&fixture[0]!=='no-media-home.html';
  if(galleryVisible){
   const target=fixture[0]==='gallery-80.html'?80:fixture[0]==='gallery-480.html'?480:fixture[0]==='photos-only-home.html'?144:128;
   const gallery=await page.locator('[data-home-block=gallery]').evaluate(e=>({height:e.getBoundingClientRect().height,text:e.textContent.trim(),links:[...e.querySelectorAll('a')].every(a=>a.href.includes('action=showimg')&&a.querySelector('img')?.alt),photos:[...e.querySelectorAll('img')].map(p=>({height:p.getBoundingClientRect().height,width:p.getBoundingClientRect().width,parent:p.closest('.home-block').getBoundingClientRect().width}))}));
   assert.equal(gallery.text,'');assert.ok(gallery.links);for(const p of gallery.photos){assert.equal(p.height,target);assert.ok(p.width<=p.parent+1);}
   if(fixture[0]==='full-home.html'&&theme==='lesika_dvor'&&zoom===100){compactGallery.push({width,...gallery});if(width===390)await page.locator('[data-home-block=gallery]').screenshot({path:new URL('compact-gallery.png',dir).pathname});}
  }
  if(homepage)assert.deepEqual(m.blocks,['news',...(galleryVisible?['gallery']:[]),'forum','board','chat','book']);else assert.equal(m.settings,'post');
  const videos=await page.locator('.home-video').evaluateAll(es=>es.map(e=>({controls:e.controls,preload:e.preload,autoplay:e.autoplay,fit:getComputedStyle(e).objectFit,width:e.getBoundingClientRect().width,parent:e.parentElement.getBoundingClientRect().width})));
  for(const v of videos){assert.ok(v.controls&&!v.autoplay);assert.equal(v.preload,'none');assert.equal(v.fit,'contain');assert.ok(v.width<=v.parent+1);}
  if(fixture[0]==='no-media-home.html')assert.equal(await page.locator('.home-photo,.home-video').count(),0);
  if(fixture[0]==='photos-only-home.html'){assert.equal(await page.locator('[data-home-block=news] .home-video').count(),0);assert.equal(await page.locator('[data-home-block=news] .home-photo').count(),1);}
  const same=await page.evaluate(html=>{const original=new DOMParser().parseFromString(html,'text/html'),data=d=>[...d.forms].map(f=>[...f.elements].filter(e=>e.name).map(e=>({name:e.name,value:e.value,type:e.type,checked:e.checked,disabled:e.disabled})));return JSON.stringify(data(original))===JSON.stringify(data(document));},readFileSync(new URL(fixture[0],dir),'utf8'));assert.ok(same,'form values preserved');layouts++;
  if(theme==='lesika_dvor'&&width===390&&zoom===100&&['full-home.html','admin.html'].includes(fixture[0]))await page.screenshot({path:new URL(fixture[0]+'.png',dir).pathname,fullPage:true});
 }
 fixture=fixtures[2];theme=themes[0];await page.goto('https://motor.test'+fixture[1]);await page.locator('input[name=count_news]').fill('2');await page.locator('select[name=photos_news]').selectOption('0');await page.locator('select[name=videos_board]').selectOption('0');await page.locator('input[name=gallery_width]').fill('200');await page.locator('input[name=gallery_height]').fill('144');await page.getByRole('button',{name:'Сохранить настройки главной',exact:true}).click();assert.equal(posts.length,1);assert.equal(posts[0].data.count_news,'2');assert.equal(posts[0].data.photos_news,'0');assert.equal(posts[0].data.videos_board,'0');assert.equal(posts[0].data.gallery_width,'200');assert.equal(posts[0].data.gallery_height,'144');assert.equal(posts[0].data.operation,'settings');assert.ok(posts[0].data.uid&&posts[0].data.version);
 fixture=fixtures[3];await page.goto('https://motor.test'+fixture[1]);await page.getByRole('button',{name:'Добавить в подборку',exact:true}).first().click();assert.equal(posts.length,2);assert.equal(posts[1].data.operation,'select');assert.equal(posts[1].data.block,'board');assert.ok(posts[1].data.record&&posts[1].data.version&&posts[1].data.uid);
 assert.deepEqual(errors,[]);writeFileSync(new URL('./homepage-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:12,fixtureTypes:fixtures.length,zoom200:true,formsPreserved:true,confirmedSettingsPost:true,confirmedSelectionPost:true,photosContain:true,compactGallery,mediaSwitches:true,photoOnlyGallery:true,dimensionBounds:[80,480],errors,physicalDevices:false},null,2));console.log('SUCCESS',layouts,'homepage and administration layouts; compact gallery and settings/selection POSTs verified');
}finally{await browser.close();}
