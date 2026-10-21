import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtureDir=new URL('./userpages-fixtures/',import.meta.url);mkdirSync(fixtureDir,{recursive:true});
const fixtures=[],passed=[];let requests=0,uid='',logged=false;
const pass=s=>{passed.push(s);console.log('PASS',s)},id=()=>randomBytes(16).toString('hex');
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false',memory_limit:'256M'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 if(body&&typeof body==='object'){
  const boundary='UP'+id(),parts=[];
  for(const[k,v]of Object.entries(body))parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+String(v)+'\r\n'));
  parts.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(parts));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
 }
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
}
async function run(code){const r=await php.run({code:'<?php '+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0);return r.text;}
const password=randomBytes(10).toString('hex');
await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'PageAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
const template=php.readFileAsText('/www/local/profil/PageAdmin.prof').split(':||:');
for(const[name,role]of [['PageOwner',0],['PageGuest',0],['PageOther',0],['PageMod',103],['PagePhoto',105],['PageCoAdmin',102]]){
 const p=[...template];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';p[49]='17';p[50]='21';p[51]='4';p[4]='private-'+name+'@example.test';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));
}
async function token(){const r=await req('/pages/themes.php');const m=r.text.match(/name="uid" value="([^"]+)"/);assert.ok(m);return m[1];}
async function logout(){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();}
async function login(name){await logout();const r=await req('/input.php',{login:name,pass:password});assert.equal(r.httpStatusCode,302);logged=true;uid=await token();}
const base='/pages/userpage.php?uz=PageOwner',path='/www/local/userpages/PageOwner.json';
const raw=()=>php.readFileAsText(path),state=()=>JSON.parse(raw());
function saveState(s){php.writeFile(path,JSON.stringify(s));}
function cool(){const s=state();s.recent.forEach(x=>x.time=1);saveState(s);}
async function action(name,body={},owner='PageOwner',headers={}){return req('/pages/userpage.php?uz='+owner+'&action='+name,{uid,...body},headers);}
function capture(r,url,role,name){const file=name+'.html';writeFileSync(new URL(file,fixtureDir),r.text);fixtures.push({file,url,role,name});}
let r=await req('/pages/userpage.php');assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('создать свою страницу'));
assert.equal((await req(base)).httpStatusCode,200);assert.equal(php.fileExists('/www/local/userpages'),false);
for(const q of ['uz=../PageOwner','uz[]=PageOwner','uz=NoSuchUser','uz=PageOwner%00','uz=']){const bad=await req('/pages/userpage.php?'+q);assert.ok([200,302,404].includes(bad.httpStatusCode),q+' status '+bad.httpStatusCode);if(bad.httpStatusCode===302)assert.ok(bad.headers.location[0].includes('isset=403'));}
await login('PageOwner');r=await req('/pages/userpage.php');assert.ok(r.text.includes('Создать свою страницу'));r=await req('/pages/userpage.php?tab=settings');capture(r,'/pages/userpage.php?tab=settings','owner','create');
for(const a of ['save','news_add','news_edit','news_delete','guest_add','guest_edit','guest_delete'])assert.equal((await req(base+'&action='+a+'&uid='+uid)).httpStatusCode,405);
assert.equal(php.fileExists('/www/local/userpages'),false);
const settings={revision:'0',title:'Дневник нашего города',about:'Фотографии, события и добрые соседи 😊',published:'1',guestbook_open:'1'};
assert.equal((await action('save',{...settings,uid:'wrong'})).httpStatusCode,403);
assert.equal((await action('save',settings,'PageOwner',{'Origin':'https://evil.test'})).httpStatusCode,403);
assert.equal((await action('save',settings,'PageOwner',{'Sec-Fetch-Site':'cross-site'})).httpStatusCode,403);
assert.equal((await action('save',{...settings,'title[]':'bad',title:undefined})).httpStatusCode,400);
for(const extra of [{title:''},{title:'А'.repeat(101)},{about:'Я'.repeat(2001)},{published:'yes'},{guestbook_open:'2'},{title:'Две\nстроки'},{about:'Знак\u202e'}])assert.equal((await action('save',{...settings,...extra})).httpStatusCode,400);
r=await action('save',settings);assert.equal(r.httpStatusCode,303);assert.equal(state().revision,1);
const before=raw();assert.equal((await action('save',settings)).httpStatusCode,409);assert.equal(raw(),before);
for(const url of ['/pages/index.php?action=menu','/pages/profil.php','/pages/anketa.php?view=details&uz=PageOwner'])assert.ok((await req(url)).text.includes('userpage.php'));
r=await req(base);assert.ok(r.text.includes('Авторитет: <strong>17</strong>'));assert.ok(r.text.includes('+21 / −4'));assert.ok(!r.text.includes('private-PageOwner@example.test'));assert.ok(!r.text.includes(template[1]));
pass('explicit page creation, links from menu/profile, live authority, no private profile fields; GET/CSRF/Origin/types/lengths/stale settings protected');
// Real shared gallery records: owner visible, owner hidden and another author.
const photo=id()+'.png',hidden=id()+'.png',other=id()+'.png';
await run("$im=imagecreatetruecolor(480,320);imagefill($im,0,0,imagecolorallocate($im,145,170,100));imagepng($im,'/tmp/page-photo.png');imagedestroy($im);");
const image=php.readFileAsBuffer('/tmp/page-photo.png');for(const p of [photo,hidden,other])php.writeFile('/www/local/datagallery/'+p,image);
writeFileSync(new URL('photo.png',fixtureDir),image);
php.writeFile('/www/local/datagallery/fotobase.dat',[
 'Прогулка по нашему городу|Осенний парк|PageOwner||1750000000|one|'+photo+'|',
 'Скрытая подпись|Скрытый кадр|PageOwner|hidden|1750000001|two|'+hidden+'|',
 'Чужая подпись|Чужое фото|PageOther||1750000002|three|'+other+'|'].join('\n')+'\n');
