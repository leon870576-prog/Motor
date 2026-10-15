import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { File } from 'node:buffer';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
let config=php.readFileAsText('/www/local/config.dat').split('|');config[3]='0';config[29]='0';config[57]='0';php.writeFile('/www/local/config.dat',config.join('|'));
assert.equal((await req('/mpanel/attachments.php')).httpStatusCode,403);
await req('/input.php',{login:'MotorTestAdmin',pass:password});
let uid=await token();
let admin=await req('/mpanel/attachments.php');assert.ok(admin.text.includes('Настройки вложений'));
// Initialize defaults via the actual administrative form.
let defaults={uid};
for(const section of ['forum','news']){
 for(const [key,val]of Object.entries({count:5,photo_mb:8,video_mb:24,file_mb:8,image_px:8000,preview_px:640}))defaults[`${section}[${key}]`]=String(val);
 ['jpg','jpeg','png','gif','webp','mp4','webm','pdf','txt','csv','zip','docx','xlsx','pptx','odt','ods'].forEach((x,i)=>defaults[`${section}[formats][${i}]`]=x);
}
assert.equal((await req('/mpanel/attachments.php',defaults)).httpStatusCode,200);
let saved=php.readFileAsText('/www/local/attachment-settings.json');
assert.equal((await req('/mpanel/attachments.php',{...defaults,uid:'invalid'})).httpStatusCode,403);assert.equal(php.readFileAsText('/www/local/attachment-settings.json'),saved);
assert.equal((await req('/mpanel/attachments.php',{...defaults,'news[formats][0]':'php'})).httpStatusCode,400);assert.equal(php.readFileAsText('/www/local/attachment-settings.json'),saved);
pass('admin-only settings, CSRF, format allowlist and atomic validation');
const gif=readFileSync(join(root,'images/img/news.gif'));
const mp4=readFileSync(new URL('./sample.mp4',import.meta.url));
const webm=readFileSync(new URL('./sample.webm',import.meta.url));
const upload=(bytes,name)=>new File([bytes],name);
const newsBody=()=>({themes:'Проверка вложений',msg:'Новость с фото, видео и файлом','attachments[0]':upload(gif,'город.gif'),'attachments[1]':upload(mp4,'видео.mp4'),'attachments[2]':upload('Test document\n','памятка.txt')});
let r=await req('/mpanel/news.php?action=add&uid='+uid,newsBody());
if(r.httpStatusCode!==302)console.log(r.text.slice(-9000));assert.equal(r.httpStatusCode,302);
let newsRows=lines('news.dat'), newsIndex=newsRows.length-1, newsId=newsRows.at(-1).split('|')[5];
let news=manifest('news',newsId);assert.equal(news.files.length,3);
assert.ok(news.files.every(x=>!('tmp'in x)));
let publicNews=await req('/news/index.php');assert.ok(publicNews.text.includes('<video controls playsinline preload="none"'));assert.ok(publicNews.text.includes('город.gif'));assert.ok(publicNews.text.includes('attachment.php?'));
assert.ok((await req('/news/komm.php?id='+newsId)).text.includes('город.gif'));
let imageURL=url('news',newsId,news.files[0].id),videoURL=url('news',newsId,news.files[1].id),textURL=url('news',newsId,news.files[2].id);
r=await req(imageURL);assert.equal(r.httpStatusCode,200);assert.deepEqual(Buffer.from(r.bytes),gif);assert.equal(r.headers['content-type'][0],'image/gif');
r=await req(videoURL,undefined,{range:'bytes=0-15'});assert.equal(r.httpStatusCode,206);assert.deepEqual(Buffer.from(r.bytes),mp4.subarray(0,16));assert.equal(r.headers['content-range'][0],`bytes 0-15/${mp4.length}`);
r=await req(videoURL,undefined,{range:'bytes=-12'});assert.equal(r.httpStatusCode,206);assert.deepEqual(Buffer.from(r.bytes),mp4.subarray(-12));
assert.equal((await req(videoURL,undefined,{range:'bytes=999999-'})).httpStatusCode,416);
assert.equal((await req(videoURL,undefined,{range:'bytes=0-1,3-4'})).httpStatusCode,416);
r=await req(videoURL,undefined,{},'HEAD');assert.equal(r.bytes.length,0);assert.equal(Number(r.headers['content-length'][0]),mp4.length);
r=await req(textURL);assert.ok(r.headers['content-disposition'][0].startsWith('attachment;'));assert.ok(r.headers['content-disposition'][0].includes("filename*=UTF-8''"));
assert.equal((await req('/attachment.php?section=news&parent=999999&file='+news.files[0].id)).httpStatusCode,404);
assert.equal((await req('/attachment.php?section=forum&parent='+newsId+'&file='+news.files[0].id)).httpStatusCode,404);
pass('real multipart photos/video/documents; byte-exact downloads, Unicode names, video seek/HEAD/416');
// Reject invalid upload batches without creating a news record.
const before=php.readFileAsText('/www/local/news.dat');
for(const [name,bytes]of [['evil.php','<?php echo 1;'],['fake.gif','<?php echo 1;'],['fake.mp4','hello'],['fake.pdf','not a PDF'],['fake.docx','not a ZIP'],['empty.txt','']]){
 r=await req('/mpanel/news.php?action=add&uid='+uid,{themes:'Rejected file',msg:'Текст для отклонённой загрузки','attachments[0]':upload(bytes,name)});assert.equal(r.httpStatusCode,400,name);assert.equal(php.readFileAsText('/www/local/news.dat'),before,name);
}
const six={themes:'Too many files',msg:'Проверка количества'};for(let i=0;i<6;i++)six[`attachments[${i}]`]=upload(gif,`photo${i}.gif`);
assert.equal((await req('/mpanel/news.php?action=add&uid='+uid,six)).httpStatusCode,400);assert.equal(php.readFileAsText('/www/local/news.dat'),before);
pass('forbidden extension, forged MIME, empty/corrupt files and count limit reject the whole post');
// Edit removes a photo, retains video, adds WebM and changes text.
let edit=await req('/mpanel/news.php?action=editnews&id='+newsIndex);
let version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
r=await req('/mpanel/news.php?action=edit&id='+newsIndex+'&uid='+uid,{name:'Обновлённая новость',msg:'Изменённый текст новости',record_version:version,timer:'1',logins:'Attacker',komm:'999','remove_attachments[0]':news.files[0].id,'attachments[0]':upload(webm,'видео.webm')});
assert.equal(r.httpStatusCode,302);assert.equal((await req(imageURL)).httpStatusCode,404);assert.equal((await req(videoURL)).httpStatusCode,200);
assert.ok(!php.fileExists('/www/local/attachments/news/'+newsId+'/'+news.files[0].id+'.blob'));
assert.equal(lines('news.dat')[newsIndex].split('|')[4],'MotorTestAdmin');assert.equal(lines('news.dat')[newsIndex].split('|')[5],newsId);
news=manifest('news',newsId);assert.equal(news.files.length,3);
assert.ok((await req('/news/index.php')).text.includes('Обновлённая новость'));assert.ok((await req('/news/komm.php?id='+newsId)).text.includes('Изменённый текст новости'));
// Verify shared homepage renderer always uses current attachments.
r=await php.run({code:`<?php define('BASEDIR','/www/');define('DATADIR','/www/local/');define('SID','');define('SITETIME',time());require '/www/includes/functions.php';$config=['lastnews'=>1,'timeclocks'=>0];last_news();`});assert.equal(r.errors,'');assert.ok(r.text.includes('видео.webm'));assert.ok(!r.text.includes('город.gif'));
assert.equal((await req('/mpanel/news.php?action=edit&id='+newsIndex+'&uid='+uid,{name:'stale',msg:'stale message',record_version:version,timer:'1',logins:'MotorTestAdmin',komm:newsId})).httpStatusCode,409);
pass('news editing preserves IDs/author, updates all views, removes files, prevents stale overwrites');

