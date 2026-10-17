import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site';
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const hash=x=>createHash('sha256').update(x).digest('hex'),nonce=()=>randomBytes(16).toString('hex');
let requests=0;const passed=[];const pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 if(url==='/input.php?action=exit' && !body){const form=await req('/pages/themes.php');const token=form.text.match(/name="uid" value="([^"]+)"/);assert.ok(token,'logout form token');body={uid:token[1]};}
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 if(body){body=new TextEncoder().encode(new URLSearchParams(body).toString());headers={...headers,'content-type':'application/x-www-form-urlencoded'};}
 const r=await handler.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
}
const ajax={'accept':'application/json'};
const text=r=>r.headers['content-encoding']?.[0]==='gzip'?gunzipSync(r.bytes).toString():r.text;
const packet=r=>{assert.equal(r.httpStatusCode,200,text(r));return JSON.parse(text(r));};
const local=p=>'/www/local/'+p,read=p=>php.readFileAsText(local(p)),write=(p,s)=>php.writeFile(local(p),s);
const rows=()=>read('chat.dat').trim().split(/\r?\n/).filter(Boolean);
const field=(r,name)=>{const m=r.text.match(new RegExp('name="'+name+'" value="([^"]+)"'));assert.ok(m,'missing field '+name);return m[1];};
const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');
await req('/INSTALL.php?action=install',{name:'ChatAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=read('config.dat').split('|');for(const n of [3,29,57,63,64,65])cfg[n]='0';write('config.dat',cfg.join('|'));
assert.equal((await req('/mpanel/chat-settings.php')).httpStatusCode,403);
assert.equal((await req('/chat/updates.php',{uid:'x'},ajax)).httpStatusCode,403);
await req('/input.php',{login:'ChatAdmin',pass:password});
let page=await req('/chat/index.php'),uid=field(page,'uid');
assert.ok(page.text.includes('data-enabled="1"'));assert.ok(page.text.includes('data-interval="3"'));assert.ok(page.text.includes('chat-settings.php'));assert.ok(page.text.includes('chat.js?v=chat2'));
let settings={auto_refresh:'1',refresh_seconds:'3',page_size:'10',history_limit:'100',bot_enabled:'1',joke_enabled:'0',quiz_enabled:'0',bot_greeting:'0',bot_mode:'conversation',context_seconds:'180',bot_cooldown:'0',joke_seconds:'300',quiz_seconds:'600',quiz_wait:'60',phrases:'мотоцикл; мотор => Есть любимая модель?\nc++ => Что пишешь на C++?'};
let settingPage=await req('/mpanel/chat-settings.php'),version=field(settingPage,'version');
assert.equal((await req('/mpanel/chat-settings.php',{...settings,version})).httpStatusCode,403);
for(const change of [{refresh_seconds:'1'},{page_size:'51'},{history_limit:'5001'},{bot_mode:'anything'},{phrases:'неверный формат'},{phrases:'a => '+ 'x'.repeat(601)},{refresh_seconds:undefined,'refresh_seconds[0]':'3'}]){
 const data={...settings,uid,version,...change};for(const k in data)if(data[k]===undefined)delete data[k];assert.equal((await req('/mpanel/chat-settings.php',data)).httpStatusCode,400);
}
assert.equal((await req('/mpanel/chat-settings.php',{...settings,version,uid})).httpStatusCode,302);
assert.equal((await req('/mpanel/chat-settings.php',{...settings,version,uid})).httpStatusCode,409);
assert.equal(JSON.parse(read('chat-settings.json')).custom_rules.length,2);
assert.ok((await req('/mpanel/index.php')).text.includes('chat-settings.php'));
const legacy=await req('/mpanel/setting.php?action=setthree');assert.ok(legacy.text.includes('chat-settings.php'));assert.ok(!legacy.text.includes('name="config63"'));
pass('admin settings, legacy links, bounds, custom phrases, CSRF and stale-save protection');
// Exercise the conversation independently of HTTP/session state.
let pure=await php.run({code:`<?php
define('BASEDIR','/');require '/www/includes/functions.php';require '/www/includes/nastya.php';
$s=json_decode(file_get_contents('/www/local/chat-settings.json'),true);$n=0;
function ok($v,$m){global $n;if(!$v)throw new Exception($m);$n++;}
foreach(motor_nastya_topics() as $key=>[$pattern,$answers]){if($pattern!=='')ok(preg_match('~(*UCP)'.$pattern.'~u','')!==false,'regex '.$key);ok(count($answers)>=3,'variants '.$key);}
$cases=['Настя, ты бот?'=>'identity','Настенька, как тебя зовут?'=>'name','Настюха, сколько тебе лет?'=>'age','Настя, откуда ты?'=>'location','Настя, привет'=>'greeting','Настя, устал сегодня'=>'tired','Настя, мне грустно'=>'sadness','Настя, слушаю радио'=>'music','Настя, смена закончилась'=>'work','Настя, кошка спит'=>'pets','Настя, который час?'=>'fallback','Настя, сменим тему'=>'fallback','Настя, c++'=>'custom','Настя, cxx'=>'fallback','Настя, мотоцикл'=>'custom'];
foreach($cases as $msg=>$topic){$c=[];$a=motor_nastya_reply($msg,$c,$s,10000);ok(is_string($a)&&$c['topic']===$topic,$msg.' '.($c['topic']??''));}
$legacyCases=['Настя, что делаешь?'=>'activity','Настя, с возвращением'=>'greeting','Настя, как оно?'=>'wellbeing','Настя, скучно'=>'bored','Настя, откуда ты?'=>'location','Настя, любопытно'=>'curiosity','Настя, ты умная'=>'clever','Настя, как зовут?'=>'name','Настя, сколько лет?'=>'age','Настя, удачи'=>'goodbye','Настя, спасибо'=>'thanks','Настя, познакомимся?'=>'acquaintance','Настя, хочешь поговорить?'=>'desire','Настя, будешь?'=>'invitation','Настя, тупая'=>'rude','Настя, из-за чего?'=>'why','Настя, куда разместить объявление?'=>'advertising','Настя, ***'=>'swearing','Настя, обнимаю'=>'affection','Настя, кто?'=>'who','Настя, что?'=>'what','Настя, хочешь торт?'=>'cake','Настя, цветы'=>'flowers','Настя, ты откуда?'=>'location','Настя, откуда?'=>'location','Настя, люблю!'=>'affection','Настя, скучаю'=>'affection','Настя, ты бот?'=>'identity'];
foreach($legacyCases as $msg=>$topic){$c=[];$a=motor_nastya_reply($msg,$c,$s,10000);ok(is_string($a)&&$c['topic']===$topic,'legacy '.$msg.' '.($c['topic']??''));}
ok(count(motor_nastya_legacy_topics())===24 && count(array_unique(array_values($legacyCases)))===24,'all legacy categories');
foreach(['Здравствуй!','Отлично! У тебя как?','Пожалуйста!','Рада помочь.','Давай, меня зовут Настюха, а тебя?'] as $old){$found=false;foreach(motor_nastya_topics() as $topic)if(in_array($old,$topic[1],true))$found=true;ok($found,'restored original '.$old);}
$starters=['Привет, как дела?'=>'wellbeing','Привет, Настя, как дела?'=>'wellbeing','НАСТЮХА, ПРИВЕТ! КАК У ТЕБЯ ДЕЛА?'=>'wellbeing','Добрый вечер! Как настроение?'=>'wellbeing','Здравствуй, что делаешь?'=>'activity','Привет, чем ты занимаешься?'=>'activity','Как дела?'=>'wellbeing','Что делаешь?'=>'activity','Привет!'=>'greeting','Здравствуйте'=>'greeting','Привет, как тебя зовут?'=>'name','Привет, сколько тебе лет?'=>'age','Привет, как дела и что делаешь?'=>'wellbeing_activity','Привет! Как у тебя дела? Чем занимаешься?'=>'wellbeing_activity','Настя, привет. Люблю музыку'=>'music','Настя, привет, ты бот?'=>'identity','[b]Привет[/b], как дела?'=>'wellbeing','[b]Настюха[/b], привет, как дела?'=>'wellbeing','Привет 😊 Как дела?'=>'wellbeing','Привет, как делишки?'=>'wellbeing','Привет, ты как?'=>'wellbeing','Привет, как твои дела?'=>'wellbeing','Привет, ты откуда?'=>'location','Настя, как ты думаешь?'=>'question'];
foreach($starters as $msg=>$topic){for($i=0;$i<12;$i++){$c=[];$a=motor_nastya_reply($msg,$c,$s,10000);ok(is_string($a)&&$c['topic']===$topic,'starter '.$msg.' '.($c['topic']??''));if(str_contains($msg,'Привет')&&$topic==='wellbeing')ok(str_starts_with($a,'Привет! '),'greeting plus answer');}}
foreach(['Привет, Ваня, как дела?','[b]Другой[/b], привет, как дела?','Он сказал: «Привет, как дела?»','Привет, как дела у Вани?','https://example.test/привет','Привет, Мария!'] as $msg){$c=[];ok(motor_nastya_reply($msg,$c,$s,10000)===null,'not addressed '.$msg);}
$c=[];motor_nastya_reply('Привет, как дела?',$c,$s,10000);ok(motor_nastya_reply('Хорошо, спасибо',$c,$s,10002)!==null,'plain starter opens context');
ok($c['topic']==='wellbeing_reply','small-talk acknowledgement');
foreach(['Хорошо','Нормально, спасибо','У меня всё отлично','Неплохо','Потихоньку'] as $msg){$c=['at'=>10000,'topic'=>'wellbeing'];motor_nastya_reply($msg,$c,$s,10001);ok($c['topic']==='wellbeing_reply','reported mood '.$msg);}
foreach(['Не очень','Так себе'] as $msg){$c=['at'=>10000,'topic'=>'wellbeing'];motor_nastya_reply($msg,$c,$s,10001);ok($c['topic']==='sadness','reported low mood');}
$c=['at'=>10000,'topic'=>'wellbeing'];motor_nastya_reply('А у тебя?',$c,$s,10001);ok($c['topic']==='wellbeing','reciprocal question');
$c=['at'=>10000,'topic'=>'wellbeing'];motor_nastya_reply('Хорошо, работаю',$c,$s,10001);ok($c['topic']==='work','actual activity before generic mood');
$c=[];ok(motor_nastya_reply('не обращаюсь к боту',$c,$s,10000)===null,'silent without address');
$c=[];motor_nastya_reply('Настя, музыка',$c,$s,10000);$a=motor_nastya_reply('да',$c,$s,10001);ok($a!==null&&$c['topic']==='music','context yes');
ok(motor_nastya_reply('[b]Другой[/b], привет',$c,$s,10002)===null,'other participant');
ok(motor_nastya_reply('просто слова',$c,$s,10200)===null,'expired');
$other=[];ok(motor_nastya_reply('да',$other,$s,10002)===null,'per participant');
$c=[];$last='';for($i=0;$i<30;$i++){$a=motor_nastya_reply('Настя, ты бот?',$c,$s,10000+$i);ok($a!==$last,'no immediate repeat');$last=$a;}
$c=[];motor_nastya_reply('Настя, музыка',$c,$s,10000);$s['bot_cooldown']=10;ok(motor_nastya_reply('Настя, привет',$c,$s,10001)===null,'cooldown');$s['bot_cooldown']=0;$s['bot_mode']='mentions';ok(motor_nastya_reply('музыка',$c,$s,10002)===null,'mention mode');
$s['bot_mode']='conversation';motor_nastya_reply('Настя, пока',$c,$s,10003);ok(motor_nastya_reply('да',$c,$s,10004)===null,'goodbye resets');
$s['bot_enabled']=0;ok(motor_nastya_reply('Настя, привет',$c,$s,10005)===null,'disabled');
echo json_encode(['assertions'=>$n,'topics'=>count(motor_nastya_topics()),'variants'=>array_sum(array_map(fn($v)=>count($v[1]),motor_nastya_topics()))]);`});
assert.equal(pure.errors,'');assert.equal(pure.exitCode,0,pure.text);const dialog=JSON.parse(pure.text);pass(`${dialog.assertions} conversation checks; ${dialog.topics} topics and ${dialog.variants} answers`);
// Isolated public chat with actual native POST handling.
write('chat.dat','');if(php.fileExists(local('chat-state.json')))write('chat-state.json','{}');
for(const [msg,topic]of [['Привет, как дела?','wellbeing'],['Привет, как дела и что делаешь?','wellbeing_activity'],['Привет! Как тебя зовут?','name'],['Настя, цветы','flowers']]){
 write('chat.dat','');write('chat-state.json','{}');const response=packet(await req('/chat/add.php',{uid,msg,message_id:nonce()},ajax));assert.equal(rows().length,2);assert.equal(JSON.parse(read('chat-state.json')).users.ChatAdmin.topic,topic);assert.ok(response.html.includes('Настюха'));
 if(topic==='wellbeing')assert.ok(rows().at(-1).split('|')[0].includes('Привет! '));
}
write('chat.dat','');write('chat-state.json','{}');
pass('real send: greeting without name, question priority, combined question, restored flowers and per-user context');
const id=nonce(),msg='Настя, какие фильмы любишь?';
let data=packet(await req('/chat/add.php',{uid,msg,message_id:id},ajax));assert.equal(rows().length,2);assert.equal(data.saved,true);assert.ok(data.html.includes('chat-bot-label'));assert.ok(data.html.includes('Настюха'));assert.ok(data.html.includes('images/img/bot.gif'));
assert.equal(data.sent_message_id,id);assert.notEqual(data.message_id,id);assert.equal(data.ids[1],id);assert.notEqual(data.ids[0],id);assert.ok(data.html.includes('id="chat-message-'+id+'"'));
const original=read('chat.dat'),points=read('profil/ChatAdmin.prof').split(':||:')[36];
const repeat=packet(await req('/chat/add.php',{uid,msg,message_id:id},ajax));assert.equal(repeat.saved,false);assert.equal(read('chat.dat'),original);assert.equal(read('profil/ChatAdmin.prof').split(':||:')[36],points);
assert.equal(repeat.sent_message_id,id);assert.equal(repeat.revision,data.revision);
const nativeRetry=await req('/chat/add.php',{uid,msg,message_id:id});assert.equal(nativeRetry.httpStatusCode,302);assert.equal(nativeRetry.headers.location[0],'index.php?isset=addon#chat-message-'+id);assert.equal(read('chat.dat'),original);
let r=await req('/chat/add.php',{uid,msg:msg+' новый текст',message_id:id},ajax);assert.equal(r.httpStatusCode,409);assert.match(JSON.parse(r.text).message_id,/^[a-f0-9]{32}$/);assert.equal(read('chat.dat'),original);
for(const body of [{uid:'x',msg},{'uid[0]':uid,msg},{uid,'msg[0]':msg},{uid,msg:'abc'},{uid,msg,message_id:'../../x'}]){r=await req('/chat/add.php',body,ajax);assert.ok([400,403].includes(r.httpStatusCode));assert.equal(read('chat.dat'),original);}
assert.equal((await req('/chat/add.php?uid='+uid)).httpStatusCode,403);
r=await req('/chat/updates.php?revision='+data.revision,undefined,{'accept-encoding':'gzip'});assert.equal(r.httpStatusCode,204);assert.equal(r.bytes.length,0);assert.ok(!r.headers['content-encoding']);
r=await req('/chat/updates.php',{uid,revision:data.revision},ajax);assert.equal(r.httpStatusCode,204);
assert.equal((await req('/chat/updates.php?revision%5B%5D=x')).httpStatusCode,302);
assert.equal((await req('/chat/updates.php',{uid,'revision[0]':'x'},ajax)).httpStatusCode,400);
let zipped=packet(await req('/chat/updates.php',undefined,{'accept-encoding':'gzip'}));assert.equal(zipped.revision,data.revision);
pass('human + Nastya in one response, idempotent retry, conflict recovery, rejected inputs, unchanged 204 and compressed JSON');
// Untrusted message and metadata never become active markup or profile paths.
r=await req('/chat/add.php',{uid,msg:'<script>alert(1)</script> [url=javascript:alert(1)]тест[/url]',message_id:nonce()},ajax);data=packet(r);assert.ok(!data.html.includes('<script>'));assert.ok(!data.html.includes('href="javascript:'));
let profile=read('profil/ChatAdmin.prof').split(':||:');profile[0]='ChatMember';profile[7]='0';profile[25]='1';write('profil/ChatMember.prof',profile.join(':||:'));write('privat/ChatMember.priv','');
await req('/input.php?action=exit');await req('/input.php',{login:'ChatMember',pass:password});page=await req('/chat/index.php');uid=field(page,'uid');
assert.equal((await req('/mpanel/chat-settings.php')).httpStatusCode,403);assert.equal((await req('/mpanel/chat.php')).httpStatusCode,403);
assert.equal((await req('/chat/add.php',{uid,msg,message_id:id},ajax)).httpStatusCode,409);
write('chat.dat',read('chat.dat')+`&lt;script&gt;x&lt;/script&gt;|../../config||1|<svg onload=alert(1)>|PRIVATE-IP|0|0||${nonce()}|\r\n`);
data=packet(await req('/chat/updates.php'));assert.ok(!data.html.includes('PRIVATE-IP'));assert.ok(!data.html.includes('<svg'));assert.ok(data.html.includes('Участник'));
await req('/input.php?action=exit');data=packet(await req('/chat/updates.php'));assert.ok(!data.html.includes('PRIVATE-IP'));assert.ok(!data.html.includes('<script>'));
assert.equal((await req('/chat/add.php',{uid,msg},ajax)).httpStatusCode,403);
pass('member/guest access, author path validation, stored markup, metadata privacy and POST authorization');
// Scheduled bots progress through authenticated polling, never guest GET.
await req('/input.php',{login:'ChatAdmin',pass:password});uid=field(await req('/chat/index.php'),'uid');
const baseSettings=JSON.parse(read('chat-settings.json'));
write('chat-settings.json',JSON.stringify({...baseSettings,joke_enabled:1,quiz_enabled:1}));write('chat-state.json','{}');write('chat.dat',`Старое сообщение|ChatMember||1|Browser|127.0.0.1|0|0||${nonce()}|\r\n`);
const beforeTick=read('chat.dat');packet(await req('/chat/updates.php'));assert.equal(read('chat.dat'),beforeTick);
await new Promise(resolve=>setTimeout(resolve,2100));packet(await req('/chat/updates.php',{uid,revision:''},ajax));assert.equal(rows().length,3);assert.ok(rows().some(s=>s.includes('|Весельчак|')));assert.ok(rows().some(s=>s.includes('|Вундер-киндер|')));
const ticked=read('chat.dat');await req('/chat/index.php');assert.equal(read('chat.dat'),ticked);
let last=rows().at(-1).split('|');last[7]='1';last[8]='ТЕСТ';write('chat.dat',rows().slice(0,-1).join('\r\n')+'\r\n'+last.join('|')+'\r\n');await req('/chat/index.php');assert.ok(rows().at(-1).includes('Правильный ответ: [b]ТЕСТ'));const timed=rows().length;await req('/chat/index.php');assert.equal(rows().length,timed);
write('chat.dat',`Вопрос|Вундер-киндер||1|Бот||0|${Math.floor(Date.now()/1000)+600}|ответ|${nonce()}|\r\n`);
data=packet(await req('/chat/add.php',{uid,msg:'Думаю ответ',message_id:nonce()},ajax));assert.equal(rows().length,3);assert.ok(rows().at(-1).includes('Молодец'));
write('chat-settings.json',JSON.stringify({...baseSettings,joke_enabled:0,quiz_enabled:0,bot_greeting:1}));write('chat-state.json','{}');await req('/input.php?action=exit');await req('/input.php',{login:'ChatAdmin',pass:password});
const welcomeBefore=rows().length;page=await req('/chat/index.php');assert.equal(rows().length,welcomeBefore+1);await req('/chat/index.php');assert.equal(rows().length,welcomeBefore+1);uid=field(page,'uid');
write('chat-settings.json',JSON.stringify(baseSettings));
pass('scheduled joke and quiz, read-only guest refresh, no duplicate ticks, correct answer, timeout wait and welcome limit');
// Actual moderator forms reject stale indexes and GET mutation.
page=await req('/mpanel/chat.php');version=field(page,'version');const saved=read('chat.dat');
for(const action of ['alldel','restatement','del','addedit'])assert.equal((await req('/mpanel/chat.php?action='+action+'&uid='+uid)).httpStatusCode,403);
assert.equal(read('chat.dat'),saved);
let edit=await req('/mpanel/chat.php?action=edit&id=0'),recordVersion=field(edit,'version');
assert.equal((await req('/mpanel/chat.php?action=addedit&id=0',{uid,version:'bad',msg:'Изменено'})).httpStatusCode,409);
assert.equal((await req('/mpanel/chat.php?action=addedit&id=0',{uid,version:recordVersion,msg:'Изменено [b]тест[/b] :hello'})).httpStatusCode,302);
assert.equal((await req('/mpanel/chat.php?action=del',{uid,version,'del[0]':'0'})).httpStatusCode,409);
page=await req('/mpanel/chat.php');version=field(page,'version');
assert.equal((await req('/mpanel/chat.php?action=del',{uid,version,'del[0]':'999'})).httpStatusCode,400);
assert.equal((await req('/mpanel/chat.php?action=del',{uid,version,'del[0]':'0'})).httpStatusCode,302);
page=await req('/mpanel/chat.php');version=field(page,'version');assert.equal((await req('/mpanel/chat.php?action=alldel',{uid,version})).httpStatusCode,302);assert.equal(rows().length,0);assert.ok(JSON.parse(read('chat-state.json')).quiz_after>0);
pass('moderation: POST + CSRF, stale edit/delete, valid edit/delete, safe clearing and quiz reset');
// Browser fixtures from the real renderer, containing only test users.
const dir=new URL('./chat-fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});
const stamp=Math.floor(Date.now()/1000);const fixtureRows=[];for(let i=0;i<12;i++)fixtureRows.push(`Сообщение ${i}: ${'Обычная беседа участников. '.repeat(5)}|ChatMember||${stamp+i}|Test Browser|127.0.0.1|0|0||${nonce()}|`);
write('chat.dat',fixtureRows.join('\r\n')+'\r\n');write('chat-state.json','{}');
page=await req('/chat/index.php');writeFileSync(new URL('before.html',dir),page.text);writeFileSync(new URL('settings.html',dir),(await req('/mpanel/chat-settings.php')).text);writeFileSync(new URL('history.html',dir),(await req('/chat/index.php?start=10')).text);
let before=packet(await req('/chat/updates.php'));writeFileSync(new URL('before.json',dir),JSON.stringify(before));
data=packet(await req('/chat/add.php',{uid,msg:'Настя, что слушаешь из музыки?',message_id:nonce()},ajax));writeFileSync(new URL('new.json',dir),JSON.stringify(data));
data=packet(await req('/chat/add.php',{uid,msg:'Настя, расскажи о кино',message_id:nonce()},ajax));writeFileSync(new URL('sent.json',dir),JSON.stringify(data));
const edited=rows();last=edited.at(-1).split('|');last[0]='Сообщение исправлено';edited[edited.length-1]=last.join('|');write('chat.dat',edited.slice(1).join('\r\n')+'\r\n');writeFileSync(new URL('edited.json',dir),JSON.stringify(packet(await req('/chat/updates.php'))));
write('chat.dat','');writeFileSync(new URL('empty.json',dir),JSON.stringify(packet(await req('/chat/updates.php'))));
// New settings and per-user bot state survive the existing backup/restore path.
const backupSettings=read('chat-settings.json'),backupState=read('chat-state.json');
assert.equal((await req('/mpanel/backup.php?action=newbackup',{files:'1'})).httpStatusCode,403);
for(const body of [{uid,files:'1',dirarc:'text'},{uid,files:'1','dirarc[0]':'/www'},{uid,files:'1','dirarc[0][a]':'../local'}])assert.equal((await req('/mpanel/backup.php?action=newbackup',body)).httpStatusCode,400);
assert.equal((await req('/mpanel/backup.php?action=newbackup',{uid,files:'1'})).httpStatusCode,302);
let archive=await php.run({code:`<?php $p=glob('/www/local/databackup/*.zip');$z=new ZipArchive();$z->open(end($p));$names=[];for($i=0;$i<$z->numFiles;$i++)$names[]=$z->getNameIndex($i);echo json_encode(['name'=>basename(end($p)),'entries'=>$names]);$z->close();`});assert.equal(archive.errors,'');const backup=JSON.parse(archive.text);assert.ok(backup.entries.includes('chat-settings.json'));assert.ok(backup.entries.includes('chat-state.json'));
php.unlink(local('chat-settings.json'));php.unlink(local('chat-state.json'));
assert.equal((await req('/mpanel/backup.php?action=unzip&filearc='+backup.name,{uid})).httpStatusCode,302);assert.equal(read('chat-settings.json'),backupSettings);assert.equal(read('chat-state.json'),backupState);
pass('actual backup and restore preserve chat settings and bot context');
// Repeated polls must bypass the old DOS page counter while normal authorization remains.
cfg=read('config.dat').split('|');cfg[57]='1';write('config.dat',cfg.join('|'));
for(let i=0;i<15;i++){r=await req('/chat/updates.php',{uid,revision:''},ajax);assert.equal(r.httpStatusCode,200);}
pass('15 repeated authenticated polls remain valid with DOS protection enabled; real browser fixtures captured');
cfg[57]='0';write('config.dat',cfg.join('|'));const adminBefore=read('profil/ChatAdmin.prof');let banned=adminBefore.split(':||:');banned[37]='1';write('profil/ChatAdmin.prof',banned.join(':||:'));assert.equal((await req('/chat/updates.php',{uid},ajax)).httpStatusCode,302);write('profil/ChatAdmin.prof',adminBefore);
await req('/input.php?action=exit');cfg[118]='1';write('config.dat',cfg.join('|'));assert.equal((await req('/chat/updates.php')).httpStatusCode,302);
pass('polling still obeys user bans and site closure');
const result={runtime:'PHP 8.4 WASM',requests,dialog,passed};writeFileSync(new URL('./chat-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({requests,dialog}));
}finally{php.exit();}
