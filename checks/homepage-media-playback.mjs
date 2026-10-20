import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),fixtures=new URL('./homepage-fixtures/',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});let fixture='full-home.html';const mediaRequests=[];
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/attachment.php'||u.pathname==='/gallery/resize.php'){
   const video=u.searchParams.get('file')==='2'.repeat(32);mediaRequests.push({section:u.searchParams.get('section'),video});
   return route.fulfill({contentType:video?'video/mp4':'image/gif',body:readFileSync(video?new URL('./sample.mp4',import.meta.url):root+'/images/avators/1.gif')});
  }
  if(u.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html',body:readFileSync(new URL(fixture,fixtures))});
  const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')||!existsSync(p))return route.fulfill({status:404});
  return route.fulfill({contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'image/gif',body:readFileSync(p)});
 });
 await page.goto('https://motor.test/index.php');assert.equal(mediaRequests.filter(r=>r.video).length,0,'No video bytes requested before playback');
 for(const section of ['news','forum']){
  const video=page.locator('[data-home-block='+section+'] video');assert.equal(await video.evaluate(v=>v.paused),true);
  await video.evaluate(v=>v.play());await page.waitForFunction(s=>document.querySelector('[data-home-block='+s+'] video').currentTime>0,section,{timeout:10000});
  await video.evaluate(v=>v.pause());assert.ok(mediaRequests.some(r=>r.section===section&&r.video));
 }
 fixture='no-media-home.html';mediaRequests.length=0;await page.goto('https://motor.test/index.php');assert.equal(await page.locator('.home-photo,.home-video').count(),0);assert.deepEqual(mediaRequests,[]);
 const result={videoPlayback:['news','forum'],noAutoplay:true,noVideoPrefetch:true,disabledMediaRequests:0};writeFileSync(new URL('./homepage-media-playback-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log('PASS real news/forum video playback, no autoplay/prefetch and zero disabled-media requests');
} finally {await browser.close();}