// Dimension limits, failed replacement and an oversized whole request.
await settingsPost({news:{image_px:320}});
await php.run({code:"<?php $im=imagecreatetruecolor(400,10);imagepng($im,'/tmp/wide.png');"});
let oldNewsRecord=php.readFileAsText('/www/local/news.dat'),oldNewsManifest=JSON.stringify(manifest('news',newsId));
edit=await req('/mpanel/news.php?action=editnews&id='+newsIndex);version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
r=await req('/mpanel/news.php?action=edit&id='+newsIndex+'&uid='+uid,{name:'Must not change',msg:'Слишком широкое фото',record_version:version,timer:'1',logins:'MotorTestAdmin',komm:newsId,'remove_attachments[0]':news.files[0].id,'attachments[0]':upload(php.readFileAsBuffer('/tmp/wide.png'),'wide.png')});
assert.equal(r.httpStatusCode,400);assert.equal(php.readFileAsText('/www/local/news.dat'),oldNewsRecord);assert.equal(JSON.stringify(manifest('news',newsId)),oldNewsManifest);
php.chdir('/www/mpanel');
r=await php.run({code:"<?php $_SERVER['REQUEST_METHOD']='POST'; $_SERVER['CONTENT_LENGTH']='70000000'; require '/www/mpanel/news.php';",relativeUri:'/mpanel/news.php',$_SERVER:{HTTP_HOST:'motor.test',REMOTE_ADDR:'127.0.0.1'}});
assert.ok(r.text.includes('Общий размер отправки превышает'));assert.equal(php.readFileAsText('/www/local/news.dat'),oldNewsRecord);
await settingsPost({news:{image_px:8000}});
pass('image dimension limit, failed replacement rollback and oversized request handling');


