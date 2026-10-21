import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),themes=Object.keys(JSON.parse(readFileSync(root+'/includes/lesika/themes.json'))),dir=new URL('./bottom-menu-fixtures/',import.meta.url);
assert.equal(themes.length,12,'Apply the complete overlay before running browser checks');
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
 for(fixture of ['admin.html','default.html','custom.html','one.html','off.html'])for(theme of themes)for(const width of [320,390,768,1440])for(const zoom of width===320?[100,200]:[100]){
  await page.setViewportSize({width,height:844});await page.goto('https://motor.test/'+(['admin.html'].includes(fixture)?'mpanel/bottom-menu.php':'index.php'),{waitUntil:'load'});
  if(zoom===200)await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  const r=await page.evaluate(()=>{const nav=document.querySelector('.bottom-nav'),shell=document.querySelector('.site-shell'),visible=!!nav&&nav.getBoundingClientRect().height>0;return {overflow:document.documentElement.scrollWidth>innerWidth+1,count:nav?.querySelectorAll('a').length||0,visible,space:parseFloat(getComputedStyle(shell).paddingBottom),height:nav?.getBoundingClientRect().height||0,targets:visible?[...nav.querySelectorAll('a')].map(a=>({w:a.getBoundingClientRect().width,h:a.getBoundingClientRect().height,label:a.getAttribute('aria-label'),text:a.querySelector('span').textContent})):[]};});
  assert.equal(r.overflow,false,[fixture,theme,width,zoom].join(' '));const expected={admin:4,default:5,custom:4,one:1,off:0}[fixture.split('.')[0]];assert.equal(r.count,expected);assert.equal(r.visible,expected>0&&!(width>=900&&theme.startsWith('lesika_web_')));
  if(r.visible){assert.ok(r.space>=r.height,JSON.stringify({fixture,theme,width,zoom,r}));for(const t of r.targets){assert.ok(t.w>=44&&t.h>=44,JSON.stringify(t));assert.equal(t.label,t.text);}}
  if(fixture==='off.html')assert.equal(r.space,0);
  if(theme==='lesika_dvor'&&width===390&&zoom===100&&['admin.html'].includes(fixture))await page.screenshot({path:new URL(fixture+'.png',dir).pathname,fullPage:true});layouts++;
 }
 fixture='admin.html';theme=themes[0];await page.goto('https://motor.test/mpanel/bottom-menu.php');await page.locator('input[name=label_1]').fill('Общение');await page.getByRole('button',{name:'Сохранить нижнее меню',exact:true}).click();assert.equal(posts.length,1);assert.equal(posts[0].data.label_1,'Общение');assert.ok(posts[0].data.uid&&posts[0].data.version);assert.deepEqual(errors,[]);
 writeFileSync(new URL('./bottom-menu-browser-results.json',import.meta.url),JSON.stringify({layouts,themes:12,zoom200:true,menuSpace:true,savePost:true,errors,physicalDevices:false},null,2));console.log('SUCCESS',layouts,'bottom-menu layouts, 0/1/4/5 items, reserved space and POST');
}finally{await browser.close();}
