import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const dir=new URL('./homepage-fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});
let requests=0,uid='',logged=false;const passed=[],pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
 copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false',memory_limit:'256M'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body,headers={},method){
  php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
  if(body&&typeof body==='object'){
   const boundary='Home'+randomBytes(8).toString('hex'),parts=[];
   for(const[k,v]of Object.entries(body))parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+String(v)+'\r\n'));
   parts.push(Buffer.from('--'+boundary+'--\r\n'));body=new Uint8Array(Buffer.concat(parts));headers={...headers,'content-type':'multipart/form-data; boundary='+boundary};
  }
  const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
 }
 async function run(code){const r=await php.run({code:'<?php '+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);return r.text;}
 const helper="define('BASEDIR','/www/');define('DATADIR','/www/local/');define('SITETIME',time());require '/www/includes/functions.php';require '/www/includes/home-content.php';";
 const pure=async code=>JSON.parse(await run(helper+code));
 const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'HomeAdmin',password,password2:password,oemails:'home@example.test',osite:'https://motor.test'});
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,34])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
 const template=php.readFileAsText('/www/local/profil/HomeAdmin.prof').split(':||:');
 for(const[name,role]of [['HomeMember',0],['HomeCoAdmin',102],['HomeMod',103],['HomePhoto',105]]){const p=[...template];p[0]=name;p[7]=String(role);p[6]='1';p[25]='1';p[37]='0';p[46]='0';php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
 async function token(){return (await req('/pages/themes.php')).text.match(/name="uid" value="([^"]+)"/)[1];}
 async function login(name){if(logged){await req('/input.php?action=exit',{uid});logged=false;}uid=await token();if(name){assert.equal((await req('/input.php',{login:name,pass:password})).httpStatusCode,302);logged=true;uid=await token();}}
 const now=+(await run('echo time();')),at=i=>now-1000+i*20,stamp=i=>String(at(i));
 const write=(p,s)=>php.writeFile('/www/local/'+p,s),news=[],photos=[],topics=[],ads=[],chat=[],book=[];
 const forumParent='f'.repeat(31)+'6',boardParent='b'.repeat(31)+'2';
 for(const i of [2,6,1,5,3,4]){
  news.push(`Новость ${i}|Городская новость ${i} [b]подробности[/b]||${at(i)}|HomeMember|${i}|`);
  photos.push(`Подпись ${i}|Фото ${i}|HomeMember||${at(i)}|0|city${i}.gif|`);php.writeFile('/www/local/datagallery/city'+i+'.gif',readFileSync(join(root,'images/avators/1.gif')));
  topics.push(`${i}|1|HomeMember|Тема ${i}|${at(i)}|0|0|`);write(`dataforum/1-${i}.dat`,`${i}|1|HomeMember|Сообщение|Browser, PRIVATE-IP|${at(i)}|${i===6?forumParent:''}|\n`);
  ads.push(`Объявление ${i}|HomeMember|Текст объявления ${i}|${at(i)}|${now+86400}|${i}|1|${i===2?boardParent:''}|`);
  chat.push(`Чат ${i}|HomeMember|0|${at(i)}|SECRET-BROWSER|SECRET-IP||||${String(i).padStart(32,'0')}|`);
  book.push(`Гостевая ${i}|HomeMember|0|${at(i)}|SECRET-BROWSER|SECRET-IP|||`);
 }
 write('news.dat',news.join('\n')+'\n');write('datakomm/6.dat','one\ntwo\n');
 write('datagallery/fotobase.dat',photos.join('\n')+`\nНевидимое|Скрытое фото|HomeMember|hidden|${at(7)}|0|hidden.gif|\n`);php.writeFile('/www/local/datagallery/hidden.gif',readFileSync(join(root,'images/avators/1.gif')));
 write('dataforum/mainforum.dat','1|Город|0|0|\n');write('dataforum/topic1.dat',topics.join('\n')+'\n');write('databoard/database.dat','Городские объявления|Описание|1|\n');write('databoard/1.dat',ads.join('\n')+`\nПросроченное|HomeMember|Нельзя показывать|${at(7)}|${now-1}|7|1||\n`);write('chat.dat',chat.join('\n')+'\n');write('book.dat',book.join('\n')+'\n');
 const mediaFiles={};
 async function seedMedia(kind,parent,context){
  const dir='/www/local/attachments/'+kind+'/'+parent;await run('mkdir('+JSON.stringify(dir)+',0700,true);');
  const files=[];
  for(const [type,ext,mime,bytes]of [['photo','gif','image/gif',readFileSync(join(root,'images/avators/1.gif'))],['video','mp4','video/mp4',readFileSync(new URL('./sample.mp4',import.meta.url))]]){
   const id=(type==='photo'?'1':'2').repeat(32);files.push({id,name:type==='photo'?'Фото &quot; <img onerror=bad> .gif':'Видео.mp4',kind:type,ext,mime,size:bytes.length});php.writeFile(dir+'/'+id+'.blob',bytes);
  }
  // Extra photos/documents must not inflate the number of homepage cards/previews.
  const extra={...files[0],id:'3'.repeat(32)};files.push(extra);php.writeFile(dir+'/'+extra.id+'.blob',readFileSync(join(root,'images/avators/1.gif')));
  const manifest={context,files};write('attachments/'+kind+'/'+parent+'/manifest.json',JSON.stringify(manifest));mediaFiles[kind]={parent,manifest};
 }
 await seedMedia('news','6',[]);await seedMedia('forum',forumParent,{fid:1,topic:6});await seedMedia('board',boardParent,{category:1,bid:2});
 const sourcePaths=['news.dat','datagallery/fotobase.dat','dataforum/mainforum.dat','dataforum/topic1.dat','databoard/1.dat','chat.dat','book.dat'];const sources=Object.fromEntries(sourcePaths.map(p=>[p,php.readFileAsText('/www/local/'+p)]));
 const keys=['news','gallery','forum','board','chat','book'],admin='/mpanel/home-settings.php';
 const block=(html,key)=>html.match(new RegExp('<section class="home-block" data-home-block="'+key+'"[\\s\\S]*?</section>'))?.[0]||'';
 const recordIds=html=>[...html.matchAll(/data-home-record="([^"]+)"/g)].map(x=>x[1]);
 let r=await req('/index.php');assert.equal(r.httpStatusCode,200);assert.deepEqual([...r.text.matchAll(/data-home-block="([^"]+)"/g)].map(x=>x[1]),keys);
 for(const key of keys)assert.equal(recordIds(block(r.text,key)).length,key==='board'?0:3,key);
 assert.deepEqual(recordIds(block(r.text,'news')),['6','5','4'].map(i=>i+':'+at(+i)));assert.ok(block(r.text,'news').includes('Комментарии (2)'));
 assert.ok(!r.text.includes('Скрытое фото')&&!r.text.includes('Просроченное')&&!r.text.includes('SECRET-IP')&&!r.text.includes('SECRET-BROWSER'));
 assert.ok(!r.text.includes('Новости сайта'));assert.ok(!(await req('/news/index.php')).text.includes('Новости сайта'));assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 writeFileSync(new URL('default-home.html',dir),r.text);
 pass('six default blocks, three latest records by timestamp, four manually selected ads, public-only photos, no IP/browser leakage and synchronized comment links');
 for(const name of [null,'HomeMember','HomeMod','HomePhoto']){await login(name);assert.equal((await req(admin)).httpStatusCode,403);assert.equal((await req(admin,{uid,operation:'settings',version:'0'.repeat(64)})).httpStatusCode,403);}
 await login('HomeCoAdmin');assert.equal((await req(admin)).httpStatusCode,200);assert.ok((await req('/mpanel/index.php')).text.includes('home-settings.php'));
 await login('HomeAdmin');assert.ok(!(await req('/mpanel/headlines.php')).text.includes('Новости сайта'));
 const state=()=>pure('echo json_encode(motor_home_settings());'),version=async()=>pure('echo json_encode(motor_home_version(motor_home_settings()));');
 async function form(){const s=await state(),f={uid,version:await version(),operation:'settings',gallery_width:String(s.gallery_size.width),gallery_height:String(s.gallery_size.height)};s.order.forEach((k,i)=>{f['position_'+k]=String(i+1);f['count_'+k]=String(s.blocks[k].count);f['mode_'+k]=s.blocks[k].mode;f['photos_'+k]=s.blocks[k].photos?'1':'0';f['videos_'+k]=s.blocks[k].videos?'1':'0';s.blocks[k].selected.forEach((v,n)=>f['rank_'+k+'_'+n]=String(n+1));});return f;}
 async function select(k,id,expected=303){const r=await req(admin+'?block='+k,{uid,version:await version(),operation:'select',block:k,record:id});assert.equal(r.httpStatusCode,expected,r.text.match(/role="alert">([^<]+)/)?.[1]);return r;}
 let f=await form();assert.equal((await req(admin,{...f,uid:'invalid'})).httpStatusCode,403);assert.equal((await req(admin,f,{Origin:'https://other.test'})).httpStatusCode,403);
 for(const [key,value]of [['count_news','-1'],['count_news','21'],['count_news','1.5'],['count_news','1e1'],['mode_news','unsafe'],['position_gallery','1'],['position_news','7']])assert.equal((await req(admin,{...f,[key]:value})).httpStatusCode,400,key);
 assert.equal((await req(admin,{...f,'count_news[]':'3'})).httpStatusCode,400);assert.equal((await req(admin,undefined,{},'PUT')).httpStatusCode,405);
 assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 assert.equal((await req(admin+'?operation=select&block=board&record=1')).httpStatusCode,200);assert.equal(php.fileExists('/www/local/home-settings.json'),false);
 await select('board','../news.dat',409);await select('board','1-7:'+at(7),409);await select('gallery','hidden.gif:'+at(7),409);
 pass('only administrators 101/102 may curate; CSRF, Origin, method, scalar/type/range/mode/order and hidden/expired record validation');
 const originalVersion=await version();
 for(const i of [2,5,1,4])await select('board','1-'+i+':'+at(i));
 let s=await state();assert.equal(s.blocks.board.mode,'selected');assert.equal(s.blocks.board.selected.length,4);
 r=await req('/index.php');assert.deepEqual(recordIds(block(r.text,'board')),[2,5,1,4].map(i=>'1-'+i+':'+at(i)));writeFileSync(new URL('full-home.html',dir),r.text);
 const sameVersion=await version();await select('board','1-2:'+at(2));assert.equal(await version(),sameVersion);
 assert.equal((await req(admin,{...await form(),version:originalVersion})).httpStatusCode,409);
 f=await form();f.rank_board_0='4';f.rank_board_1='3';f.rank_board_2='2';f.rank_board_3='1';f.count_board='3';f.count_gallery='0';f.mode_news='oldest';keys.forEach((k,i)=>f['position_'+k]=String(6-i));
 const beforeSave=await version();assert.equal((await req(admin,f)).httpStatusCode,303);assert.notEqual(await version(),beforeSave);
 r=await req('/index.php');assert.deepEqual([...r.text.matchAll(/data-home-block="([^"]+)"/g)].map(x=>x[1]),[...keys].reverse().filter(k=>k!=='gallery'));
 assert.deepEqual(recordIds(block(r.text,'board')),[4,1,5].map(i=>'1-'+i+':'+at(i)));assert.deepEqual(recordIds(block(r.text,'news')),[1,2,3].map(i=>i+':'+at(i)));
 assert.equal((await state()).blocks.board.selected.length,4);
 f=await form();f.count_gallery='3';f.count_board='4';f.mode_news='latest';keys.forEach((k,i)=>f['position_'+k]=String(i+1));assert.equal((await req(admin,f)).httpStatusCode,303);
 const priorSettings=php.readFileAsText('/www/local/home-settings.json');await req('/index.php');await req('/index.php',undefined,{},'HEAD');await req(admin);await req(admin,undefined,{},'HEAD');assert.equal(php.readFileAsText('/www/local/home-settings.json'),priorSettings);
 for(const p of sourcePaths)assert.equal(php.readFileAsText('/www/local/'+p),sources[p],p);
 pass('manual selection, idempotent duplicate add, stale forms, per-record and block order, limits/hidden blocks and read-only content/settings on GET/HEAD');
 for(const k of keys.filter(k=>k!=='board')){const cat=await pure('echo json_encode(motor_home_catalog('+JSON.stringify(k)+'));');await select(k,cat[2].id);}
 r=await req('/index.php');for(const k of keys.filter(k=>k!=='board'))assert.equal(recordIds(block(r.text,k)).length,1,k);
 s=await state();const selectedNews=s.blocks.news.selected[0],target=selectedNews.split(':')[0];
 write('news.dat',news.filter(l=>l.split('|')[5]!==target).join('\n')+`\nДругая новость|Новый текст||${at(8)}|HomeMember|${target}|\n`);
 r=await req('/index.php');assert.equal(recordIds(block(r.text,'news')).length,0);assert.ok(!block(r.text,'news').includes('Другая новость'));write('news.dat',sources['news.dat']);
 write('databoard/1.dat',ads.map(l=>l.startsWith('Объявление 4|')?l.replace(String(now+86400),String(now-1)):l).join('\n'));r=await req('/index.php');assert.equal(recordIds(block(r.text,'board')).length,3);write('databoard/1.dat',sources['databoard/1.dat']);
 const selectedPhoto=s.blocks.gallery.selected[0].split(':')[0];write('datagallery/fotobase.dat',sources['datagallery/fotobase.dat'].split('\n').map(l=>l.includes('|'+selectedPhoto+'|')?l.replace('|HomeMember||','|HomeMember|hidden|'):l).join('\n'));assert.equal(recordIds(block((await req('/index.php')).text,'gallery')).length,0);write('datagallery/fotobase.dat',sources['datagallery/fotobase.dat']);
 const selectedBook=s.blocks.book.selected[0];write('book.dat',book.filter(l=>'h:'+createHash('sha256').update(l).digest('hex')!==selectedBook).join('\n'));assert.equal(recordIds(block((await req('/index.php')).text,'book')).length,0);write('book.dat',sources['book.dat']);
 pass('all six sources support selection; deletion, reused numeric IDs, hidden photos, expired ads and trimmed messages never substitute other records');
 f=await form();f.remove_news_0='1';assert.equal((await req(admin,f)).httpStatusCode,303);assert.deepEqual((await state()).blocks.news.selected,[]);
 f=await form();for(const k of keys)if(k!=='board')f['mode_'+k]='latest';assert.equal((await req(admin,f)).httpStatusCode,303);
 const malicious=`<img src=x onerror=alert(1)> &quot; [url=javascript:bad]опасное[/url]`;
 write('news.dat',sources['news.dat']+`${malicious}|${malicious}||${at(8)}|&lt;svg onload=alert(2)&gt;|88|\n`);
 r=await req('/index.php');assert.ok(!r.text.includes('<img src=x')&&!r.text.includes('<svg onload')&&!r.text.includes('href="javascript:'));write('news.dat',sources['news.dat']);
 r=await req(admin+'?block=board&q='+encodeURIComponent('<img src=x onerror=alert(1)>'));assert.ok(!r.text.includes('<img src=x'));assert.match(r.text,/&lt;img/);
 r=await req(admin+'?block=board&q='+encodeURIComponent('Объявление 5'));assert.equal((r.text.match(/class="home-picker-row"/g)||[]).length,1);assert.ok(r.text.includes('Объявление 5'));
 assert.equal((await req(admin+'?block[]=board')).httpStatusCode,302);
 write('book.dat',sources['book.dat']+Array.from({length:24},(_,i)=>`Поиск ${i}|HomeMember|0|${at(10+i)}|B|I|||`).join('\n')+'\n');
 r=await req(admin+'?block=book&page=2');assert.equal((r.text.match(/class="home-picker-row"/g)||[]).length,10);write('book.dat',sources['book.dat']);
 const custom=php.readFileAsText('/www/local/datamain/index.dat');write('datamain/index.dat','<p>Моя особая главная</p><a href="news/">Новости сайта</a>');r=await req('/index.php');assert.match(r.text,/Моя особая главная/);assert.ok(!r.text.includes('Новости сайта'));assert.equal(recordIds(block(r.text,'chat')).length,3);write('datamain/index.dat',custom);
 pass('search and pagination, escaped hostile content/query/author, accessible local links and preserved customized homepage with normalized news label');
 const raw=php.readFileAsText('/www/local/home-settings.json');write('home-settings.json','broken');assert.equal((await req(admin)).httpStatusCode,503);r=await req('/index.php');assert.match(r.text,/Лента главной страницы временно недоступна/);assert.equal(recordIds(r.text).length,0);write('home-settings.json',raw);
 await run("rename('/www/local/home-settings.json','/tmp/home-original');file_put_contents('/tmp/outside','unchanged');symlink('/tmp/outside','/www/local/home-settings.json');");assert.equal((await req(admin)).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/outside'),'unchanged');await run("unlink('/www/local/home-settings.json');rename('/tmp/home-original','/www/local/home-settings.json');");
 f=await form();await run("unlink('/www/local/home-settings.lock');symlink('/tmp/outside','/www/local/home-settings.lock');");assert.equal((await req(admin,f)).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/outside'),'unchanged');await run("unlink('/www/local/home-settings.lock');");
 await run("rename('/www/local/news.dat','/tmp/news-original');symlink('/tmp/outside','/www/local/news.dat');");assert.deepEqual(await pure('echo json_encode(motor_home_catalog("news"));'),[]);await run("unlink('/www/local/news.dat');rename('/tmp/news-original','/www/local/news.dat');");
 await run("rename('/www/local/databoard','/tmp/board-original');symlink('/tmp/board-original','/www/local/databoard');");assert.deepEqual(await pure('echo json_encode(motor_home_catalog("board"));'),[]);await run("unlink('/www/local/databoard');rename('/tmp/board-original','/www/local/databoard');");
 assert.equal(php.readFileAsText('/www/local/home-settings.json'),raw);
 pass('corrupt settings fail closed; settings/data/lock and parent symlinks cannot read external content or overwrite files');
 // Media switches and dimensions preserve old settings and all shared activity counters.
 const counters=()=>JSON.stringify(['HomeAdmin','HomeMember'].map(name=>{const p=php.readFileAsText('/www/local/profil/'+name+'.prof').split(':||:');return [6,33,36,41,96,97,98,99].map(i=>p[i]);}));
 const beforeMediaCounters=counters(),beforeMediaSettings=await state();
 const legacy=structuredClone(beforeMediaSettings);delete legacy.gallery_size;for(const b of Object.values(legacy.blocks)){delete b.photos;delete b.videos;}
 const legacyRaw=JSON.stringify(legacy);write('home-settings.json',legacyRaw);s=await state();assert.deepEqual(s.gallery_size,{width:120,height:128});assert.ok(Object.values(s.blocks).every(b=>b.photos&&b.videos));assert.equal(php.readFileAsText('/www/local/home-settings.json'),legacyRaw);
 const legacyVersion=createHash('sha256').update(legacyRaw).digest('hex');assert.equal((await req(admin,{...await form(),version:legacyVersion})).httpStatusCode,409);
 f=await form();
 for(const [key,value]of [['gallery_width','79'],['gallery_width','481'],['gallery_height','0'],['gallery_height','128.5'],['gallery_width','1e2'],['photos_news','yes'],['videos_board','2'],['photos_chat','-1']])assert.equal((await req(admin,{...f,[key]:value})).httpStatusCode,400,key);
 for(const key of ['photos_news','videos_forum','gallery_width','gallery_height']){const invalid={...f};delete invalid[key];invalid[key+'[]']='120';assert.equal((await req(admin,invalid)).httpStatusCode,400,key);}
 assert.equal(php.readFileAsText('/www/local/home-settings.json'),legacyRaw);
 for(const value of [null,'120',79,481]){const bad=structuredClone(s);bad.gallery_size.width=value;write('home-settings.json',JSON.stringify(bad));assert.equal((await req(admin)).httpStatusCode,503);}
 for(const value of [null,'1',1,[]]){const bad=structuredClone(s);bad.blocks.news.photos=value;write('home-settings.json',JSON.stringify(bad));assert.equal((await req(admin)).httpStatusCode,503);}
 write('home-settings.json',legacyRaw);
 const mediaCounts=html=>({photo:(html.match(/class="home-photo"/g)||[]).length,video:(html.match(/<video /g)||[]).length});
 for(const kind of keys)for(const [photos,videos]of [[false,false],[true,false],[false,true],[true,true]]){
  f=await form();f['photos_'+kind]=photos?'1':'0';f['videos_'+kind]=videos?'1':'0';f.gallery_width='160';f.gallery_height='144';assert.equal((await req(admin,f)).httpStatusCode,303);
  r=await req('/index.php');const html=block(r.text,kind),n=mediaCounts(html);
  assert.equal(n.photo,photos?(kind==='gallery'?3:['news','forum','board'].includes(kind)?1:0):0,kind);
  assert.equal(n.video,videos&&['news','forum'].includes(kind)?1:0,kind);
  if(kind==='gallery'){assert.ok(!html.includes('<h')&&!html.includes('Комментарии')&&!html.includes('home-meta')&&!html.includes('home-excerpt'));assert.equal(!!html,photos);if(photos){assert.ok(html.includes('--home-gallery-width:160px'));assert.ok(html.includes('--home-gallery-height:144px'));}}
  else assert.equal(recordIds(html).length,kind==='board'?4:3);
  assert.ok(!html.includes('autoplay'));assert.ok(!html.includes('<img onerror=bad>'));
  if(kind!=='news'){assert.equal(mediaCounts(block(r.text,'news')).video,1);assert.ok(block(r.text,'news').includes('Комментарии (2)'));}
  if(kind==='news'&&photos&&!videos)writeFileSync(new URL('photos-only-home.html',dir),r.text);
 }
 // Both size bounds render without bypassing the saved ordering/curation.
 for(const size of [80,480]){f=await form();f.gallery_width=String(size);f.gallery_height=String(size);assert.equal((await req(admin,f)).httpStatusCode,303);writeFileSync(new URL('gallery-'+size+'.html',dir),(await req('/index.php')).text);}
 f=await form();f.gallery_width='120';f.gallery_height='128';assert.equal((await req(admin,f)).httpStatusCode,303);
 f=await form();for(const key of keys){f['photos_'+key]='0';f['videos_'+key]='0';}assert.equal((await req(admin,f)).httpStatusCode,303);writeFileSync(new URL('no-media-home.html',dir),(await req('/index.php')).text);
 f=await form();for(const key of keys){f['photos_'+key]='1';f['videos_'+key]='1';}assert.equal((await req(admin,f)).httpStatusCode,303);
 const settingsMedia=await state();await select('board','1-2:'+at(2));assert.deepEqual(await state(),settingsMedia);
 assert.deepEqual(settingsMedia.blocks.board.selected,beforeMediaSettings.blocks.board.selected);
 pass('legacy JSON reads without migration writes; all six independent photo/video switch combinations, strict size/type bounds, photo-only gallery, stable selections and comment counts');
 // Invalid, mismatched, missing or symlinked manifests/blobs fail closed without breaking HTML.
 const manifestPath='attachments/news/6/manifest.json',goodManifest=JSON.stringify(mediaFiles.news.manifest);
 for(const bad of ['broken','null',JSON.stringify({files:'wrong'}),JSON.stringify({files:Array(101).fill({})}),'x'.repeat(1048577)]){write(manifestPath,bad);r=await req('/index.php');assert.equal(r.httpStatusCode,200);assert.deepEqual(mediaCounts(block(r.text,'news')),{photo:0,video:0});}
 const badFile={...mediaFiles.news.manifest.files[0],id:'../outside',name:'" onerror="bad',mime:'image/gif\r\nX-Bad: yes'};write(manifestPath,JSON.stringify({files:[badFile]}));assert.equal(mediaCounts(block((await req('/index.php')).text,'news')).photo,0);write(manifestPath,goodManifest);
 const boardManifest='attachments/board/'+boardParent+'/manifest.json';write(boardManifest,JSON.stringify({...mediaFiles.board.manifest,context:{category:1,bid:6}}));assert.equal(mediaCounts(block((await req('/index.php')).text,'board')).photo,0);write(boardManifest,JSON.stringify(mediaFiles.board.manifest));
 const forumManifest='attachments/forum/'+forumParent+'/manifest.json';write(forumManifest,JSON.stringify({...mediaFiles.forum.manifest,context:{fid:1,topic:5}}));assert.deepEqual(mediaCounts(block((await req('/index.php')).text,'forum')),{photo:0,video:0});write(forumManifest,JSON.stringify(mediaFiles.forum.manifest));
 await run("rename('/www/local/attachments/news/6','/tmp/home-news-media');symlink('/tmp/home-news-media','/www/local/attachments/news/6');");assert.deepEqual(mediaCounts(block((await req('/index.php')).text,'news')),{photo:0,video:0});await run("unlink('/www/local/attachments/news/6');rename('/tmp/home-news-media','/www/local/attachments/news/6');");
 const mediaUrl=(kind,file)=>'/attachment.php?section='+kind+'&parent='+mediaFiles[kind].parent+'&file='+file.id;
 r=await req(mediaUrl('news',mediaFiles.news.manifest.files[0]));assert.equal(r.httpStatusCode,200);assert.deepEqual(Buffer.from(r.bytes),readFileSync(join(root,'images/avators/1.gif')));
 r=await req(mediaUrl('news',mediaFiles.news.manifest.files[1]),undefined,{range:'bytes=0-15'});assert.equal(r.httpStatusCode,206);assert.deepEqual(Buffer.from(r.bytes),readFileSync(new URL('./sample.mp4',import.meta.url)).subarray(0,16));
 r=await req(mediaUrl('board',mediaFiles.board.manifest.files[0])+'&preview=1');assert.equal(r.httpStatusCode,200);assert.equal(r.headers['content-type'][0],'image/jpeg');
 r=await req(mediaUrl('forum',mediaFiles.forum.manifest.files[1]));assert.equal(r.httpStatusCode,200);
 const deleted=php.readFileAsText('/www/local/news.dat');write('news.dat',news.filter(l=>l.split('|')[5]!=='6').join('\n')+'\n');assert.equal(mediaCounts(block((await req('/index.php')).text,'news')).photo,0);assert.equal((await req(mediaUrl('news',mediaFiles.news.manifest.files[0]))).httpStatusCode,404);write('news.dat',deleted);
 assert.equal(counters(),beforeMediaCounters,'preview/settings requests must not award comments, points, coins or change reputation');
 for(const p of sourcePaths)assert.equal(php.readFileAsText('/www/local/'+p),sources[p],p);
 pass('bounded media reads, context/metadata validation, corrupt/missing/deleted media, symlink rejection, real photo/JPEG/video Range delivery and unchanged shared counters/source records');
 const backup=await req('/mpanel/backup.php?action=newbackup',{uid,files:'1'});assert.ok([200,302].includes(backup.httpStatusCode));
 assert.equal(await pure('$ok=false;foreach(glob(DATADIR."databackup/*.zip") as $p){$z=new ZipArchive();if($z->open($p)===true){for($i=0;$i<$z->numFiles;$i++)if(basename($z->getNameIndex($i))==="home-settings.json")$ok=$z->getFromIndex($i)===file_get_contents(DATADIR."home-settings.json");$z->close();}}echo json_encode($ok);'),true);
 for(const [file,url]of [['admin.html',admin],['picker.html',admin+'?block=board'],['full-home.html','/index.php']])writeFileSync(new URL(file,dir),(await req(url)).text);
 await login(null);writeFileSync(new URL('guest-home.html',dir),(await req('/index.php')).text);
 pass('homepage settings included in normal ZIP backup; guest/member/admin outputs verified without changing source records');
 writeFileSync(new URL('./homepage-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'homepage HTTP requests');
}finally{php.exit();}