// Exercise every advertised format using real image/ZIP containers.
r=await php.run({code:`<?php
$im=imagecreatetruecolor(16,16);imagejpeg($im,'/tmp/sample.jpg');imagepng($im,'/tmp/sample.png');imagewebp($im,'/tmp/sample.webp');
file_put_contents('/tmp/sample.pdf',"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");file_put_contents('/tmp/sample.csv',"name,value\ncity,1\n");
$entries=['zip'=>['readme.txt','hello'],'docx'=>['word/document.xml','<document/>'],'xlsx'=>['xl/workbook.xml','<workbook/>'],'pptx'=>['ppt/presentation.xml','<presentation/>'],'odt'=>['content.xml','<document/>'],'ods'=>['content.xml','<document/>']];
foreach($entries as $ext=>$entry){$z=new ZipArchive();$z->open('/tmp/sample.'.$ext,ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString($entry[0],$entry[1]);if($ext==='odt'||$ext==='ods')$z->addFromString('mimetype',$ext==='odt'?'application/vnd.oasis.opendocument.text':'application/vnd.oasis.opendocument.spreadsheet');$z->close();}
`});assert.equal(r.errors,'');
for(const ext of ['jpg','jpeg','png','webp','pdf','csv','zip','docx','xlsx','pptx','odt','ods']){
 const bytes=php.readFileAsBuffer('/tmp/sample.'+(ext==='jpeg'?'jpg':ext));
 r=await req('/mpanel/news.php?action=add&uid='+uid,{themes:'Формат '+ext,msg:'Проверка поддержки формата '+ext,'attachments[0]':upload(bytes,'sample.'+ext)});assert.equal(r.httpStatusCode,302,ext);
 const id=lines('news.dat').at(-1).split('|')[5],m=manifest('news',id);r=await req(url('news',id,m.files[0].id));assert.deepEqual(Buffer.from(r.bytes),Buffer.from(bytes),ext);
}
pass('all 16 advertised extensions accept valid files and download byte-for-byte unchanged');

