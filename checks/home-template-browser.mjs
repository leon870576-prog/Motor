import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json'))),dir=new URL('./home-template-fixtures/',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let fixture='editor.html',theme=themes[0],layouts=0;const errors=[],posts=[];
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
 for(fixture of ['editor.html','edited.html','error.html'])for(theme of themes)for(const width of [320,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test/mpanel/files.php?action=edit&file=index.dat',{waitUntil:'load'});
  if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const result=await page.evaluate(()=>{
   const el=document.querySelector('#home-template-source');
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,font:parseFloat(getComputedStyle(el).fontSize),textarea:el.value,buttons:[...document.querySelectorAll('.home-template-form button,.home-editor-nav a')].map(e=>e.getBoundingClientRect().height),injected:!!window.templateInjected};
  });
  const original=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('#home-template-source').value,readFileSync(new URL(fixture,dir),'utf8'));
  assert.equal(result.overflow,false,[fixture,theme,width,zoom].join(' '));assert.ok(result.font>=16);assert.equal(result.textarea,original);assert.ok(result.buttons.every(h=>h>=43.5));assert.equal(result.injected,false);layouts++;
  assert.equal(await page.locator('.home-editor-nav a').filter({hasText:'Посмотреть главную'}).getAttribute('href'),'../index.php');
  if(fixture==='editor.html'&&theme==='lesika_dvor'&&width===390&&zoom===100)await page.screenshot({path:new URL('editor.png',dir).pathname,fullPage:true});
 }
 fixture='editor.html';theme=themes[0];await page.goto('https://motor.test/mpanel/files.php?action=edit&file=index.dat');
 const sample='<?php if (true && true) echo "A &amp; B"; ?>';await page.locator('#home-template-source').fill(sample);await page.getByRole('button',{name:'Сохранить шаблон главной',exact:true}).click();
 assert.equal(posts.length,1);assert.equal(posts[0].data.msg,sample);assert.equal(posts[0].data.operation,'save');assert.ok(posts[0].data.uid&&posts[0].data.version);
 await page.goto('https://motor.test/mpanel/files.php?action=edit&file=index.dat');await page.locator('.home-template-reset summary').click();await page.getByRole('button',{name:'Восстановить стандартный шаблон',exact:true}).click();
 assert.equal(posts.length,2);assert.equal(posts[1].data.operation,'standard');assert.ok(posts[1].data.uid&&posts[1].data.version);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./home-template-browser-results.json',import.meta.url),JSON.stringify({layouts,themes:12,zoom200:true,sourceUnchanged:true,exactFormPost:true,explicitReset:true,errors,physicalDevices:false},null,2));console.log('SUCCESS',layouts,'homepage template editor layouts; exact source and save/reset POSTs');
}finally{await browser.close();}
