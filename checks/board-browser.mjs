import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('./board-fixtures/',import.meta.url));
const fixtures=JSON.parse(readFileSync(join(dir,'manifest.json'))),themes=Object.keys(JSON.parse(readFileSync(join(root,'includes/lesika/themes.json'))));
let fixture=fixtures[0],theme=themes[0],posts=0,originals=0,previews=0;const errors=[],measurements=[];
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
try {
 const context=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
  if(request.method()==='POST'){if(url.pathname==='/chat/updates.php')return route.fulfill({status:204});posts++;return route.fulfill({status:400,body:'Unexpected POST'});}
  if(url.pathname==='/attachment.php'){if(url.searchParams.has('preview'))previews++;else originals++;return route.fulfill({status:200,contentType:'image/gif',body:readFileSync(join(dir,'photo.gif'))});}
  if(url.pathname.endsWith('.php'))return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture.file),'utf8').replace(/data-theme="[^"]+"/,'data-theme="'+theme+'"')});
  const path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});return route.fulfill({status:200,contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'image/gif',body:readFileSync(path)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(theme of themes)for(const width of [320,768,1440])for(fixture of fixtures){await page.setViewportSize({width,height:800});await page.goto('https://motor.test'+fixture.url,{waitUntil:'load'});const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,images:[...document.querySelectorAll('.attachments img')].map(i=>{const r=i.getBoundingClientRect();return {width:r.width,right:r.right,left:r.left,fit:getComputedStyle(i).objectFit,w:i.getAttribute('width'),h:i.getAttribute('height')};})}));assert.equal(m.overflow,false,JSON.stringify({theme,width,url:fixture.url,m}));for(const image of m.images){assert.ok(image.left>=0&&image.right<=width+1);assert.equal(image.fit,'contain');assert.ok(+image.w>0&&+image.h>0);}measurements.push({theme,width,url:fixture.url});}
 console.log('PASS',measurements.length,'board layouts, 12 themes, 320/768/1440 px, contained photos and no overflow');
 fixture=fixtures.find(f=>f.url.startsWith('/board/edit.php'));theme=themes[0];await page.setViewportSize({width:360,height:800});await page.goto('https://motor.test'+fixture.url);
 assert.equal(await page.locator('.attachment-remove input').count(),5);await page.locator('.attachment-remove input').first().check();assert.ok(await page.locator('.attachment-remove input').first().isChecked());
 const picker=page.locator('input[type=file]');assert.equal(await picker.getAttribute('multiple'),'');await picker.setInputFiles(Array.from({length:5},(_,i)=>({name:'photo-'+i+'.gif',mimeType:'image/gif',buffer:readFileSync(join(dir,'photo.gif'))})));assert.equal(await picker.evaluate(x=>x.files.length),5);
 await page.screenshot({path:join(dir,'board-edit-mobile.png'),fullPage:true});
 fixture=fixtures.find(f=>f.url==='/mpanel/board-settings.php');await page.goto('https://motor.test'+fixture.url);assert.equal(await page.locator('[name=count]').getAttribute('max'),'5');await page.locator('[name=count]').fill('0');assert.equal(await page.locator('[name=count]').inputValue(),'0');await page.screenshot({path:join(dir,'board-settings-mobile.png'),fullPage:true});
 assert.equal(originals,0);assert.ok(previews>0);assert.equal(posts,0);assert.deepEqual(errors,[]);
 console.log('PASS five-file chooser, individual removal, administrator limits, no original downloads or unexpected POST/JS errors');
 writeFileSync(new URL('./board-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts:measurements.length,themes:themes.length,previews,originals,unexpectedPosts:posts,errors,physicalDevices:false},null,2));
}finally{await browser.close();}