// Separate section settings: file > 1MB denied in forum but allowed in news.
assert.equal((await settingsPost({forum:{count:2,file_mb:1,formats:['gif','mp4','webm','txt']},news:{count:5,file_mb:2}})).httpStatusCode,200);
assert.equal((await req('/mpanel/forum.php?act=addforum&uid='+uid,{title:'Тестовый форум'})).httpStatusCode,302);
const fid=lines('dataforum/mainforum.dat').at(-1).split('|')[0];
const large=upload('a'.repeat(1100000),'large.txt');
r=await req('/forum/forum.php?act=create&fid='+fid+'&uid='+uid,{fid,title:'Недопустимая тема',msg:'Сообщение с большим файлом','attachments[0]':large});assert.equal(r.httpStatusCode,400);assert.ok(!php.fileExists('/www/local/dataforum/topic'+fid+'.dat'));
r=await req('/mpanel/news.php?action=add&uid='+uid,{themes:'Допустимый файл',msg:'Размер допустим только в новостях','attachments[0]':upload('a'.repeat(1100000),'large.txt')});assert.equal(r.httpStatusCode,302);
pass('independent per-section size/count/formats; invalid uploads never create an empty forum topic');
// Create normal user only in this isolated filesystem, log in through the engine.
let profile=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:');profile[0]='MediaAuthor';profile[1]=createHash('md5').update(createHash('md5').update(password).digest('hex')).digest('hex');profile[7]='0';profile[6]='1';profile[25]='1';php.writeFile('/www/local/profil/MediaAuthor.prof',profile.join(':||:'));
await req('/input.php?action=exit');await req('/input.php',{login:'MediaAuthor',pass:password});uid=await token();
assert.equal((await req('/mpanel/attachments.php')).httpStatusCode,403);
r=await req('/forum/forum.php?act=create&fid='+fid+'&uid='+uid,{fid,title:'Тема с вложениями',msg:'Первое сообщение с фотографией','attachments[0]':upload(gif,'фото.gif')});if(r.httpStatusCode!==302)console.log(r.text.slice(-4000));assert.equal(r.httpStatusCode,302);
let topic=lines('dataforum/topic'+fid+'.dat').at(-1).split('|')[0],postPath='dataforum/'+fid+'-'+topic+'.dat';
let parent=lines(postPath)[0].split('|')[6];assert.match(parent,/^[a-f0-9]{32}$/);let fm=manifest('forum',parent);assert.equal(fm.files.length,1);
const forumImage=url('forum',parent,fm.files[0].id);
r=await req('/forum/topic.php?fid='+fid+'&id='+topic);assert.ok(r.text.includes('фото.gif'));assert.ok(r.text.includes('Редактировать сообщение и вложения'));assert.equal((await req('/forum/index.php')).httpStatusCode,200);assert.equal((await req('/forum/forum.php?fid='+fid)).httpStatusCode,200);
r=await req('/forum/topic.php?act=add&fid='+fid+'&id='+topic+'&uid='+uid,{msg:'Ответ с небольшим видео','attachments[0]':upload(mp4,'ответ.mp4')});assert.equal(r.httpStatusCode,302);
let rows=lines(postPath);assert.equal(rows.length,2);assert.notEqual(rows[0].split('|')[6],rows[1].split('|')[6]);
let replyParent=rows[1].split('|')[6],reply=manifest('forum',replyParent),replyURL=url('forum',replyParent,reply.files[0].id);
let editURL='/forum/edit.php?fid='+fid+'&id='+topic+'&post=0';edit=await req(editURL);version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
r=await req(editURL,{uid,record_version:version,msg:'Первое сообщение обновлено','remove_attachments[0]':fm.files[0].id,'attachments[0]':upload('Hello text','описание.txt')});assert.equal(r.httpStatusCode,302);assert.equal((await req(forumImage)).httpStatusCode,404);assert.equal((await req(replyURL)).httpStatusCode,200);assert.equal(lines(postPath)[0].split('|')[6],parent);
assert.equal((await req(editURL,{uid:'bad',record_version:version,msg:'Нельзя изменить'})).httpStatusCode,403);
pass('member creates topic/reply, edits own attachments; stable message IDs and rejected CSRF');
// Different member cannot edit or upload into another member's message.
profile[0]='OtherMember';php.writeFile('/www/local/profil/OtherMember.prof',profile.join(':||:'));
await req('/input.php?action=exit');await req('/input.php',{login:'OtherMember',pass:password});uid=await token();
const unchanged=php.readFileAsText('/www/local/'+postPath);assert.equal((await req(editURL)).httpStatusCode,403);assert.equal((await req(editURL,{uid,msg:'Чужое сообщение','attachments[0]':upload(gif,'other.gif')})).httpStatusCode,403);assert.equal(php.readFileAsText('/www/local/'+postPath),unchanged);
await req('/input.php?action=exit');assert.equal((await req('/mpanel/attachments.php')).httpStatusCode,403);assert.equal((await req(editURL)).httpStatusCode,403);assert.equal((await req(replyURL)).httpStatusCode,200);
config=php.readFileAsText('/www/local/config.dat').split('|');config[118]='1';php.writeFile('/www/local/config.dat',config.join('|'));assert.equal((await req(replyURL)).httpStatusCode,302);config[118]='0';php.writeFile('/www/local/config.dat',config.join('|'));
pass('guest/non-owner restrictions; media obeys public access and site closure');
// Admin edits legacy posts without ID and deletes earlier rows without breaking later attachments.
await req('/input.php',{login:'MotorTestAdmin',pass:password});uid=await token();
let adminEdit='/mpanel/forum.php?act=editpost&fid='+fid+'&id='+topic+'&post=1';edit=await req(adminEdit);version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
r=await req('/mpanel/forum.php?act=changepost&fid='+fid+'&id='+topic+'&post=1&uid='+uid,{author:'MediaAuthor',msg:'Ответ изменён модератором',record_version:version,'attachments[0]':upload('moderated','дополнение.txt')});assert.equal(r.httpStatusCode,302);assert.equal(manifest('forum',replyParent).files.length,2);
edit=await req(adminEdit);let fresh=edit.text.match(/name="record_version" value="([^"]+)"/)[1];assert.equal((await req('/mpanel/forum.php?act=changepost&fid='+fid+'&id='+topic+'&post=1&uid=bad',{author:'MediaAuthor',msg:'CSRF must fail',record_version:fresh})).httpStatusCode,403);
assert.equal((await req('/mpanel/forum.php?act=changepost&fid='+fid+'&id='+topic+'&post=1&uid=bad',{author:'MediaAuthor',msg:'CSRF must fail',record_version:version})).httpStatusCode,409); // stale version rejected first
r=await req('/mpanel/forum.php?act=delpost&fid='+fid+'&id='+topic+'&uid='+uid,{'del[0]':'0'});assert.equal(r.httpStatusCode,302);assert.ok(!php.fileExists('/www/local/attachments/forum/'+parent));assert.equal((await req(replyURL)).httpStatusCode,200);
// Append original Motor-format post (no UUID); editing upgrades only that row.
php.writeFile('/www/local/'+postPath,php.readFileAsText('/www/local/'+postPath)+`${topic}|${fid}|MediaAuthor|Старое сообщение без файлов|test|${Math.floor(Date.now()/1000)}|\r\n`);
edit=await req('/mpanel/forum.php?act=editpost&fid='+fid+'&id='+topic+'&post=1');version=edit.text.match(/name="record_version" value="([^"]+)"/)[1];
r=await req('/mpanel/forum.php?act=changepost&fid='+fid+'&id='+topic+'&post=1&uid='+uid,{author:'MediaAuthor',msg:'Старое сообщение с вложением',record_version:version,'attachments[0]':upload(gif,'old.gif')});assert.equal(r.httpStatusCode,302);assert.match(lines(postPath)[1].split('|')[6],/^[a-f0-9]{32}$/);
assert.equal((await req(replyURL)).httpStatusCode,200);
pass('moderator edit, old-record compatibility, deletion shifts rows without shifting attachments');
// Closing a topic stops member replies and edits, including uploads.
assert.equal((await req('/mpanel/forum.php?act=closedtopic&fid='+fid+'&id='+topic+'&uid='+uid)).httpStatusCode,302);
await req('/input.php?action=exit');await req('/input.php',{login:'MediaAuthor',pass:password});uid=await token();
assert.equal((await req('/forum/edit.php?fid='+fid+'&id='+topic+'&post=0')).httpStatusCode,403);
let beforeClosed=php.readFileAsText('/www/local/'+postPath);await req('/forum/topic.php?act=add&fid='+fid+'&id='+topic+'&uid='+uid,{msg:'Нельзя отвечать в закрытую тему','attachments[0]':upload(gif,'closed.gif')});assert.equal(php.readFileAsText('/www/local/'+postPath),beforeClosed);
await req('/input.php?action=exit');await req('/input.php',{login:'MotorTestAdmin',pass:password});uid=await token();
// All warm themes render the same media controls.
for(const skin of ['lesika_dvor','lesika_gazeta','lesika_gostinaya','lesika_solnce','lesika_vecher','lesika_albom','lesika_uyut']){
 await req('/pages/skin.php',{skins:skin,uid,return:'themes'});r=await req('/forum/topic.php?fid='+fid+'&id='+topic);assert.ok(r.text.includes('<body data-theme="'+skin+'">'));assert.ok(r.text.includes('<video controls playsinline'));assert.ok(r.text.includes('дополнение.txt'));
}
pass('closed-topic permissions and attachment rendering in all seven warm themes');

