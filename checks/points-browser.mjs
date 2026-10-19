import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=resolve('checks/points-fixtures'),themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});let layouts=0;const errors=[];
try{
 const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true});let fixture='admin';
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});if(url.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture+'.html'))});const p=resolve(root,'.'+url.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404});return route.fulfill({contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(p)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const name of ['admin','transfer','credit']){fixture=name;await page.goto('https://motor.test/'+(name==='admin'?'mpanel/points-settings.php':'games/'+(name==='transfer'?'perevod':'kredit')+'.php'));
  for(const theme of themes)for(const width of [320,768,1280]){await page.setViewportSize({width,height:844});await page.evaluate(theme=>document.body.dataset.theme=theme,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' '+theme+' '+width);for(const el of await page.locator('.legacy-content input:not([type=hidden]),.legacy-content select,.legacy-content button').all()){const m=await el.evaluate(e=>{const r=e.getBoundingClientRect();return {name:e.name||e.textContent,left:r.left,right:r.right,height:r.height,visible:!!e.getClientRects().length}});if(m.visible)assert.ok(m.left>=0&&m.right<=width+1&&m.height>=44,JSON.stringify({name,theme,width,...m}));}layouts++;}
 }
 fixture='admin';await page.goto('https://motor.test/mpanel/points-settings.php');assert.equal(await page.locator('input[type=number]').count(),10);await page.getByLabel('Перевод внутренней валюты').fill('0');assert.equal(await page.getByLabel('Перевод внутренней валюты').evaluate(e=>e.checkValidity()),true);await page.getByLabel('Перевод внутренней валюты').fill('-1');assert.equal(await page.getByLabel('Перевод внутренней валюты').evaluate(e=>e.checkValidity()),false);
 await page.setViewportSize({width:320,height:844});await page.addStyleTag({content:'html{font-size:200% !important}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:join(dir,'admin-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 writeFileSync('checks/points-browser-results.json',JSON.stringify({browser:browser.version(),layouts,themes:themes.length,forms:3,numericBounds:true,textZoom:'200%',errors,physicalDevices:false},null,2)+'\n');console.log('SUCCESS',layouts,'layouts; settings, transfer, credit; numeric bounds and text zoom');
}finally{await browser.close()}
