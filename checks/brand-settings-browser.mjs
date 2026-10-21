import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json'))),dir=new URL('./brand-settings-fixtures/',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let fixture='admin.html',theme=themes[0],layouts=0;const errors=[],posts=[];
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
 for(fixture of ['admin.html','home.html','custom-admin.html','custom-home.html'])for(theme of themes)for(const width of [320,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test/'+(['admin.html','custom-admin.html'].includes(fixture)?'mpanel/brand-settings.php':'index.php'),{waitUntil:'load'});
  if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const r=await page.evaluate(()=>{const text=document.querySelector('.brand>span'),actions=document.querySelector('.header-actions');return {overflow:document.documentElement.scrollWidth>innerWidth+1,overlap:text.getBoundingClientRect().right>actions.getBoundingClientRect().left-2,title:text.firstChild.textContent,input:document.querySelector('input[name=title]')?.value};});
  assert.equal(r.overflow,false,[fixture,theme,width,zoom].join(' '));assert.equal(r.overlap,false,[fixture,theme,width,zoom].join(' '));assert.ok(r.title.startsWith(fixture.startsWith('custom')?'Город <img':'Лесозаводск онлайн'));if(r.input)assert.equal(r.input,r.title);
  if(theme==='lesika_dvor'&&width===390&&zoom===100&&['admin.html','custom-admin.html'].includes(fixture))await page.screenshot({path:new URL(fixture+'.png',dir).pathname,fullPage:true});layouts++;
 }
 fixture='admin.html';theme=themes[0];await page.goto('https://motor.test/mpanel/brand-settings.php');await page.locator('input[name=title]').fill('Новый портал & город');await page.getByRole('button',{name:'Сохранить заглавие и логотип',exact:true}).click();assert.equal(posts.length,1);assert.equal(posts[0].data.title,'Новый портал & город');assert.ok(posts[0].data.uid&&posts[0].data.version);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./brand-settings-browser-results.json',import.meta.url),JSON.stringify({layouts,themes:12,zoom200:true,headerNoOverlap:true,savePost:true,errors,physicalDevices:false},null,2));console.log('SUCCESS',layouts,'branding admin/home layouts, exact text and POST');
}finally{await browser.close();}
