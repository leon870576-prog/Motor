import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { File } from 'node:buffer';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2] || fileURLToPath(new URL('../site',import.meta.url));
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
function copy(from,to){ if(!php.fileExists(to))php.mkdir(to); for(const e of readdirSync(from,{withFileTypes:true})){ const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f)); } }
const hash=x=>createHash('sha256').update(x).digest('hex');
let requests=0,passed=[];
const pass=x=>{passed.push(x);console.log('PASS',x)};
try{
copy(root,'/www');
await setPhpIniEntries(php,{upload_max_filesize:'32M',post_max_size:'64M',max_file_uploads:'20',allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 // Build a byte-correct multipart body: runtime's helper counts Unicode characters as bytes.
 if(body && !(body instanceof Uint8Array) && typeof body==='object'){
  const boundary='MotorTest'+randomBytes(12).toString('hex'),chunks=[];
  for(const [name,value] of Object.entries(body)){
   chunks.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"'+(value instanceof File?'; filename="'+value.name+'"':'')+'\r\n'+(value instanceof File?'Content-Type: application/octet-stream\r\n':'')+'\r\n'));
   chunks.push(value instanceof File?Buffer.from(await value.arrayBuffer()):Buffer.from(String(value)));chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(chunks));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
 }
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});
 requests++;assert.equal(r.errors,'',url);assert.ok(r.exitCode===0,url+' exit '+r.exitCode);return r;
}
function lines(path){return php.readFileAsText('/www/local/'+path).split(/\r?\n/).filter(Boolean)}
function manifest(section,parent){return JSON.parse(php.readFileAsText('/www/local/attachments/'+section+'/'+parent+'/manifest.json'))}
function url(section,parent,id){return '/attachment.php?section='+section+'&parent='+parent+'&file='+id}
async function token(){const r=await req('/pages/themes.php');return r.text.match(/name="uid" value="([^"]+)"/)[1]}
async function settingsPost(values){
 const all=JSON.parse(php.readFileAsText('/www/local/attachment-settings.json'));
 for(const [section,changed]of Object.entries(values))Object.assign(all[section],changed);
 const data={uid:await token()};for(const [section,s]of Object.entries(all))for(const [key,value]of Object.entries(s)){
  if(Array.isArray(value))value.forEach((v,i)=>data[`${section}[${key}][${i}]`]=v);else data[`${section}[${key}]`]=String(value);
 }
 return req('/mpanel/attachments.php',data);
}
const password=randomBytes(10).toString('hex');
await req('/index.php'); await req('/INSTALL.php');
await req('/INSTALL.php?action=install',{name:'MotorTestAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let config=php.readFileAsText('/www/local/config.dat').split('|');config[3]='0';config[29]='0';config[57]='0';config[18]='1';config[59]='5';php.writeFile('/www/local/config.dat',config.join('|'));
assert.equal((await req('/mpanel/attachments.php')).httpStatusCode,403);
await req('/input.php',{login:'MotorTestAdmin',pass:password});
let uid=await token();

// Character, parser and catalogue checks are isolated from application sessions.
let r=await php.run({code:`<?php
define('BASEDIR','/portal/');require '/www/includes/functions.php';
function ok($x,$m){if(!$x)throw new Exception($m);}
function images($s){return substr_count($s,'class="motor-smile"');}
$config=['resmiles'=>2];
$s='В 12:30 https://example.test/:D :unknown :) :hello :cry 😊 👨‍👩‍👧‍👦 👍🏽';
$render=motor_smiles_render($s);ok(images($render)===2,'actual smile limit');ok(str_contains($render,':cry'),'over limit stays text');ok(str_contains($render,'https://example.test/:D'),'URL unchanged');ok(nosmiles($render)===$s,'round trip');ok(motor_smiles_render($render)===$render,'idempotence');
$config['resmiles']=0;ok(motor_smiles_render(':) :hello')===':) :hello','disabled limit');
$config['resmiles']=-1;ok(images(motor_smiles_render(':) :) :)'))===3,'unlimited');
$protected='<a href="https://example.test/:D">:hello</a><code>:hello</code><pre>:)</pre>[code]:)[/code][url=https://example.test]:hello[/url]';ok(motor_smiles_render($protected)===$protected,'links and code untouched');
ok(images(bb_code('[code]echo ":hello";[/code]'))===0,'highlighted code untouched');
ok(images(motor_smiles_render(':helloWorld :Dinosaur :not_a_smile'))===0,'unknown codes not replaced by prefixes');
ok(images(motor_smiles_render(':ban'))===0,'ordinary author cannot use admin code');
$admin=motor_smiles_render(':ban',true);ok(images($admin)===1,'admin code');ok(images(motor_smiles_render($admin))===1,'authorised image visible to every reader');
foreach(['../','images/../','/','https://motor.test/',''] as $prefix){$legacy='<img src="'.$prefix.'images/smiles/).gif" alt="image" />';ok(nosmiles($legacy)===':)','legacy reverse conversion');ok(str_contains(motor_smiles_render($legacy),'src="/portal/images/smiles/%29.gif"'),'legacy path normalisation');}
$external='<img src="/uploads/photo.gif" alt="image" />';ok(nosmiles($external)===$external,'attachments untouched');
$n=0;foreach(motor_smile_catalog() as $group=>$names){foreach($names as $name=>$_){ok((bool)getimagesize('/www/images/'.$group.'/'.$name.'.gif'),'valid GIF '.$name);$src=':'.$name;ok(images(motor_smiles_render($src,true))===1,'catalog code '.$src);ok(nosmiles(motor_smiles_render($src,true))===$src,'catalog roundtrip '.$src);$n++;}}
ob_start();quicksmiles();$picker=ob_get_clean();preg_match_all('~src="/portal/([^"]+)"~',$picker,$m);foreach($m[1] as $asset)ok(file_exists('/www/'.$asset),'picker asset');
echo json_encode(['assets'=>$n,'picker'=>count($m[1])]);`});
assert.equal(r.errors,'');assert.equal(r.exitCode,0);const catalogue=JSON.parse(r.text);assert.equal(catalogue.assets,121);assert.equal(catalogue.picker,10);pass('121 valid GIFs, picker, limits, admin rules, Unicode, legacy paths, edit roundtrip, safe URL/code handling');
const emoji='😊 👨‍👩‍👧‍👦 👍🏽';
const message='Проверка смайлов :) :hello '+emoji;
const views=[];
async function rendered(url,marker='Проверка смайлов',code=':hello'){
 const result=await req(url);assert.equal(result.httpStatusCode,200,url);assert.ok(result.text.includes(marker),url+' message');assert.ok(result.text.includes(emoji),url+' emoji');assert.ok(result.text.includes('class="motor-smile"'),url+' smile');assert.ok(result.text.includes('alt="'+code+'"'),url+' expected smile');
 for(const m of result.text.matchAll(/<img class="motor-smile" src="([^"]+)"/g)){
  const asset=decodeURIComponent(new URL(m[1].replaceAll('&amp;','&'),'https://motor.test'+url).pathname);assert.ok(php.fileExists('/www'+asset),url+' missing asset '+asset);
 }
 views.push(url);return result;
}
// Publish news and edit it through the actual form; the home feed uses the same record.
r=await req('/mpanel/news.php?action=add&uid='+uid,{themes:'Новости смайлов',msg:message});assert.equal(r.httpStatusCode,302);
const newsIndex=lines('news.dat').length-1,newsId=lines('news.dat').at(-1).split('|')[5];
await rendered('/news/index.php');await rendered('/news/komm.php?id='+newsId);await rendered('/mpanel/news.php');
let edit=await req('/mpanel/news.php?action=editnews&id='+newsIndex), version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
assert.match(edit.text,/<textarea[^>]*>[^<]*:hello/);
r=await req('/mpanel/news.php?action=edit&id='+newsIndex+'&uid='+uid,{name:'Новости смайлов',msg:message+' исправлено :cry',record_version:version,timer:'1',logins:'MotorTestAdmin',komm:newsId});assert.equal(r.httpStatusCode,302);
await rendered('/news/index.php','исправлено',':cry');await rendered('/news/komm.php?id='+newsId,'исправлено',':cry');
// Exercise the actual home renderer even when the owner replaced the home layout.
php.writeFile('/www/local/datamain/index.dat','<?php last_news(); include BASEDIR."pyramid/msg.php"; ?>');
await rendered('/index.php','исправлено',':cry');
assert.equal((await req('/news/komm.php?action=add&id='+newsId+'&uid='+uid,{msg:message+' комментарий'})).httpStatusCode,302);await rendered('/news/komm.php?id='+newsId,'комментарий');
r=await req('/news/rss.php');assert.ok(r.text.includes('https://motor.test/images/smiles/'));assert.ok(r.text.includes(emoji));pass('news create/edit, home feed, comments, admin view and absolute smile URLs in RSS');
// Forum author and moderator edit the same message without leaking HTML into the editor.
await req('/mpanel/forum.php?act=addforum&uid='+uid,{title:'Форум смайлов'});const fid=lines('dataforum/mainforum.dat').at(-1).split('|')[0];
let profile=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:');profile[0]='SmileAuthor';profile[1]=createHash('md5').update(createHash('md5').update(password).digest('hex')).digest('hex');profile[7]='0';profile[6]='1';profile[25]='1';profile[3]=message;
php.writeFile('/www/local/profil/SmileAuthor.prof',profile.join(':||:'));php.writeFile('/www/local/privat/SmileAuthor.priv','');
await req('/input.php?action=exit');await req('/input.php',{login:'SmileAuthor',pass:password});uid=await token();
r=await req('/forum/forum.php?act=create&fid='+fid+'&uid='+uid,{fid,title:'Тема смайлов',msg:message});assert.equal(r.httpStatusCode,302);
const topic=lines('dataforum/topic'+fid+'.dat').at(-1).split('|')[0],postPath='dataforum/'+fid+'-'+topic+'.dat',topicURL='/forum/topic.php?fid='+fid+'&id='+topic;
await rendered(topicURL);
r=await req('/forum/topic.php?act=add&fid='+fid+'&id='+topic+'&uid='+uid,{msg:message+' ответ :ban'});assert.equal(r.httpStatusCode,302);assert.ok(lines(postPath).at(-1).includes(':ban'));assert.ok(!lines(postPath).at(-1).includes('smiles2/'));
const editURL='/forum/edit.php?fid='+fid+'&id='+topic+'&post=0';edit=await req(editURL);version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];assert.match(edit.text,/<textarea[^>]*>[^<]*:hello/);
r=await req(editURL,{uid,record_version:version,msg:message+' автор исправил'});assert.equal(r.httpStatusCode,302);await rendered(topicURL,'автор исправил');
await req('/input.php?action=exit');await req('/input.php',{login:'MotorTestAdmin',pass:password});uid=await token();
const adminEdit='/mpanel/forum.php?act=editpost&fid='+fid+'&id='+topic+'&post=0';edit=await req(adminEdit);version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];assert.match(edit.text,/<textarea[^>]*>[^<]*:hello/);assert.ok(!edit.text.match(/<textarea[^>]*>[^<]*&lt;img/));
r=await req('/mpanel/forum.php?act=changepost&fid='+fid+'&id='+topic+'&post=0&uid='+uid,{author:'SmileAuthor',msg:message+' модератор исправил\n:cry :ban',record_version:version});assert.equal(r.httpStatusCode,302);assert.equal(lines(postPath).length,2);await rendered(topicURL,'модератор исправил',':cry');await rendered('/mpanel/forum.php?act=topic&fid='+fid+'&id='+topic,'модератор исправил',':ban');
edit=await req(adminEdit);assert.match(edit.text,/<textarea[^>]*>[^<]*:ban/);pass('forum topic/reply, member edit, moderator edit, multiline records and author-scoped admin smiles');
// Public sections and their moderation views.
assert.equal((await req('/book/add.php?uid='+uid,{msg:message})).httpStatusCode,302);await rendered('/book/index.php');await rendered('/mpanel/book.php');
const bookId=lines('book.dat').length-1;
assert.equal((await req('/mpanel/book.php?action=addotvet&id='+bookId+'&uid='+uid,{otvet:message+' ответ администрации'})).httpStatusCode,302);await rendered('/book/index.php','ответ администрации');
assert.equal((await req('/chat/add.php',{uid,msg:message})).httpStatusCode,302);await rendered('/chat/index.php');await rendered('/mpanel/chat.php');
assert.equal((await req('/mpanel/adminchat.php?action=add&uid='+uid,{msg:message})).httpStatusCode,302);await rendered('/mpanel/adminchat.php');pass('guestbook, administrator answer, mini-chat and admin chat, including moderation views');
// A fixture image is local to this disposable runtime; comments use the real POST endpoint.
const stamp=Math.floor(Date.now()/1000);php.writeFile('/www/local/datagallery/smile-test.gif',readFileSync(join(root,'images/img/news.gif')));php.writeFile('/www/local/datagallery/fotobase.dat',`${message}|Фото смайлов|MotorTestAdmin||${stamp}||smile-test.gif|\r\n`);
await rendered('/gallery/index.php');await rendered('/gallery/index.php?action=showimg&gid=smile-test.gif');await rendered('/mpanel/gallery.php');
assert.equal((await req('/gallery/index.php?action=addkomm&gid=smile-test.gif',{uid,msg:message})).httpStatusCode,302);await rendered('/gallery/index.php?action=komm&gid=smile-test.gif');pass('gallery descriptions, image detail, comments and moderation');
php.writeFile('/www/local/databoard/database.dat','Тест|Тестовая рубрика|987|\r\n');
r=await req('/board/add.php?action=add&id=987',{uid,zag:'Объявление смайлов',msg:message,days:'3'});assert.equal(r.httpStatusCode,302);const bid=lines('databoard/987.dat').at(-1).split('|')[5];
await rendered('/board/index.php?action=board&id=987');await rendered('/board/index.php?action=view&id=987&bid='+bid);await rendered('/mpanel/board.php?action=board&id=987');await rendered('/pages/anketa.php?uz=SmileAuthor');pass('announcements list/detail/moderation and profile About me');
// Private-message testing is restricted to temporary accounts in the in-memory site.
r=await req('/pages/privat.php?action=send&uz=SmileAuthor&uid='+uid,{msg:message});assert.equal(r.httpStatusCode,302);await rendered('/pages/privat.php?action=output');
await req('/input.php?action=exit');await req('/input.php',{login:'SmileAuthor',pass:password});uid=await token();await rendered('/pages/privat.php');pass('private messages, sent and received, with temporary accounts only');
php.writeFile('/www/local/datavotes/votes.dat',`${message}|${message} вариант|Нет|`);php.writeFile('/www/local/datavotes/result.dat','0|1|1|0');php.writeFile('/www/local/datavotes/allvotes.dat',[message,message+' - 1','Нет - 1','','','','','','','','','2',''].join('|')+'\r\n');
await rendered('/votes/index.php');await rendered('/votes/vote.php');await rendered('/votes/allvotes.php');pass('poll question/options, results and archive');
assert.equal((await req('/pyramid/go.php',{uid,msg:message,icq:'123456'})).httpStatusCode,302);await rendered('/pyramid/history.php');await rendered('/index.php');pass('pyramid messages, history and home rendering');
// Same stored content must render in each palette; the stylesheet bounds inline GIFs.
const themes=['lesika_dvor','lesika_gazeta','lesika_gostinaya','lesika_solnce','lesika_vecher','lesika_albom','lesika_uyut'];
for(const skin of themes){await req('/pages/skin.php',{skins:skin,uid,return:'themes'});r=await rendered(topicURL,'модератор исправил',':ban');assert.ok(r.text.includes('<body data-theme="'+skin+'">'));await rendered('/board/index.php?action=view&id=987&bid='+bid);}
assert.match(readFileSync(join(root,'assets/lesika/site.css'),'utf8'),/img\.motor-smile\{[^}]*max-height:48px/);pass('all seven themes, inline size bounds and valid asset paths on every checked page');
const fixtures=[];const fixturesDir=new URL('./fixtures/',import.meta.url);mkdirSync(fixturesDir,{recursive:true});
async function capture(url,role,expectedCount){
 const r=await req(url);assert.equal(r.httpStatusCode,200,url);
 const marker=(r.text.match(/data-smile-picker/g)||[]).length;assert.ok(marker>0,url+' missing field marker');if(expectedCount)assert.equal(marker,expectedCount,url);
 const json=r.text.match(/<script type="application\/json" id="motor-smile-data">([\s\S]*?)<\/script>/);assert.ok(json,url+' missing catalogue');
 const groups=JSON.parse(json[1]);assert.equal(groups.find(g=>g.id==='smiles').items.length,105);assert.equal(groups.find(g=>g.id==='emoji').items.length,32);assert.equal(groups.some(g=>g.id==='smiles2'),role==='admin');
 assert.equal((r.text.match(/smile-picker\.js\?v=picker1/g)||[]).length,1,url+' duplicate picker');
 assert.ok(!r.text.includes("tag(' :"),url+' old icon strip');
 const name=`${role}-${fixtures.length}.html`;writeFileSync(new URL(name,fixturesDir),r.text);fixtures.push({url,role,file:name,fields:marker});return r;
}
// Coverage for all public composition routes, including both comment systems.
for(const path of ['/book/index.php','/chat/index.php','/forum/forum.php?act=new&fid='+fid,topicURL,editURL,'/news/komm.php?id='+newsId,'/gallery/index.php?action=addfoto','/gallery/index.php?action=komm&gid=smile-test.gif','/board/add.php?id=987','/pages/privat.php?action=submit&uz=MotorTestAdmin','/pages/adminlist.php','/pages/profil.php','/pyramid/index.php'])await capture(path,'member');
pass('picker catalogues and explicit field markers in all public forms and comments');
// New guards must reject missing/incorrect/array tokens and malformed message fields without touching storage.
const guarded=[['/chat/add.php','chat.dat',{msg:message}],['/gallery/index.php?action=addkomm&gid=smile-test.gif','datagallery/smile-test.gif.dat',{msg:message}],['/board/add.php?action=add&id=987','databoard/987.dat',{zag:'Проверка защиты',msg:message,days:'3'}],['/pyramid/go.php',null,{msg:message,icq:'123456'}],['/gallery/index.php?action=add','datagallery/fotobase.dat',{name:'Проверка защиты',msg:message}]];
for(const [url,path,body]of guarded){
 const file=path?'/www/local/'+path:'/www/pyramid/msg.dat',before=php.readFileAsBuffer(file);
 for(const tokenData of [{},{uid:'wrong'},{'uid[0]':uid}]){assert.equal((await req(url,{...body,...tokenData})).httpStatusCode,403,url);assert.deepEqual(php.readFileAsBuffer(file),before);}
 const bad={...body,uid,'msg[0]':'array'};delete bad.msg;assert.equal((await req(url,bad)).httpStatusCode,400,url);assert.deepEqual(php.readFileAsBuffer(file),before);
}
assert.match(uid,/^[a-f0-9]{64}$/);pass('CSRF, array input rejection, strong session tokens and unchanged records after rejected requests');
// Stored XSS attempts stay inert through message save and smile rendering.
const attack='Тест <img src=x onerror="alert(1)"> </textarea><script>alert(2)</script> :hello';
assert.equal((await req('/chat/add.php',{uid,msg:attack})).httpStatusCode,302);r=await req('/chat/index.php');
assert.ok(r.text.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));assert.ok(!r.text.includes('<script>alert(2)</script>'));assert.ok(!r.text.includes('<img src=x onerror='));
pass('stored HTML/script payload remains escaped after save and display');
// Administrative editing and forms must keep existing privileges.
await req('/input.php?action=exit');await req('/input.php',{login:'MotorTestAdmin',pass:password});uid=await token();
for(const path of ['/mpanel/news.php?action=addnews','/mpanel/news.php?action=editnews&id='+newsIndex,'/mpanel/forum.php?act=topic&fid='+fid+'&id='+topic,adminEdit,'/mpanel/book.php?action=edit&id='+bookId,'/mpanel/book.php?action=otvet&id='+bookId,'/mpanel/chat.php?action=edit&id='+(lines('chat.dat').length-1),'/mpanel/gallery.php?action=edit&id=0','/mpanel/adminchat.php','/mpanel/users.php?action=edit&users=SmileAuthor','/mpanel/votes.php?action=new'])await capture(path,'admin');
// Populate full poll shape so its existing edit form has every optional answer.
php.writeFile('/www/local/datavotes/votes.dat',[message,...Array.from({length:10},(_,i)=>'Ответ '+i),''].join('|'));await capture('/mpanel/votes.php','admin',11);
// A banned member can still compose the permitted appeal, with a token.
let banned=php.readFileAsText('/www/local/profil/SmileAuthor.prof').split(':||:');banned[37]='1';banned[38]=String(stamp+86400);banned[39]='Тест';banned[63]='MotorTestAdmin';banned[73]='1';php.writeFile('/www/local/profil/SmileAuthor.prof',banned.join(':||:'));
config=php.readFileAsText('/www/local/config.dat').split('|');
// Locate the setting index from source rather than depending on an undocumented number.
const banIndex=readFileSync(join(root,'includes/start.php'),'utf8').match(/\$config\['addbansend'\] = \$con_data\[(\d+)\]/)[1];config[Number(banIndex)]='1';php.writeFile('/www/local/config.dat',config.join('|'));
await req('/input.php?action=exit');await req('/input.php',{login:'SmileAuthor',pass:password});r=await capture('/pages/ban.php','member');uid=r.text.match(/name="uid" value="([^"]+)"/)[1];
assert.equal((await req('/pages/ban.php?action=send',{msg:message})).httpStatusCode,403);assert.equal((await req('/pages/ban.php?action=send',{uid,msg:message})).httpStatusCode,302);
pass('admin create/edit forms, poll fields, and the permitted ban-appeal form');
banned=php.readFileAsText('/www/local/profil/SmileAuthor.prof').split(':||:');banned[37]='0';banned[38]='0';php.writeFile('/www/local/profil/SmileAuthor.prof',banned.join(':||:'));
await req('/input.php?action=exit');
// Guestbook stays usable for guests when the owner's existing setting permits it.
config=php.readFileAsText('/www/local/config.dat').split('|');const guestIndex=readFileSync(join(root,'includes/start.php'),'utf8').match(/\$config\['bookadds'\] = \$con_data\[(\d+)\]/)[1];config[Number(guestIndex)]='1';php.writeFile('/www/local/config.dat',config.join('|'));
await capture('/book/index.php','guest');
r=await req('/news/komm.php?id='+newsId);assert.ok(!r.text.includes('id="motor-smile-data"'));assert.ok(!r.text.includes('data-smile-picker'));
for(const path of ['/mpanel/news.php?action=addnews','/mpanel/adminchat.php']){r=await req(path);assert.ok(!r.text.includes('id="motor-smile-data"'));assert.ok(!r.text.includes('data-smile-picker'));}
r=await req('/pages/smiles.php');assert.ok(r.text.includes('data-smile-copy=":'));writeFileSync(new URL('catalog.html',fixturesDir),r.text);fixtures.push({url:'/pages/smiles.php',role:'guest',file:'catalog.html',fields:0});
pass('guest access, no admin catalogue leakage, and clickable standalone smile catalogue');
// File editors and passwords never become smile controls.
const raw=readFileSync(join(root,'mpanel/files.php'),'utf8');assert.ok(!raw.includes('data-smile-picker'));
writeFileSync(new URL('manifest.json',fixturesDir),JSON.stringify(fixtures,null,2));
writeFileSync(new URL('./picker-backend-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,fixtures:fixtures.length,passed,fields:JSON.parse(readFileSync(new URL('./field-map.json',import.meta.url)))},null,2));console.log(JSON.stringify({requests,fixtures:fixtures.length,groups:passed.length}));
}finally{php.exit()}
