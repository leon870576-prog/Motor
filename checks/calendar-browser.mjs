import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),fixture=readFileSync(new URL('./calendar-fixtures/home.html',import.meta.url),'utf8');
const themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let layouts=0,posts=0;const errors=[];
try{
 const context=await browser.newContext({viewport:{width:320,height:800},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});if(route.request().method()!=='GET'){posts++;return route.fulfill({status:400});}if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:fixture});const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://motor.test/index.php');
 for(const theme of themes)for(const width of [320,390,768,1440])for(const zoom of [100,200]){
  await page.setViewportSize({width,height:800});await page.evaluate(({theme,zoom})=>{document.body.dataset.theme=theme;document.documentElement.style.fontSize=zoom+'%';},{theme,zoom});
  const m=await page.locator('.news-calendar').evaluate(t=>{const a=t.querySelector('.calendar-has-news'),n=a.querySelector('.calendar-day-number'),r=n.getBoundingClientRect(),s=getComputedStyle(n),b=t.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,left:b.left,right:b.right,width:r.width,height:r.height,border:s.borderTopWidth,radius:s.borderTopLeftRadius,color:s.color,borderColor:s.borderTopColor,hit:a.getBoundingClientRect().height,links:t.querySelectorAll('a').length,today:a.getAttribute('aria-current')};});
  assert.equal(m.overflow,false,JSON.stringify({theme,width,zoom,m}));assert.ok(m.left>=0&&m.right<=width+1);assert.ok(Math.abs(m.width-m.height)<1,'ring must stay circular: '+JSON.stringify({theme,width,zoom,m}));assert.equal(m.border,'2px');assert.equal(m.radius,'50%');assert.equal(m.borderColor,m.color);assert.ok(m.hit>=44);assert.equal(m.links,1);assert.equal(m.today,'date');layouts++;
 }
 await page.setViewportSize({width:390,height:800});await page.evaluate(()=>{document.body.dataset.theme='lesika_dvor';document.documentElement.style.fontSize='100%';});
 const link=page.locator('.calendar-has-news');await link.focus();assert.equal(await link.evaluate(e=>document.activeElement===e),true);assert.notEqual(await link.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await page.screenshot({path:new URL('./calendar-fixtures/calendar-mobile.png',import.meta.url).pathname,fullPage:true});
 await link.press('Enter');assert.ok(page.url().includes('/news/komm.php?id=1'));assert.equal(posts,0);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./calendar-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:themes.length,textScale:[100,200],roundMarkers:true,todayClickable:true,keyboard:true,errors,unexpectedPosts:posts,physicalDevices:false},null,2));
 console.log('PASS',layouts,'calendar layouts in 12 themes, 320–1440px, 100/200% text, round news marker, keyboard link and no overflow/JS errors');
}finally{await browser.close();}
