import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('./captcha-fixtures/',import.meta.url));
const fixtures=JSON.parse(readFileSync(join(dir,'manifest.json'))),themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
let fixture=fixtures[0],layouts=0,posts=0;const errors=[];
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
try{
 const context=await browser.newContext({viewport:{width:320,height:800},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});if(route.request().method()!=='GET'){posts++;return route.fulfill({status:400});}if(url.pathname==='/gallery/protect.php')return route.fulfill({contentType:'image/png',body:readFileSync(join(dir,'code.png'))});if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture.file))});const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(fixture of fixtures){await page.goto('https://motor.test'+fixture.url,{waitUntil:'load'});for(const theme of themes)for(const width of [320,390,768,1440])for(const scale of [100,200]){
  await page.setViewportSize({width,height:800});await page.evaluate(({theme,scale})=>{document.body.dataset.theme=theme;document.documentElement.style.fontSize=scale+'%';},{theme,scale});
  const m=await page.locator('.captcha-image').evaluate(i=>{const r=i.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,natural:[i.naturalWidth,i.naturalHeight],fit:getComputedStyle(i).objectFit,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.deepEqual(m.natural,[504,192]);assert.ok(m.width>=240&&m.width<=252);assert.ok(Math.abs(m.width/m.height-21/8)<.01);assert.ok(m.left>=0&&m.right<=width+1);assert.equal(m.fit,'contain');assert.equal(m.overflow,false,JSON.stringify({url:fixture.url,theme,width,scale,m}));layouts++;
 }
 await page.locator('[name=provkod]').fill('1234');assert.equal(await page.locator('[name=provkod]').inputValue(),'1234');assert.equal(await page.locator('[name=provkod]').getAttribute('inputmode'),'numeric');
 }
 fixture=fixtures[0];await page.setViewportSize({width:390,height:800});await page.goto('https://motor.test'+fixture.url);await page.screenshot({path:join(dir,'captcha-mobile.png'),fullPage:true});
 assert.equal(posts,0);assert.deepEqual(errors,[]);writeFileSync(new URL('./captcha-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),forms:fixtures.length,themes:themes.length,layouts,image:[504,192],display:[252,96],numericKeyboard:true,errors,unexpectedPosts:posts,physicalDevices:false},null,2));
 console.log('PASS',layouts,'CAPTCHA layouts: four forms, twelve themes, 320–1440px, 100/200% text; large full image, numeric input, no overflow or JavaScript errors');
}finally{await browser.close();}
