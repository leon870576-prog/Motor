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
const profile=name=>php.readFileAsText('/www/local/profil/'+name+'.prof').split(':||:');
const save=d=>php.writeFile(path,JSON.stringify(d));const cool=()=>{const d=state();d.recent.forEach(r=>r.time=1);save(d)};
function setProfile(name,fields){const p=profile(name);for(const[k,v]of Object.entries(fields))p[+k]=String(v);php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
async function action(a,body={},owner='PageOwner',headers={}){return req('/pages/userpage.php?uz='+owner+'&action='+a,{uid,...body},headers);}
function capture(r,url,name){const file=name+'.html';writeFileSync(new URL(file,fixtureDir),r.text);fixtures.push({file,url,role:'commenter',name});}
const helper="define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/userpages.php';";
const total=async()=>Number(await run(helper+'echo motor_info_count(3);'));
await login('PageOwner');const settings={revision:'0',title:'Новости нашего двора',about:'Обсуждаем городские новости',published:'1',guestbook_open:'1'};
assert.equal((await action('save',settings)).httpStatusCode,303);
const post=id(),second=id();for(const [id,title]of [[post,'Встреча соседей в воскресенье'],[second,'Новая прогулка']]){cool();assert.equal((await action('news_add',{id,title,msg:'Встречаемся у входа в парк. Приходите!'})).httpStatusCode,303);}
assert.ok(!('comments' in state().news[0]),'legacy records remain readable without migration');
const url=base+'&tab=comments&post='+post;let r=await req(url);assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Комментарии (0)'));
for(const u of [base,base+'&tab=settings',url])assert.ok(!/гостев(?:ая|ую|ой) книг/i.test((await req(u)).text));
await logout();r=await req(url);assert.equal(r.httpStatusCode,200);assert.ok(!r.text.includes('name="msg"'));assert.equal((await action('comment_add',{post,id:id(),msg:'Гость'})).httpStatusCode,403);
await login('PageGuest');const initial=Number(profile('PageGuest')[33]),initialPoints=Number(profile('PageGuest')[36]),initialMoney=Number(profile('PageGuest')[41]),globalInitial=await total();const cid=id(),input={post,id:cid,msg:'Спасибо! [b]Будем.[/b] 😊'};cool();
for(const a of ['comment_add','comment_edit','comment_delete'])assert.equal((await req(base+'&action='+a+'&uid='+uid+'&post='+post+'&id='+cid)).httpStatusCode,405);
const before=raw();
for(const body of [{...input,uid:'wrong'},{...input,uid:''}])assert.equal((await action('comment_add',body)).httpStatusCode,403);
for(const headers of [{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await action('comment_add',input,'PageOwner',headers)).httpStatusCode,403);
for(const bad of [{post:'../x'},{'post[]':'x',post:undefined},{'id[]':'x',id:undefined},{msg:''},{msg:'Я'.repeat(2001)},{'msg[]':'x',msg:undefined}])assert.equal((await action('comment_add',{...input,...bad})).httpStatusCode,400);
assert.equal((await action('comment_add',{...input,post:id()})).httpStatusCode,404);assert.equal(raw(),before);assert.equal(Number(profile('PageGuest')[33]),initial);
r=await action('comment_add',input);assert.equal(r.httpStatusCode,303,r.text.match(/role="alert">([^<]+)/)?.[1]);assert.ok(r.headers.location[0].includes('tab=comments'));assert.ok(r.headers.location[0].endsWith('#comment-'+cid));
assert.equal(state().news[0].comments.length,1);assert.equal(Number(profile('PageGuest')[33]),initial+1);assert.equal(await total(),globalInitial+1);
const once=raw(),onceProfile=php.readFileAsText('/www/local/profil/PageGuest.prof');assert.equal((await action('comment_add',input)).httpStatusCode,303);assert.equal(raw(),once);assert.equal(php.readFileAsText('/www/local/profil/PageGuest.prof'),onceProfile);
assert.equal((await action('comment_add',{...input,post:second})).httpStatusCode,409);assert.equal((await action('comment_add',{...input,msg:'Другой повтор'})).httpStatusCode,409);assert.equal((await action('comment_add',{...input,id:id()})).httpStatusCode,429);
assert.ok((await req('/pages/anketa.php?view=details&uz=PageGuest')).text.includes('Комментариев: '+(initial+1)+'<br'));
r=await req(base);assert.ok(r.text.includes('Комментарии (1)'));assert.ok(!r.text.includes('<b>Будем.</b>'));
r=await req(url);assert.ok(r.text.includes('<b>Будем.</b>'));capture(r,url,'comments-reader');
r=await req(url+'&edit='+cid);assert.equal(r.httpStatusCode,200);capture(r,url+'&edit='+cid,'edit-comment');
assert.equal((await action('comment_edit',{post,id:cid,revision:'1',msg:'Спасибо! Придём всей семьёй.'})).httpStatusCode,303);assert.equal((await action('comment_edit',{post,id:cid,revision:'1',msg:'Устаревшее'})).httpStatusCode,409);assert.equal(Number(profile('PageGuest')[33]),initial+1);
// Crash-window recovery: comment saved, profile increment not yet applied. Retry repairs once.
setProfile('PageGuest',{33:initial,36:initialPoints,41:initialMoney,97:''});assert.equal((await action('comment_add',input)).httpStatusCode,303);assert.equal(Number(profile('PageGuest')[33]),initial+1);assert.equal((await action('comment_add',input)).httpStatusCode,303);assert.equal(Number(profile('PageGuest')[33]),initial+1);
pass('legacy news, comment links/counters, guest read-only, POST/CSRF/Origin/types/lengths, idempotent retry, cooldown, profile and global totals, recoverable profile synchronization');
await login('PageOther');assert.equal((await action('comment_edit',{post,id:cid,revision:'2',msg:'Подмена'})).httpStatusCode,403);assert.equal((await action('comment_delete',{post,id:cid,revision:'2',staff:'1'})).httpStatusCode,403);assert.equal((await req(url+'&edit='+cid)).httpStatusCode,403);
await login('PageOwner');assert.equal((await action('comment_edit',{post,id:cid,revision:'2',msg:'Подмена владельцем'})).httpStatusCode,403);
// Editing the news itself retains concurrent comments.
assert.equal((await action('news_edit',{id:post,revision:'1',title:'Встреча соседей в воскресенье',msg:'Новость уточнена.'})).httpStatusCode,303);assert.equal(state().news[0].comments.length,1);
assert.equal((await action('save',{...settings,revision:String(state().revision),published:'0'})).httpStatusCode,303);assert.equal(await total(),globalInitial);
await login('PageGuest');assert.equal((await req(url)).httpStatusCode,404);assert.equal((await action('comment_add',{post,id:id(),msg:'Скрытая'})).httpStatusCode,404);
await login('PageOwner');assert.equal((await action('save',{...settings,revision:String(state().revision),published:'1'})).httpStatusCode,303);
for(const actor of ['PageMod','PageCoAdmin','PagePhoto','PageAdmin']){
 await login(actor);assert.equal((await action('comment_edit',{post,id:cid,revision:'2',msg:'Подмена модератором'})).httpStatusCode,403);
}
await login('PageMod');assert.equal((await action('comment_delete',{post,id:cid,revision:'1'})).httpStatusCode,409);assert.equal((await action('comment_delete',{post,id:cid,revision:'2'})).httpStatusCode,303);assert.equal(state().news[0].comments.length,0);assert.equal(await total(),globalInitial);assert.equal(Number(profile('PageGuest')[33]),initial+1);
await login('PageGuest');assert.equal((await action('comment_add',input)).httpStatusCode,303);assert.equal(state().news[0].comments.length,0);assert.equal(Number(profile('PageGuest')[33]),initial+1);
cool();const xss=id(),payload='</textarea><script>window.commentXss=1</script><img src=x onerror=alert(1)> [url=javascript:alert(1)]X[/url]';assert.equal((await action('comment_add',{post,id:xss,msg:payload})).httpStatusCode,303);r=await req(url);assert.ok(!r.text.includes('<script>window.commentXss'));assert.ok(!r.text.includes('<img src=x'));assert.ok(!r.text.includes('href="javascript:'));assert.ok(r.text.includes('&lt;script&gt;'));
assert.equal((await action('comment_delete',{post,id:xss,revision:'1'})).httpStatusCode,303);assert.equal(Number(profile('PageGuest')[33]),initial+2);
pass('author-only editing, owner/staff deletion, stale revisions, private pages, deleted-comment retry, escaped XSS/BBCode, cumulative author total retained after deletion');
// Pagination remains tied to its own news; limits fail before writes.
let d=state();for(let i=0;i<12;i++)d.news[0].comments.push({id:id(),author:'PageGuest',text:'Комментарий соседа '+(i+1),created:1750000100+i,updated:1750000100+i,revision:1});save(d);
r=await req(url);assert.match(r.text,/post=[a-f0-9]+&amp;tab=comments&amp;page=2/);r=await req(url+'&page=2');assert.equal(r.httpStatusCode,200);assert.equal((r.text.match(/id="comment-/g)||[]).length,2);capture(r,url+'&page=2','comments-page2');
const valid=raw();d=state();while(d.news[0].comments.length<500)d.news[0].comments.push({id:id(),author:'PageGuest',text:'Лимит',created:1,updated:1,revision:1});d.recent=[];save(d);const limit=raw();assert.equal((await action('comment_add',{post,id:id(),msg:'Лишний'})).httpStatusCode,409);assert.equal(raw(),limit);php.writeFile(path,valid);
const genuineReceipt=profile('PageGuest')[97];setProfile('PageGuest',{97:'unrecognized:protected'});cool();const preserved=raw();assert.equal((await action('comment_add',{post,id:id(),msg:'Нельзя'})).httpStatusCode,503);assert.equal(raw(),preserved);assert.equal(profile('PageGuest')[97],'unrecognized:protected');
// Restore the genuine receipt from before this corruption injection.
setProfile('PageGuest',{97:genuineReceipt});
setProfile('PageGuest',{6:Math.floor(Date.now()/1000)});cfg=php.readFileAsText('/www/local/config.dat').split('|');cfg[3]='86400';php.writeFile('/www/local/config.dat',cfg.join('|'));assert.equal((await action('comment_add',{post,id:id(),msg:'Карантин'})).httpStatusCode,403);cfg[3]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));setProfile('PageGuest',{6:1});
await login('PageOwner');const previousTotal=Number(profile('PageGuest')[33]);assert.equal((await action('news_delete',{id:post,revision:'2'})).httpStatusCode,303);assert.equal((await req(url)).httpStatusCode,404);assert.equal((await action('comment_add',{post,id:id(),msg:'Удалено'})).httpStatusCode,404);assert.equal(Number(profile('PageGuest')[33]),previousTotal);assert.equal(await total(),globalInitial);
pass('independent pagination, limits, unknown profile state preserved, quarantine, news editing preserves comments, news deletion removes discussion and visible counts');
writeFileSync(new URL('comments-manifest.json',fixtureDir),JSON.stringify(fixtures,null,2));writeFileSync(new URL('./userpage-comments-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'HTTP requests');
}finally{php.exit()}