php.writeFile('/www/local/datagallery/'+photo+'.dat','Отличный снимок!||1750000010|PageGuest|\nСпасибо за прогулку 😊||1750000020|PageOther|\n');
r=await req(base+'&tab=photos');assert.ok(r.text.includes(photo));assert.ok(!r.text.includes(hidden));assert.ok(!r.text.includes(other));assert.ok(!r.text.includes('Отличный снимок'));assert.ok(!r.text.includes('Спасибо за прогулку'));assert.ok(r.text.includes('Комментарии (2)'));assert.ok(!r.text.includes('up-comment-form'));capture(r,base+'&tab=photos','owner','photos-owner');
await login('PageGuest');
for(const a of ['save','news_add','news_edit','news_delete']){const bad=await action(a,{...settings,id:id(),msg:'Чужое',revision:'1'});assert.equal(bad.httpStatusCode,a==='news_delete'?404:403,a+' '+bad.text.match(/role="alert">([^<]+)/)?.[1]);}
const note=id();cool();r=await action('guest_add',{id:note,msg:'Спасибо за интересную страницу! 😊'});assert.equal(r.httpStatusCode,303);assert.equal(state().guestbook.length,1);
const once=raw();assert.equal((await action('guest_add',{id:note,msg:'Спасибо за интересную страницу! 😊'})).httpStatusCode,303);assert.equal(raw(),once);
assert.equal((await action('guest_add',{id:note,msg:'Подменённый повтор'})).httpStatusCode,409);
assert.equal((await action('guest_add',{id:id(),msg:'Слишком быстро'})).httpStatusCode,429);
assert.equal((await action('guest_edit',{id:note,revision:'1',msg:'Спасибо! Очень полезные новости города.'})).httpStatusCode,303);
assert.equal((await action('guest_edit',{id:note,revision:'1',msg:'Устаревшая форма'})).httpStatusCode,409);
r=await req(base+'&tab=guestbook');capture(r,base+'&tab=guestbook','visitor','guestbook-author');
r=await req(base+'&tab=guestbook&edit='+note);capture(r,base+'&tab=guestbook&edit='+note,'visitor','edit-review');
assert.equal((await action('guest_add',{id:'../bad',msg:'x'})).httpStatusCode,400);
cool();assert.equal((await action('guest_add',{id:id(),msg:''})).httpStatusCode,400);
assert.equal((await action('guest_add',{id:id(),msg:'Я'.repeat(2001)})).httpStatusCode,400);
assert.equal((await action('guest_add',{id:id(),'msg[]':'array'})).httpStatusCode,400);
const commentsPath='/www/local/datagallery/'+photo+'.dat',oldComments=php.readFileAsText(commentsPath);
for(const return_page of ['PageOther','https://evil.test/','../PageOwner'])assert.equal((await req('/gallery/index.php?action=addkomm&gid='+photo,{uid,msg:'Комментарий',return_page})).httpStatusCode,400);
assert.equal(php.readFileAsText(commentsPath),oldComments);
r=await req('/gallery/index.php?action=addkomm&gid='+photo,{uid,msg:'Новый общий комментарий с личной страницы',return_page:'PageOwner'});assert.equal(r.httpStatusCode,303);assert.ok(r.headers.location[0].includes('pages/userpage.php?uz=PageOwner&tab=photos#photo-'));
assert.ok((await req('/gallery/index.php?action=komm&gid='+photo)).text.includes('Новый общий комментарий'));
assert.ok((await req(base+'&tab=photos')).text.includes('Комментарии (3)'));assert.ok(!(await req(base+'&tab=photos')).text.includes('Новый общий комментарий'));
assert.equal((await req('/gallery/index.php?action=addkomm&gid='+hidden,{uid,msg:'Скрыто',return_page:'PageOwner'})).httpStatusCode,404);
await login('PageOther');const saved=raw();
assert.equal((await action('guest_edit',{id:note,revision:'2',msg:'Чужое исправление'})).httpStatusCode,403);
assert.equal((await action('guest_delete',{id:note,revision:'2'})).httpStatusCode,403);assert.equal(raw(),saved);
assert.equal((await req(base+'&tab=guestbook&edit='+note)).httpStatusCode,403);
pass('owner-only news, review author editing, per-record revisions, duplicate submit, cooldown, shared photo comments and hidden-photo boundaries');
await login('PageOwner');cool();const news=id();
r=await action('news_add',{id:news,title:'Новая прогулка по городу',msg:'В субботу встречаемся в парке. [b]Приходите![/b] 😊'});assert.equal(r.httpStatusCode,303);assert.equal(state().news.length,1);
const newsOnce=raw();assert.equal((await action('news_add',{id:news,title:'Новая прогулка по городу',msg:'В субботу встречаемся в парке. [b]Приходите![/b] 😊'})).httpStatusCode,303);assert.equal(raw(),newsOnce);
r=await req(base+'&tab=news');assert.ok(r.text.includes('<b>Приходите!</b>'));capture(r,base+'&tab=news','owner','news-owner');
r=await req(base+'&tab=news&edit='+news);capture(r,base+'&tab=news&edit='+news,'owner','edit-news');
assert.equal((await action('news_edit',{id:news,revision:'1',title:'Встреча перенесена на воскресенье',msg:'Встречаемся у входа в парк.'})).httpStatusCode,303);
assert.equal((await action('news_delete',{id:news,revision:'1'})).httpStatusCode,409);
const payload='</textarea><script>window.pageXss=1</script><img src=x onerror=alert(1)>',xss=id();cool();
assert.equal((await action('news_add',{id:xss,title:payload.slice(0,99),msg:payload+' [url=javascript:alert(1)]опасно[/url]'})).httpStatusCode,303);
r=await req(base+'&tab=news');assert.ok(!r.text.includes('<script>window.pageXss'));assert.ok(!r.text.includes('<img src=x'));assert.ok(!r.text.includes('href="javascript:'));assert.ok(r.text.includes('&lt;script&gt;'));
assert.equal((await action('news_delete',{id:xss,revision:'1'})).httpStatusCode,303);
assert.equal((await action('news_add',{id:xss,title:payload.slice(0,99),msg:payload+' [url=javascript:alert(1)]опасно[/url]'})).httpStatusCode,303);assert.equal(state().news.length,1);
assert.equal((await action('guest_edit',{id:note,revision:'2',msg:'Владелец не подменяет отзыв'})).httpStatusCode,403);
const hiddenSettings={revision:String(state().revision),title:settings.title,about:settings.about,published:'0',guestbook_open:'0'};
assert.equal((await action('save',hiddenSettings)).httpStatusCode,303);const privateData=raw();
await login('PageGuest');assert.equal((await req(base)).httpStatusCode,404);assert.equal((await action('guest_add',{id:id(),msg:'Нельзя'})).httpStatusCode,404);assert.equal(raw(),privateData);
await logout();for(const tab of ['overview','news','guestbook','photos'])assert.equal((await req(base+'&tab='+tab)).httpStatusCode,404);
await login('PageOwner');assert.equal((await action('save',{...hiddenSettings,revision:String(state().revision),published:'1'})).httpStatusCode,303);
await login('PageGuest');assert.equal((await action('guest_add',{id:id(),msg:'Закрытая гостевая'})).httpStatusCode,403);
await login('PageOwner');assert.equal((await action('save',{...settings,revision:String(state().revision)})).httpStatusCode,303);
r=await req(base+'&tab=settings');capture(r,base+'&tab=settings','owner','settings');
pass('news create/edit/delete, public/private page, closed guestbook, escaped HTML/BBCode, deleted-post replay remains idempotent');
// Admins can edit existing content; moderators retain deletion only. Nobody publishes news as another owner.
for(const mod of ['PageAdmin','PageCoAdmin','PageMod','PagePhoto']){
 await login(mod);r=await req(base+'&tab=photos');assert.ok(r.text.includes(hidden));
 const beforeEdit=raw(),allowed=['PageAdmin','PageCoAdmin'].includes(mod);
 assert.equal((await action('news_edit',{id:news,revision:'2',title:'Правка',msg:'Исправленный текст'})).httpStatusCode,allowed?303:403);
 assert.equal((await action('guest_edit',{id:note,revision:'2',msg:'Исправленный отзыв'})).httpStatusCode,allowed?303:403);
 assert.equal(state().news.find(e=>e.id===news).author,'PageOwner');assert.equal(state().guestbook.find(e=>e.id===note).author,'PageGuest');
 php.writeFile(path,beforeEdit);
 const s=state(),entry={id:id(),title:'Тест модерации',text:'Нарушение правил',author:'PageOwner',created:1750000000,updated:1750000000,revision:1};s.news.push(entry);saveState(s);
 assert.equal((await action('news_delete',{id:entry.id,revision:'1'})).httpStatusCode,303);
}
await login('PageMod');r=await req(base);capture(r,base,'moderator','moderation');
await login('PageOwner');assert.equal((await action('guest_delete',{id:note,revision:'2'})).httpStatusCode,303);
await login('PageGuest');cool();const ownReview=id();assert.equal((await action('guest_add',{id:ownReview,msg:'Мой отзыв'})).httpStatusCode,303);assert.equal((await action('guest_delete',{id:ownReview,revision:'1'})).httpStatusCode,303);
// Keep useful public examples and exercise bounded pagination with state generated in isolation.
let s=state();for(let i=0;i<12;i++)s.guestbook.push({id:id(),text:'Отзыв жителя '+(i+1)+': спасибо за фотографии нашего города!',author:i%2?'PageOther':'PageGuest',created:1750000100+i,updated:1750000100+i,revision:1});
for(let i=0;i<7;i++)s.news.push({id:id(),title:'Городская заметка '+(i+1),text:'Встречи соседей, прогулки и фотографии. Делимся новостями нашего района.',author:'PageOwner',created:1750000100+i,updated:1750000100+i,revision:1});saveState(s);
await login('PageOwner');for(const [q,name]of [['','overview-owner'],['&tab=photos','photos-owner-full'],['&tab=news&page=2','news-page2'],['&tab=guestbook&page=2','guestbook-page2']]){r=await req(base+q);assert.equal(r.httpStatusCode,200);capture(r,base+q,'owner',name);}
assert.equal((await req(base+'&tab=news&post='+news)).httpStatusCode,200);
for(const q of ['&page[]=1','&page=-1','&tab[]=news','&edit[]=x','&post[]=x','&action[]=x']){const bad=await req(base+q);assert.ok([302,400].includes(bad.httpStatusCode),q);if(bad.httpStatusCode===302)assert.ok(bad.headers.location[0].includes('isset=403'));}
await logout();r=await req(base);capture(r,base,'guest','overview-guest');assert.ok(!r.text.includes('Написать новость'));assert.ok(!r.text.includes('name="msg"'));assert.ok(!r.text.includes(hidden));
assert.equal((await action('guest_add',{id:id(),msg:'Гость без входа'})).httpStatusCode,403);
pass('moderation roles 101/102/103/105, owner/author delete, private edit forms, independent pagination and guest read-only access');
// Owner-specific page sizes must affect real slices and navigation, never the totals or rewards.
await login('PageOwner');
const visibleIds=(response,kind)=>Array.from(response.text.matchAll(new RegExp('<article[^>]*id="'+kind+'-([^"]+)"','g')),m=>m[1]);
const actionsHtml=response=>response.text.match(/<div class="up-actions up-page-actions">([\s\S]*?)<\/div>/)?.[1]||'';
let legacy=raw();assert.equal(state().page_sizes,undefined);
r=await req(base+'&tab=settings');assert.match(actionsHtml(r),/На личную страницу/);assert.doesNotMatch(actionsHtml(r),/Настроить страницу|Моё меню/);assert.match(actionsHtml(r),/class="touch-link up-button"[^>]*>Анкета пользователя/);
assert.doesNotMatch(actionsHtml(await req(base)),/Моё меню/);assert.match(actionsHtml(await req(base)),/class="touch-link up-button"[^>]*>Настроить страницу/);
await req(base+'&tab=settings',undefined,{},'HEAD');assert.equal(raw(),legacy);
assert.equal(visibleIds(await req(base),'news').length,3);assert.equal(visibleIds(await req(base+'&tab=news'),'news').length,5);assert.equal(visibleIds(await req(base+'&tab=guestbook'),'guest').length,10);
const galleryFile='/www/local/datagallery/fotobase.dat',galleryBefore=php.readFileAsText(galleryFile),addedPhotos=[];
for(let i=0;i<6;i++){const p=id()+'.png';addedPhotos.push(p);php.writeFile('/www/local/datagallery/'+p,image);}
php.writeFile(galleryFile,galleryBefore+addedPhotos.map((p,i)=>'Фото '+i+'|Дополнительное фото '+i+'|PageOwner||175000010'+i+'|extra|'+p+'|').join('\n')+'\n');
const photoOrder=[...addedPhotos].reverse().concat(photo),newsOrder=[...state().news].reverse().map(e=>e.id),reviewOrder=[...state().guestbook].reverse().map(e=>e.id);
const sizes={news_per_page:'2',photos_per_page:'3',reviews_per_page:'4'};
const sizeForm=()=>({...settings,...sizes,revision:String(state().revision)});
const preserved=state(),ownerProfile=php.readFileAsText('/www/local/profil/PageOwner.prof'),guestProfile=php.readFileAsText('/www/local/profil/PageGuest.prof');
for(const field of Object.keys(sizes))for(const value of ['0','-1','21','1.5','1e1','02',' 2','<script>','9'.repeat(40)]){
 const keep=raw();assert.equal((await action('save',{...sizeForm(),[field]:value})).httpStatusCode,400,field+' '+value);assert.equal(raw(),keep);
}
for(const field of Object.keys(sizes)){const keep=raw();assert.equal((await action('save',{...sizeForm(),[field+'[]']:'3'})).httpStatusCode,400);assert.equal(raw(),keep);}
assert.equal((await action('save',{...settings,revision:String(state().revision),news_per_page:'2'})).httpStatusCode,400);
assert.equal((await action('save',{...sizeForm(),uid:'wrong'})).httpStatusCode,403);
assert.equal((await action('save',sizeForm(),'PageOwner',{Origin:'https://evil.test'})).httpStatusCode,403);
const staleSizes=sizeForm();assert.equal((await action('save',staleSizes)).httpStatusCode,303);assert.deepEqual(state().page_sizes,{news:2,photos:3,reviews:4});
const sizedRaw=raw();assert.equal((await action('save',{...staleSizes,news_per_page:'10'})).httpStatusCode,409);assert.equal(raw(),sizedRaw);
for(const tab of ['', '&page=2']){r=await req(base+tab);assert.deepEqual(visibleIds(r,'news'),newsOrder.slice(0,2));assert.deepEqual(visibleIds(r,'photo'),photoOrder.slice(0,3));assert.deepEqual(visibleIds(r,'guest'),reviewOrder.slice(0,4));assert.match(r.text,/Все новости \(8\)/);assert.match(r.text,/Все фото \(7\)/);assert.match(r.text,/Все отзывы \(12\)/);}
capture(await req(base),base,'owner','overview-custom');
for(const [tab,kind,order,size]of [['news','news',newsOrder,2],['photos','photo',photoOrder,3],['guestbook','guest',reviewOrder,4]]){
 r=await req(base+'&tab='+tab+'&page=2');assert.deepEqual(visibleIds(r,kind),order.slice(size,size*2));assert.match(r.text,new RegExp('Страница 2 из '+Math.ceil(order.length/size)));assert.match(r.text,new RegExp('tab='+tab+'&amp;page=1'));
 const last=Math.ceil(order.length/size);r=await req(base+'&tab='+tab+'&page=999999');assert.deepEqual(visibleIds(r,kind),order.slice((last-1)*size));assert.doesNotMatch(r.text,/Следующая →/);
}
for(const boundary of ['1','20']){assert.equal((await action('save',{...sizeForm(),news_per_page:boundary,photos_per_page:boundary,reviews_per_page:boundary})).httpStatusCode,303);r=await req(base);for(const[kind,total]of [['news',8],['photo',7],['guest',12]])assert.equal(visibleIds(r,kind).length,Math.min(Number(boundary),total));}
assert.equal((await action('save',sizeForm())).httpStatusCode,303);
// An old form with all three new fields absent retains the owner's choices.
assert.equal((await action('save',{...settings,revision:String(state().revision)})).httpStatusCode,303);assert.deepEqual(state().page_sizes,{news:2,photos:3,reviews:4});
r=await req(base+'&tab=settings');for(const[name,value]of Object.entries(sizes))assert.match(r.text,new RegExp('name="'+name+'"[^>]*value="'+value+'"'));capture(r,base+'&tab=settings','owner','settings-custom');
for(const key of ['news','guestbook','comment_totals','review_totals','recent'])assert.deepEqual(state()[key],preserved[key],key);
assert.equal(php.readFileAsText('/www/local/profil/PageOwner.prof'),ownerProfile);assert.equal(php.readFileAsText('/www/local/profil/PageGuest.prof'),guestProfile);
const ownerRaw=raw();
for(const name of ['PageGuest','PageMod','PagePhoto']){await login(name);assert.equal((await req(base+'&tab=settings')).httpStatusCode,403);assert.equal((await action('save',sizeForm())).httpStatusCode,403);assert.equal(raw(),ownerRaw);assert.equal(visibleIds(await req(base),'news').length,2);}
await logout();assert.equal(visibleIds(await req(base),'photo').length,3);assert.equal(visibleIds(await req(base+'&tab=guestbook'),'guest').length,4);assert.equal(raw(),ownerRaw);
await login('PageOwner');
for(const bad of [null,[],{news:0,photos:3,reviews:4},{news:2,photos:'3',reviews:4},{news:2,photos:3},{news:2,photos:3,reviews:4,extra:1}]){saveState({...state(),page_sizes:bad});const badRaw=raw();assert.equal((await req(base)).httpStatusCode,503);assert.equal((await action('save',{...settings,...sizes,revision:'1'})).httpStatusCode,503);assert.equal(raw(),badRaw);php.writeFile(path,ownerRaw);}
php.writeFile(galleryFile,galleryBefore);
pass('owner page sizes 1–20: overview and section pagination, exact first/middle/last slices, unchanged totals/rewards/content, guest visibility, legacy no-write defaults/forms, stale/CSRF/Origin/type/corrupt-storage guards; profile buttons and settings return link');
// Administrative page management: only roles 101/102, no author forgery or activity loss.
const managementOriginal=raw(),galleryOriginal=php.readFileAsText(galleryFile);
for(const actor of ['PageOwner','PageGuest','PageMod','PagePhoto']){
 await login(actor);assert.equal((await req('/mpanel/userpages.php')).httpStatusCode,403);
 for(const command of ['reset_settings','clear_page']){const keep=raw();assert.equal((await action(command,{revision:String(state().revision),confirm:'1',manager:'1',staff:'1'})).httpStatusCode,403);assert.equal(raw(),keep);}
}
for(const actor of ['PageAdmin','PageCoAdmin']){
 await login(actor);assert.match((await req('/mpanel/index.php')).text,/href="userpages.php"/);
 r=await req('/mpanel/userpages.php?uz=PageOwn');assert.equal(r.httpStatusCode,200);assert.match(r.text,/userpage.php\?uz=PageOwner/);assert.doesNotMatch(r.text,/private-PageOwner|:\|\|:/);capture(r,'/mpanel/userpages.php?uz=PageOwn','admin','admin-pages-'+actor);
 for(const q of ['uz[]=PageOwner','uz=../PageOwner','page=-1']){const bad=await req('/mpanel/userpages.php?'+q);assert.ok([302,400].includes(bad.httpStatusCode));if(bad.httpStatusCode===302)assert.ok(bad.headers.location[0].includes('isset=403'));}
 assert.equal((await req('/mpanel/userpages.php',{uid,uz:'PageOwner'})).httpStatusCode,405);
 r=await req(base);assert.match(actionsHtml(r),/up-button[^>]*href="privat.php\?action=submit&amp;uz=PageOwner"/);assert.match(actionsHtml(r),/Управлять страницей/);assert.match(r.text,/gallery.php\?action=edit&amp;gid=/);
 let d=state();d.published=false;saveState(d);assert.equal((await req(base+'&tab=settings')).httpStatusCode,200);
 r=await req(base+'&tab=settings');capture(r,base+'&tab=settings','admin','admin-settings-'+actor);
 const adminSave={...sizeForm(),title:'Правка администрации',published:'1'};
 assert.equal((await action('save',adminSave)).httpStatusCode,303);assert.equal(state().title,'Правка администрации');assert.deepEqual(state().page_sizes,{news:2,photos:3,reviews:4});assert.equal(state().audit.at(-1).actor,actor);
 assert.equal((await action('save',adminSave)).httpStatusCode,409);
 const first=state().news[0],review=state().guestbook[0];
 for(const [tab,e]of [['news',first],['guestbook',review]])assert.equal((await req(base+'&tab='+tab+'&edit='+e.id)).httpStatusCode,200);
 assert.equal((await action('news_add',{id:id(),title:'Чужая публикация',msg:'Нет'})).httpStatusCode,403);
 for(const command of ['reset_settings','clear_page']){
  const original=raw(),before=state(),body={revision:String(before.revision),confirm:'1'};
  assert.equal((await req(base+'&action='+command+'&uid='+uid)).httpStatusCode,405);assert.equal(raw(),original);
  for(const bad of [{...body,uid:'wrong'},{...body,confirm:'0'}])assert.equal((await action(command,bad)).httpStatusCode,bad.uid?403:400);
  assert.equal((await action(command,body,'PageOwner',{Origin:'https://evil.test'})).httpStatusCode,403);assert.equal(raw(),original);
  assert.equal((await action(command,body)).httpStatusCode,303);const cleared=state();assert.equal(cleared.revision,before.revision+1);assert.equal(cleared.published,false);assert.equal(cleared.title,'');assert.equal(cleared.about,'');assert.equal(cleared.page_sizes,undefined);
  for(const key of ['comment_totals','review_totals','recent'])assert.deepEqual(cleared[key],before[key],key);
  assert.equal(cleared.audit.at(-1).actor,actor);assert.equal(cleared.audit.at(-1).action,command);
  assert.deepEqual(cleared.news,command==='clear_page'?[]:before.news);assert.deepEqual(cleared.guestbook,command==='clear_page'?[]:before.guestbook);
  const after=raw();assert.equal((await action(command,body)).httpStatusCode,409);assert.equal(raw(),after);assert.equal((await action('save',{...settings,revision:body.revision})).httpStatusCode,409);
  assert.equal(php.readFileAsText(galleryFile),galleryOriginal);php.writeFile(path,original);
 }
 php.writeFile(path,managementOriginal);
}
pass('admin/superadmin page directory, private-page settings, existing news/review edits, preserved authors, photo controls, reset/clear confirmations, CSRF/Origin/revisions, retained cumulative counts and replay receipts; lower roles denied');
// Phone field uses string storage, including + and leading zeroes; no external ICQ requests.
await login('PageOwner');
const profilePath='/www/local/profil/PageOwner.prof',profileOriginal=php.readFileAsText(profilePath),getProfile=()=>php.readFileAsText(profilePath).split(':||:');
const profileForm={my_name:'Сосед',otkel:'Город',infa:'О себе',mobila:'Browser',pol:'M',rost:'180',ves:'70',site:'',happy:''};
for(const phone of ['+82 10-1234-5678','00821012345678','+12345678901234567890','']){
 assert.equal((await req('/pages/profil.php?action=edit',{uid,...profileForm,phone})).httpStatusCode,302);assert.equal(getProfile()[19],phone);
 r=await req('/pages/anketa.php?view=details&uz=PageOwner');assert.match(r.text,/up-button[^>]*>Личная страница<\/a>/);assert.doesNotMatch(r.text,/web.icq.com|ICQ:/);if(phone)assert.ok(r.text.includes('Номер телефона: '+phone));
}
for(const phone of ['12','1'.repeat(21),'+82abc12345','1e12345','++123456','<script>12345</script>','12345\n67890','1'.repeat(41)]){const keep=getProfile()[19];assert.equal((await req('/pages/profil.php?action=edit',{uid,...profileForm,phone})).httpStatusCode,400);assert.equal(getProfile()[19],keep);}
assert.equal((await req('/pages/profil.php?action=edit',{uid,...profileForm,'phone[]':'12345'})).httpStatusCode,400);
assert.equal((await req('/pages/profil.php?action=edit',{uid:'bad',...profileForm,phone:'+821012345678'})).httpStatusCode,403);
assert.equal((await req('/pages/profil.php?action=edit',{uid,...profileForm,phone:'+821012345678'},{Origin:'https://evil.test'})).httpStatusCode,403);
assert.equal((await req('/pages/profil.php?action=edit',{uid,...profileForm,icq:'00123456789'})).httpStatusCode,302);assert.equal(getProfile()[19],'00123456789');
r=await req('/pages/profil.php');assert.match(r.text,/type="tel"[^>]*name="phone"[^>]*maxlength="40"/);capture(r,'/pages/profil.php','owner','phone-form');
r=await req('/pages/anketa.php?view=details&uz=PageOwner');capture(r,'/pages/anketa.php?view=details&uz=PageOwner','owner','phone-questionnaire');
assert.match(actionsHtml(await req(base)),/up-button[^>]*href="privat.php"[^>]*>Личные сообщения/);
await login('PageGuest');assert.match(actionsHtml(await req(base)),/up-button[^>]*href="privat.php\?action=submit&amp;uz=PageOwner"[^>]*>Личное сообщение/);
const adminProfileForm={ud1:'',ud2:'Город',ud3:'О себе',ud4:'page@example.test',ud5:'',ud6:'01.01.2020',ud13:'Browser',ud19:'+82 (10) 1234-5678',ud29:'Сосед',ud36:'0',ud40:'',ud41:'0',ud43:'',ud49:'17',ud65:'',ud7:'0'};
await login('PageCoAdmin');assert.equal((await req('/mpanel/users.php?action=upgrade&users=PageOwner',{uid,...adminProfileForm})).httpStatusCode,200);assert.equal(getProfile()[19],adminProfileForm.ud19);
assert.equal((await req('/mpanel/users.php?action=upgrade&users=PageOwner',{uid,...adminProfileForm,ud19:'<img src=x>'})).httpStatusCode,400);assert.equal(getProfile()[19],adminProfileForm.ud19);
const adminBefore=php.readFileAsText('/www/local/profil/PageAdmin.prof');assert.equal((await req('/mpanel/users.php?action=upgrade&users=PageAdmin',{uid,...adminProfileForm})).httpStatusCode,403);assert.equal(php.readFileAsText('/www/local/profil/PageAdmin.prof'),adminBefore);
await login('PageAdmin');assert.equal((await req('/mpanel/users.php?action=upgrade&users=PageOwner',{uid,...adminProfileForm,ud19:'001234567890'})).httpStatusCode,200);assert.equal(getProfile()[19],'001234567890');
php.writeFile(profilePath,profileOriginal);php.writeFile(path,managementOriginal);await login('PageOwner');
pass('phone profile/admin forms: international prefix, 20 digits and leading zeroes preserved; invalid inputs/arrays/CSRF/Origin refused, empty/legacy forms supported, escaped display, no ICQ tracker, admin account hierarchy enforced');

