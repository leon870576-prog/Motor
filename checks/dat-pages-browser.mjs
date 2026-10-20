import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json'))),dir=new URL('./dat-pages-fixtures/',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let fixture='list.html',theme=themes[0],layouts=0;const errors=[],posts=[];
try{
 const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:320,height:844}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.method()==='POST'){posts.push({url:req.url(),data:Object.fromEntries(new URLSearchParams(req.postData()))});return route.fulfill({body:'Captured safely'});}
  if(u.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(new URL(fixture,dir),'utf8').replace(/data-theme="[^"]+"/,'data-theme="'+theme+'"')});
  const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404});
  return route.fulfill({contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(p)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(fixture of ['list.html','editor.html','page.html','ads.html'])for(theme of themes)for(const width of [320,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test/'+(['list.html','editor.html'].includes(fixture)?'mpanel/files.php':'index.php'),{waitUntil:'load'});
  if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,injected:!!window.datInjected,source:document.querySelector('#dat-source')?.value,font:document.querySelector('#dat-source')?parseFloat(getComputedStyle(document.querySelector('#dat-source')).fontSize):16,ad:document.querySelector('#motor-ad-foot')?!!document.querySelector('#motor-ad-foot').getClientRects().length:true}));
  assert.equal(r.overflow,false,[fixture,theme,width,zoom].join(' '));assert.equal(r.injected,false);assert.ok(r.font>=16);assert.equal(r.ad,true);
  if(fixture==='editor.html'){const original=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('#dat-source').value,readFileSync(new URL(fixture,dir),'utf8'));assert.equal(r.source,original);}
  if(theme==='lesika_dvor'&&width===390&&zoom===100&&['list.html','editor.html'].includes(fixture))await page.screenshot({path:new URL(fixture+'.png',dir).pathname,fullPage:true});layouts++;
 }
 fixture='editor.html';theme=themes[0];await page.goto('https://motor.test/mpanel/files.php');const sample='\n<?php if (true && true) echo "A &amp; B"; ?>';await page.locator('#dat-source').fill(sample);await page.getByRole('button',{name:'Сохранить страницу',exact:true}).click();assert.equal(posts.length,1);assert.equal(posts[0].data.msg.replaceAll('\r\n','\n'),sample);assert.ok(posts[0].data.uid&&posts[0].data.version);assert.match(posts[0].url,/file=info\.dat/);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./dat-pages-browser-results.json',import.meta.url),JSON.stringify({layouts,themes:12,zoom200:true,exactSource:true,savePost:true,footerAdVisible:true,errors,physicalDevices:false},null,2));console.log('SUCCESS',layouts,'dat list/editor/public-page/advertising layouts; exact source and POST');
}finally{await browser.close();}
