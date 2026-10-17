import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=resolve(process.argv[2] || fileURLToPath(new URL('../site',import.meta.url)));
const local=fileURLToPath(new URL('.',import.meta.url));
const fixture=readFileSync(join(local,'scroll-fixtures/topic.html'),'utf8');
const media=JSON.parse(readFileSync(join(local,'scroll-fixtures/media.json')));
const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE || fileURLToPath(new URL('../.browser-cache/chromium',import.meta.url)),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const results={browser:browser.version(),layouts:[],jsErrors:[],unintendedPosts:0,physical_devices:false};
const same=(a,b,label)=>assert.ok(Math.abs(a-b)<=1,`${label}: ${a} -> ${b}`);
try {
 for(const width of [320,390,1440]) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
  for(const theme of themes) {
   let release;const gate=new Promise(r=>release=r);let docs=0;
   const page=await context.newPage();page.on('pageerror',e=>results.jsErrors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(req.method()!=='GET'){results.unintendedPosts++;return route.abort();}
    if(req.resourceType()==='document'){docs++;return route.fulfill({contentType:'text/html; charset=utf-8',body:fixture.replace(/data-theme="[^"]+"/,`data-theme="${theme}"`)});}
    if(u.pathname.endsWith('/attachment.php')) {
     await gate;
     if(u.pathname+u.search===media.photo)return route.fulfill({contentType:'image/gif',body:readFileSync(join(local,'scroll-fixtures/photo.gif'))});
     if(u.pathname+u.search===media.video)return route.fulfill({contentType:'video/webm',body:readFileSync(join(local,'sample.webm'))});
     return route.fulfill({status:404,body:''});
    }
    if(/\/images\/smiles2?\//.test(u.pathname))await gate;
    const path=resolve(root,'.'+decodeURIComponent(u.pathname));
    if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});
   });
   const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const measure=()=>page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,marker:document.querySelector('.site-footer').getBoundingClientRect().top,media:[...document.querySelectorAll('.attachment img,.attachment video,img.motor-smile')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}));
   try {
    await page.goto('https://motor.test/forum/topic.php?fid=1&id=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--visual-height') && [...document.images].filter(e=>!e.matches('.attachment img,.motor-smile')&&!/\/smiles2?\//.test(e.src)).every(e=>e.complete));
    await page.evaluate(()=>{
     document.documentElement.style.scrollBehavior='auto';
     document.querySelectorAll('.attachment img').forEach(e=>e.loading='eager');
     document.querySelector('video').load();
     scrollTo(0,Math.floor(document.documentElement.scrollHeight*.4));
    });
    await frame();const before=await measure();
    assert.ok(before.y>200);assert.ok(before.media.length>=3);
    for(const rect of before.media)assert.ok(rect.width>0 && rect.height>0,'Unloaded media must reserve its box');
    release();
    await page.locator('.attachment img,img.motor-smile').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
    await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
    await frame();const after=await measure();
    same(before.height,after.height,'Cold media document height');same(before.y,after.y,'Cold media scroll');same(before.marker,after.marker,'Cold media anchor');
    before.media.forEach((a,i)=>{same(a.width,after.media[i].width,'Media width');same(a.height,after.media[i].height,'Media height');});
    // Mobile browser chrome resizes the visual viewport without changing page width.
    await page.evaluate(()=>{
     window.rootWrites=0;window.rootObserver=new MutationObserver(records=>rootWrites+=records.length);
     rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
     for(let i=0;i<20;i++){
      Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-50+i});
      visualViewport.dispatchEvent(new Event('resize'));
     }
    });
    await frame();assert.equal(await page.evaluate(()=>rootWrites),0,'Closed menu toolbar scroll must not rewrite root styles');
    const toolbar=await measure();same(after.height,toolbar.height,'Toolbar document height');same(after.y,toolbar.y,'Toolbar scroll');
    await page.evaluate(()=>{rootObserver.disconnect();delete visualViewport.height;});
    await page.setViewportSize({width,height:640});await frame();const shorter=await measure();
    same(after.height,shorter.height,'Window-height-only document resize');
    after.media.forEach((a,i)=>same(a.height,shorter.media[i].height,'Window-height-only media resize'));
    assert.ok(shorter.width<=width+1,'Horizontal overflow');
    await page.evaluate(()=>document.body.setAttribute('data-keyboard-open',''));await frame();
    same(shorter.height,(await measure()).height,'Keyboard document height');
    await page.evaluate(()=>{document.body.removeAttribute('data-keyboard-open');scrollTo(0,200);});await frame();
    let previous=await page.evaluate(()=>scrollY);
    for(let i=0;i<4;i++){
     await page.mouse.wheel(0,100);await page.waitForTimeout(80);
     const next=await page.evaluate(()=>scrollY);assert.ok(next>=previous,'Wheel scroll moved backwards');previous=next;
    }
    assert.ok(previous>250,'Wheel scrolling must remain available');
    assert.equal(docs,1,'Unexpected page reload');
    results.layouts.push({theme,width,coldLoadHeightDelta:after.height-before.height,coldLoadScrollDelta:after.y-before.y,documentRequests:docs,toolbarRootWrites:0});
    if(width===390 && theme==='lesika_dvor')await page.screenshot({path:join(local,'scroll-mobile.png'),fullPage:true});
   }finally{release();await page.close();}
  }
  await context.close();
 }
 assert.deepEqual(results.jsErrors,[]);assert.equal(results.unintendedPosts,0);
 writeFileSync(join(local,'scroll-browser-results.json'),JSON.stringify(results,null,2));
 console.log(`PASS ${results.layouts.length} forum layouts: delayed photos/smiles, video metadata, toolbar/keyboard resize, wheel scrolling; no layout jump, reload, JS error or POST`);
}finally{await browser.close();}