// Corrupt storage and path redirection must fail without replacing data.
await login('PageOwner');const valid=raw();php.writeFile(path,'{broken');assert.equal((await req(base)).httpStatusCode,503);assert.equal((await action('save',{...settings,revision:'1'})).httpStatusCode,503);assert.equal(raw(),'{broken');php.writeFile(path,valid);
const helper="define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/userpages.php';";
await run("file_put_contents('/tmp/up-outside','outside');rename('/www/local/userpages/PageOwner.json','/www/local/userpages/PageOwner.saved');symlink('/tmp/up-outside','/www/local/userpages/PageOwner.json');");
assert.equal((await req(base)).httpStatusCode,503);assert.equal((await action('save',{...settings,revision:'1'})).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/up-outside'),'outside');
await run("unlink('/www/local/userpages/PageOwner.json');rename('/www/local/userpages/PageOwner.saved','/www/local/userpages/PageOwner.json');");
const profileBefore=php.readFileAsText('/www/local/profil/PageOwner.prof');assert.equal(profileBefore.split(':||:')[49],'17');
const bounded=raw();s=state();s.recent.forEach(e=>e.time=1);
while(s.news.length<100)s.news.push({id:id(),title:'Лимит',text:'Текст новости',author:'PageOwner',created:1750000000,updated:1750000000,revision:1});
saveState(s);const fullNews=raw();assert.equal((await action('news_add',{id:id(),title:'Лишняя новость',msg:'Текст'})).httpStatusCode,409);assert.equal(raw(),fullNews);php.writeFile(path,bounded);
s=state();s.recent.forEach(e=>e.time=1);while(s.guestbook.length<500)s.guestbook.push({id:id(),text:'Отзыв',author:'PageGuest',created:1750000000,updated:1750000000,revision:1});
saveState(s);const fullBook=raw();assert.equal((await action('guest_add',{id:id(),msg:'Лишний отзыв'})).httpStatusCode,409);assert.equal(raw(),fullBook);php.writeFile(path,bounded);
await login('PageGuest');let member=php.readFileAsText('/www/local/profil/PageGuest.prof').split(':||:');member[37]='1';member[38]=String(Math.floor(Date.now()/1000)+86400);php.writeFile('/www/local/profil/PageGuest.prof',member.join(':||:'));
r=await action('guest_add',{id:id(),msg:'Заблокированный пользователь'});assert.equal(r.httpStatusCode,302);assert.ok(r.headers.location[0].includes('/pages/ban.php'));assert.equal(raw(),bounded);
member[37]='0';member[6]=String(Math.floor(Date.now()/1000));php.writeFile('/www/local/profil/PageGuest.prof',member.join(':||:'));
cfg=php.readFileAsText('/www/local/config.dat').split('|');cfg[3]='86400';php.writeFile('/www/local/config.dat',cfg.join('|'));
assert.equal((await action('guest_add',{id:id(),msg:'Карантин'})).httpStatusCode,403);assert.equal(raw(),bounded);
cfg[3]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
pass('100-news/500-review limits preserve existing records; banned and quarantined users cannot post');
// Recovery form offers the generated data directory, and the safe restore accepts its JSON.
await login('PageAdmin');assert.ok((await req('/mpanel/backup.php?action=backup')).text.includes('userpages'));
assert.equal(await run("define('DATADIR','/tmp/up-restore/');mkdir('/tmp/up-restore');require '/www/includes/backup-security.php';$z=new ZipArchive();$z->open('/tmp/up-data.zip',ZipArchive::CREATE);$z->addFromString('userpages/BackupUser.json','{\"ok\":true}');$z->close();motor_backup_restore('/tmp/up-data.zip');echo file_get_contents('/tmp/up-restore/userpages/BackupUser.json');"),'{"ok":true}');
pass('corrupt JSON and symlink refused without data loss; authority unchanged; personal-page data included in backup and safe restore');
writeFileSync(new URL('manifest.json',fixtureDir),JSON.stringify(fixtures,null,2));
writeFileSync(new URL('./userpages-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,passed,fixtures:fixtures.map(({file,url,role,name})=>({file,url,role,name}))},null,2));
console.log('SUCCESS',requests,'HTTP requests;',fixtures.length,'browser fixtures');
}finally{php.exit()}
