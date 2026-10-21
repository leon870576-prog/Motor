import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.argv[2]||'.test-site'),dir=fileURLToPath(new URL('./userpages-fixtures/',import.meta.url));
const fixtures=[...JSON.parse(readFileSync(join(dir,'manifest.json'))),...JSON.parse(readFileSync(join(dir,'comments-manifest.json')))],themes=JSON.parse(readFileSync(join(root,'includes/lesika/themes.json')));
assert.equal(Object.keys(themes).length,12);
const chosen=['create','overview-owner','overview-custom','photos-owner-full','news-owner','settings','settings-custom','edit-news','edit-review','moderation','comments-reader','edit-comment','comments-page2'].map(n=>{const f=fixtures.find(x=>x.name===n);assert.ok(f,n);return f;});
const browser=await chromium.launch({executablePath:process.env.MOTOR_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],headless:true});
let fixture=chosen[0],theme='lesika_dvor',layouts=0,originals=0,allowedPost=false;const posts=[],errors=[];
try{
 const context=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.pathname==='/chat/updates.php')return route.fulfill({status:204});
  if(req.method()==='POST'){posts.push({allowed:allowedPost,url:req.url(),body:req.postData()});return route.fulfill({status:200,contentType:'text/html',body:'<p>Submission captured by isolated browser test</p>'});}
  if(['/gallery/resize.php','/gallery/fullsize.php'].includes(u.pathname)){if(u.pathname.includes('fullsize'))originals++;return route.fulfill({contentType:'image/png',body:readFileSync(join(dir,'photo.png'))});}
  if(u.pathname.endsWith('.php'))return route.fulfill({contentType:'text/html; charset=utf-8',body:readFileSync(join(dir,fixture.file),'utf8').replace(/data-theme="[^"]+"/,'data-theme="'+theme+'"')});
  const path=resolve(root,'.'+u.pathname);if(!path.startsWith(root+'/')||!existsSync(path))return route.fulfill({status:404});
  return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.json')?'application/json':path.endsWith('.png')?'image/png':'image/gif',body:readFileSync(path)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 async function load(f,w=390){fixture=f;await page.setViewportSize({width:w,height:844});await page.goto('https://motor.test'+fixture.url,{waitUntil:'load'});}
 for(theme of Object.keys(themes))for(const width of [320,768,1440])for(const f of chosen){
  await load(f,width);assert.ok(await page.locator('link[href*="userpages.css?v=userpages2"]').count());
  if (f.name==='overview-owner') assert.deepEqual(await page.locator('.up-section > .up-heading > h2').allTextContents(),['Новости пользователя','Фотографии','Отзывы']);
  assert.equal(await page.locator('.userpage a[href="index.php?action=menu"]').count(),0);
  const buttons=await page.locator('.up-page-actions .up-button').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,border:parseFloat(getComputedStyle(e).borderTopWidth)})));assert.ok(buttons.length&&buttons.every(b=>b.height>=44&&b.border>=1));
  if(['create','settings','settings-custom'].includes(f.name)){assert.equal(await page.locator('.up-page-actions').getByRole('link',{name:'На личную страницу',exact:true}).count(),1);assert.equal(await page.locator('.userpage').getByRole('link',{name:'Настроить страницу',exact:true}).count(),0);}
  const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,fields:[...document.querySelectorAll('.userpage input:not([type=hidden]),.userpage textarea,.userpage select')].filter(e=>e.getClientRects().length).map(e=>({font:parseFloat(getComputedStyle(e).fontSize),width:e.getBoundingClientRect().width})),images:[...document.querySelectorAll('.up-photo-link img')].map(e=>({fit:getComputedStyle(e).objectFit,width:e.getBoundingClientRect().width})),fine:matchMedia('(min-width:900px) and (pointer:fine) and (hover:hover)').matches}));
  assert.equal(m.overflow,false,JSON.stringify({theme,width,fixture:f.name,m}));
  const minFont=themes[theme].density==='compact'&&m.fine?14:16;assert.ok(m.fields.every(x=>x.font>=minFont),JSON.stringify({theme,width,fixture:f.name,m}));
  for(const image of m.images){assert.equal(image.fit,'contain');assert.ok(image.width>100&&image.width<=width);}
  const same=await page.evaluate(html=>{const prior=new DOMParser().parseFromString(html,'text/html');const data=d=>[...d.forms].map(f=>[...f.elements].filter(e=>e.name).map(e=>[e.name,e.value,e.checked]));return JSON.stringify(data(document))===JSON.stringify(data(prior));},readFileSync(join(dir,f.file),'utf8'));assert.ok(same,'Form fields changed by JS: '+f.name);layouts++;
 }
 assert.equal(originals,0,'Original photos load only on request');assert.deepEqual(posts,[]);
 theme='lesika_dvor';await load(fixtures.find(f=>f.name==='overview-owner'));
 assert.ok((await page.getByRole('link',{name:'Анкета пользователя',exact:true}).getAttribute('href')).includes('view=details'));
 await page.screenshot({path:join(dir,'userpage-mobile.png'),fullPage:true,animations:'disabled'});
 const draft=page.locator('.up-form[action*="guest_add"] textarea');await draft.fill('Черновик отзыва');
 await page.locator('.up-photo-link').first().click();await page.locator('.gallery-viewer[open]').waitFor();await page.locator('.gallery-viewer img').waitFor({state:'visible'});
 assert.equal(originals,1);await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();assert.equal(await draft.inputValue(),'Черновик отзыва');
 assert.equal(await page.locator('.up-photo-comment,.up-comment-form').count(),0);assert.match(await page.locator('.up-photo-comments').first().getAttribute('href'),/gallery\/index\.php\?action=komm&amp;gid=|gallery\/index\.php\?action=komm&gid=/);
 await load(fixtures.find(f=>f.name==='edit-news'));const text=page.locator('.up-form textarea').first();await text.fill('Новость');
 await page.locator('.up-form .tag-picker-toggle').first().click();await page.locator('.tag-picker-choice').first().click();assert.ok((await text.inputValue()).includes('['));
 await page.locator('.up-form .smile-picker-toggle').first().click();await page.locator('.smile-picker-choice').first().waitFor();await page.locator('.smile-picker-choice').first().click();assert.ok((await text.inputValue()).length>7);assert.equal(posts.length,0);
 await load(fixtures.find(f=>f.name==='guestbook-author'));await page.locator('.up-delete summary').first().click();assert.equal(posts.length,0,'Delete confirmation alone must not submit');
 const form=page.locator('.up-form[action*="guest_add"]');await form.locator('textarea').fill('Отзыв из браузера');allowedPost=true;await form.getByRole('button',{name:'Оставить отзыв',exact:true}).click();await page.waitForURL('**/*action=guest_add');allowedPost=false;
 assert.equal(posts.length,1);assert.equal(posts[0].allowed,true);const submitted=new URLSearchParams(posts[0].body);assert.equal(submitted.get('msg'),'Отзыв из браузера');assert.match(submitted.get('uid'),/^[a-f0-9]{64}$/);assert.match(submitted.get('id'),/^[a-f0-9]{32}$/);
 await load(fixtures.find(f=>f.name==='moderation'));
 const reputation=page.locator('form.reputation-form');assert.equal(await reputation.getAttribute('method'),'post');
 allowedPost=true;await reputation.getByRole('button',{name:'Повысить авторитет пользователя',exact:true}).click();await page.waitForURL('**/pages/raiting.php?uz=PageOwner');allowedPost=false;
 assert.equal(posts.length,2);const voted=new URLSearchParams(posts[1].body);assert.equal(voted.get('vote'),'plus');assert.match(voted.get('uid'),/^[a-f0-9]{64}$/);assert.equal(voted.get('revision'),'none');
 await load(fixtures.find(f=>f.name==='comments-reader'));
 const comment=page.locator('.up-form[action*="comment_add"]');await comment.locator('textarea').fill('Комментарий из браузера');
 allowedPost=true;await comment.getByRole('button',{name:'Отправить комментарий',exact:true}).click();await page.waitForURL('**/*action=comment_add');allowedPost=false;
 assert.equal(posts.length,3);const sentComment=new URLSearchParams(posts[2].body);assert.equal(sentComment.get('msg'),'Комментарий из браузера');assert.match(sentComment.get('post'),/^[a-f0-9]{32}$/);assert.match(sentComment.get('id'),/^[a-f0-9]{32}$/);assert.match(sentComment.get('uid'),/^[a-f0-9]{64}$/);
 theme='lesika_web_evening';await load(fixtures.find(f=>f.name==='overview-owner'),1440);await page.screenshot({path:join(dir,'userpage-desktop.png'),fullPage:true,animations:'disabled'});
 for(theme of ['lesika_dvor','lesika_vecher','lesika_web_press','lesika_web_evening']){await load(fixtures.find(f=>f.name==='overview-owner'),320);await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'200% text: '+theme);layouts++;}
 for(const sign of ['plus','minus']){
  const opposite=sign==='plus'?'minus':'plus',f={file:'reputation-'+sign+'.html',url:'/pages/userpage.php?uz=PageOwner'};
  for(theme of Object.keys(themes))for(const width of [320,768,1440]){
   await load(f,width);const voteForm=page.locator('form.reputation-form');
   assert.equal(await voteForm.locator('button[value="'+sign+'"]').isDisabled(),true);assert.equal(await voteForm.locator('button[value="'+opposite+'"]').isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'vote controls overflow '+theme);layouts++;
  }
  const expected=await page.locator('form.reputation-form input[name="revision"]').inputValue();
  allowedPost=true;await page.locator('form.reputation-form button[value="'+opposite+'"]').click();await page.waitForURL('**/pages/raiting.php?uz=PageOwner');allowedPost=false;
  const sent=new URLSearchParams(posts.at(-1).body);assert.equal(sent.get('vote'),opposite);assert.equal(sent.get('revision'),expected);assert.match(expected,/^[a-f0-9]{32}$/);assert.match(sent.get('uid'),/^[a-f0-9]{64}$/);
 }
 for(theme of Object.keys(themes)){await load(fixtures.find(f=>f.name==='settings-custom'),320);await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'settings 200% '+theme);layouts++;}
 theme='lesika_dvor';await load(fixtures.find(f=>f.name==='settings-custom'));
 await page.screenshot({path:join(dir,'settings-mobile.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('link',{name:'На личную страницу',exact:true}).click();assert.equal(new URL(page.url()).search,'?uz=PageOwner');
 await load(fixtures.find(f=>f.name==='overview-owner'));await page.getByRole('link',{name:'Настроить страницу',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('tab'),'settings');
 await load(fixtures.find(f=>f.name==='settings-custom'));const sizeForm=page.locator('.up-form[action*="action=save"]');
 for(const[name,value]of Object.entries({news_per_page:'5',photos_per_page:'7',reviews_per_page:'9'}))await sizeForm.locator('[name="'+name+'"]').fill(value);
 allowedPost=true;await sizeForm.getByRole('button',{name:'Сохранить страницу',exact:true}).click();await page.waitForURL('**/*action=save');allowedPost=false;
 const sizePost=new URLSearchParams(posts.at(-1).body);assert.equal(sizePost.get('news_per_page'),'5');assert.equal(sizePost.get('photos_per_page'),'7');assert.equal(sizePost.get('reviews_per_page'),'9');assert.match(sizePost.get('uid'),/^[a-f0-9]{64}$/);assert.match(sizePost.get('revision'),/^[0-9]+$/);
 assert.equal(posts.length,6);assert.deepEqual(errors,[]);assert.ok(posts.every(p=>p.allowed));
 writeFileSync(new URL('./userpages-browser-results.json',import.meta.url),JSON.stringify({browser:browser.version(),layouts,themes:12,fixtureTypes:chosen.length+2,formsPreserved:true,photoZoom:true,tagAndSmilePickers:true,confirmedPost:true,reputationPost:true,reputationEditing:true,newsCommentPost:true,photoCommentsLinkOnly:true,sectionOrder:true,questionnaireLink:true,profileButtons:true,settingsReturn:true,pageSizesPost:true,errors,physicalDevices:false},null,2));
 console.log('SUCCESS',layouts,'layouts; 12 themes; form integrity, photo viewer, tags/smiles, delete confirmation, POST submission and 200% zoom');
}finally{await browser.close()}
