import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),fixtures=JSON.parse(readFileSync(new URL('./touch-fixtures/manifest.json',import.meta.url))),f=fixtures.find(x=>x.url==='/index.php'&&x.role==='admin');assert.ok(f);
const html=readFileSync(new URL('./touch-fixtures/'+f.file,import.meta.url),'utf8'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json')));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let theme=themes[0],layouts=0;const errors=[];
try{
 const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:320,height:844}});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/chat/updates.php')return route.fulfill({status:204});assert.equal(route.request().method(),'GET');if(u.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:html.replace(/data-theme="[^"]+"/,'data-theme="'+theme+'"')});const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404});return route.fulfill({contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(p)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(theme of themes)for(const width of [320,360,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test/index.php',{waitUntil:'load'});if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const m=await page.evaluate(()=>{const brand=document.querySelector('.brand'),text=brand.querySelector('span'),img=brand.querySelector('img'),actions=document.querySelector('.header-actions'),header=document.querySelector('.site-header');const rect=x=>x.getBoundingClientRect();return{title:document.title,name:text.firstChild.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,textFits:text.scrollWidth<=rect(text).width+1,overlap:rect(text).right>rect(actions).left-2,headerFits:rect(brand).bottom<=rect(header).bottom,loaded:img.complete&&img.naturalWidth===59&&img.naturalHeight===70,fit:getComputedStyle(img).objectFit,account:document.querySelector('.header-actions>a').getAttribute('href'),icon:document.querySelector('link[rel=icon]').getAttribute('href')};});
  assert.equal(m.name,'Лесозаводск онлайн');assert.match(m.title,/Лесозаводск/);assert.equal(m.overflow,false,JSON.stringify({theme,width,zoom,m}));assert.equal(m.overlap,false,JSON.stringify({theme,width,zoom,m}));assert.equal(m.textFits,true,JSON.stringify({theme,width,zoom,m}));assert.equal(m.headerFits,true);assert.equal(m.loaded,true);assert.equal(m.fit,'contain');assert.match(m.account,/pages\/index.php\?action=menu$/);assert.match(m.icon,/lesozavodsk\.svg$/);layouts++;
  if(theme==='lesika_dvor'&&width===390&&zoom===100)await page.screenshot({path:new URL('./touch-fixtures/brand-mobile.png',import.meta.url).pathname,fullPage:false});
  if(theme==='lesika_web_evening'&&width===1440)await page.screenshot({path:new URL('./touch-fixtures/brand-desktop.png',import.meta.url).pathname,fullPage:false});
 }
 assert.deepEqual(errors,[]);writeFileSync(new URL('./branding-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:12,zoom200:true,coatOfArmsLoaded:true,headerNoOverlap:true,menuPreserved:true,errors},null,2));console.log('SUCCESS',layouts,'branding layouts, all themes, 200% text, original coat of arms and My menu');
}finally{await browser.close()}