// Existing backup must include settings, manifests and binaries.
r=await req('/mpanel/backup.php?action=newbackup',{files:'1','dirarc[0]':'../local/attachments','dirarc[1]':'../local/dataforum'});assert.equal(r.httpStatusCode,302);
r=await php.run({code:"<?php $paths=glob('/www/local/databackup/*.zip');$z=new ZipArchive();$z->open(end($paths));$names=[];for($i=0;$i<$z->numFiles;$i++)$names[]=$z->getNameIndex($i);echo json_encode($names);$z->close();"});assert.equal(r.errors,'');
const archived=JSON.parse(r.text);assert.ok(archived.includes('attachment-settings.json'));assert.ok(archived.some(x=>x.includes('/manifest.json')));assert.ok(archived.some(x=>x.endsWith('.blob')));assert.ok(archived.includes('dataforum/'+fid+'-'+topic+'.dat'));
pass('backup contains attachment settings, manifests, binaries and forum records');
// Restore a missing uploaded binary from the existing engine's backup UI.
r=await php.run({code:"<?php $p=glob('/www/local/databackup/*.zip');echo basename(end($p));"});const backupName=r.text;
const restoreFile='/www/local/attachments/forum/'+replyParent+'/'+reply.files[0].id+'.blob';const restoreBytes=php.readFileAsBuffer(restoreFile);php.unlink(restoreFile);
r=await req('/mpanel/backup.php?action=unzip&filearc='+backupName+'&uid='+uid);assert.equal(r.httpStatusCode,302);assert.deepEqual(php.readFileAsBuffer(restoreFile),restoreBytes);assert.equal((await req(replyURL)).httpStatusCode,200);
pass('backup restore recovers a deleted attachment with its exact original bytes');


