import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('.',import.meta.url)),shots=join(dir,'compact-fixtures');mkdirSync(shots,{recursive:true});
const themes=JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))),compact=Object.keys(themes).filter(x=>themes[x].density==='compact');
assert.deepEqual(compact,['lesika_dvor','lesika_vecher','lesika_web_press','lesika_web_evening']);
const fixtures=[];for(const folder of ['touch-fixtures','fixtures','chat-fixtures','board-fixtures','gallery-fixtures']){const f=join(dir,folder,'manifest.json');if(existsSync(f))for(const item of JSON.parse(readFileSync(f)))if(item.file?.endsWith('.html'))fixtures.push({...item,folder});}
const home=fixtures.find(f=>f.url==='/index.php'&&f.role==='guest');assert.ok(home);
const pageSet=[home];for(const needle of ['/news/index.php','/forum/index.php','/forum/topic.php','/board/index.php','/chat/index.php','/gallery/index.php','/pages/login.php','/pages/registration.php','/pages/setting.php','/pages/themes.php','/pages/anketa.php','/pages/userlist.php','/mpanel/index.php','/mpanel/attachments.php','/mpanel/setting.php']){const f=fixtures.find(x=>x.url?.startsWith(needle));if(f&&!pageSet.includes(f))pageSet.push(f);}
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
const result={browser:browser.version(),selected:compact,layouts:0,home:[],pages:pageSet.map(f=>f.url),errors:[],physical_devices:false};let fixture=home;
try{
 for(const desktop of [false,true]){
  const context=await browser.newContext({isMobile:!desktop,hasTouch:!desktop,viewport:{width:desktop?1440:390,height:900}});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});
   if(req.method()==='POST')throw new Error('Unexpected POST '+url.pathname);
   if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture.folder,fixture.file))});
   const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});
   return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/gif',body:readFileSync(path)});
  });
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  async function settle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  async function load(f,theme,width){fixture=f;await page.setViewportSize({width,height:900});await page.goto('https://motor.test'+f.url,{waitUntil:'load'});assert.ok(await page.locator('link[href*="compact.css?v=compact1"]').count(),f.url+' has current styles');await page.evaluate(t=>document.body.dataset.theme=t,theme);await settle();}
  async function measure(){return page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,font:parseFloat(getComputedStyle(document.body).fontSize),cards:document.querySelector('.home-sections')?.getBoundingClientRect().height,header:document.querySelector('.site-header')?.getBoundingClientRect().height,inputs:[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=file]),textarea,select')].filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)),formData:JSON.stringify([...document.forms].map(f=>[...f.elements].filter(e=>e.name).map(e=>[e.name,e.value,e.checked,e.disabled])))}));}
  for(const width of desktop?[1024,1440]:[320,390,768])for(const theme of Object.keys(themes)){
   await load(home,theme,width);const after=await measure();assert.equal(after.overflow,false,theme+' '+width);
   await page.locator('link[href*="compact.css"]').evaluate(e=>e.disabled=true);await settle();const before=await measure();
   if(compact.includes(theme)){assert.equal(after.font,14);assert.ok(after.cards<before.cards*.92,JSON.stringify({theme,width,before,after}));}else assert.deepEqual(after,before,'other theme changed: '+theme);
   result.home.push({theme,width,font:after.font,beforeCards:Math.round(before.cards),afterCards:Math.round(after.cards),reductionPercent:Math.round((1-after.cards/before.cards)*100)});result.layouts++;
   await page.locator('link[href*="compact.css"]').evaluate(e=>e.disabled=false);await settle();
   if((width===390&&['lesika_dvor','lesika_vecher'].includes(theme))||(width===1440&&['lesika_web_press','lesika_web_evening'].includes(theme)))await page.screenshot({path:join(shots,theme+'.png'),fullPage:true,animations:'disabled'});
  }
  for(const width of desktop?[1440]:[320,390])for(const theme of compact)for(const f of pageSet){
   await load(f,theme,width);const m=await measure();assert.equal(m.overflow,false,JSON.stringify({theme,width,url:f.url}));assert.equal(m.font,14);assert.ok(m.inputs.every(x=>x>=(desktop?14:16)),JSON.stringify({theme,width,url:f.url,inputs:m.inputs}));
   await page.locator('link[href*="compact.css"]').evaluate(e=>e.disabled=true);await settle();assert.equal((await measure()).formData,m.formData,'CSS changes form values');result.layouts++;
  }
  await load(home,compact[0],desktop?1440:320);await page.evaluate(()=>document.documentElement.style.fontSize='200%');await settle();assert.equal((await measure()).overflow,false,'200% text overflow');
  await context.close();
 }
 assert.deepEqual(result.errors,[]);writeFileSync(join(dir,'compact-browser-results.json'),JSON.stringify(result,null,2));console.log('PASS',result.layouts,'layouts,',pageSet.length,'page types; exactly four denser themes; eight untouched themes; forms, input fonts and 200% zoom');
 console.log(JSON.stringify(result.home.filter(x=>compact.includes(x.theme)&&[390,1440].includes(x.width))));
}finally{await browser.close()}