// Disabled additions do not destroy old files; delete the topic/news and verify cleanup.
await settingsPost({forum:{count:0}});
r=await req('/forum/topic.php?fid='+fid+'&id='+topic);assert.ok(r.text.includes('ответ.mp4'));assert.equal((await req(replyURL)).httpStatusCode,200);
const parents=lines(postPath).map(x=>x.split('|')[6]);
assert.equal((await req('/mpanel/forum.php?act=deltopic&fid='+fid+'&uid='+uid,{'del[0]':topic})).httpStatusCode,302);
assert.equal((await req(replyURL)).httpStatusCode,404);for(const p of parents)assert.ok(!php.fileExists('/www/local/attachments/forum/'+p));
assert.equal((await req('/mpanel/news.php?action=del&uid='+uid,{'del[0]':String(newsIndex)})).httpStatusCode,302);assert.equal((await req(videoURL)).httpStatusCode,404);assert.ok(!php.fileExists('/www/local/attachments/news/'+newsId));
pass('disabling future uploads keeps old media; topic/news deletion removes binaries and manifests');

// Automatic topic pruning and deleting the whole forum must also remove media.
await settingsPost({forum:{count:2}});config=php.readFileAsText('/www/local/config.dat').split('|');config[28]='1';php.writeFile('/www/local/config.dat',config.join('|'));
let previousParent='';
for(let n=0;n<2;n++){
 r=await req('/forum/forum.php?act=create&fid='+fid+'&uid='+uid,{fid,title:'Проверка автоочистки '+n,msg:'Сообщение с файлом для очистки','attachments[0]':upload(gif,'prune.gif')});assert.equal(r.httpStatusCode,302);
 const id=lines('dataforum/topic'+fid+'.dat').at(-1).split('|')[0],p=lines('dataforum/'+fid+'-'+id+'.dat')[0].split('|')[6];
 if(previousParent)assert.ok(!php.fileExists('/www/local/attachments/forum/'+previousParent));previousParent=p;
}
assert.equal((await req('/mpanel/forum.php?act=delforum&fid='+fid+'&uid='+uid)).httpStatusCode,302);assert.ok(!php.fileExists('/www/local/attachments/forum/'+previousParent));
pass('automatic old-topic pruning and whole-forum deletion clean up attachments');

// A missing parent record never exposes orphaned data.
const lastNews=lines('news.dat').at(-1).split('|')[5],lastManifest=manifest('news',lastNews),orphanURL=url('news',lastNews,lastManifest.files[0].id);
php.writeFile('/www/local/news.dat','');assert.equal((await req(orphanURL)).httpStatusCode,404);
pass('orphan access denied after parent removal');
writeFileSync(new URL('./results.json',import.meta.url),JSON.stringify({php:'8.4',requests,passed},null,2));
console.log('SUCCESS',requests,'HTTP requests,',passed.length,'functional groups');
} finally {php.exit()}
