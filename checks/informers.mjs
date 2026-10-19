import { PHP, PHPRequestHandler, setPhpIniEntries } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site';
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
let requests=0;const passed=[];const pass=s=>{passed.push(s);console.log('PASS',s)};
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
try{
copy(root,'/www');await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={}){
 php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));
 if(body){body=new TextEncoder().encode(new URLSearchParams(body).toString());headers={...headers,'content-type':'application/x-www-form-urlencoded'};}
 const r=await handler.request({url,method:body?'POST':'GET',...(body?{body}:{}),headers});requests++;assert.equal(r.errors,'',url);assert.equal(r.exitCode,0,url);return r;
}
const read=p=>php.readFileAsText('/www/local/'+p),write=(p,s)=>php.writeFile('/www/local/'+p,s);
const field=(r,n)=>{const m=r.text.match(new RegExp('name="'+n+'" value="([^"]+)"'));assert.ok(m,'field '+n);return m[1];};
const profile=()=>read('profil/InfoAdmin.prof').split(':||:');
async function pure(code){php.chdir('/www');const r=await php.run({code:"<?php define('BASEDIR','/www/');define('DATADIR','/www/local/');define('SITETIME',time());require '/www/includes/functions.php';$config=['userprofkey'=>100,'timeclocks'=>0];"+code});assert.equal(r.errors,'');assert.equal(r.exitCode,0,r.text);return JSON.parse(r.text);}
const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');
await req('/INSTALL.php?action=install',{name:'InfoAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=read('config.dat').split('|');for(const n of [3,29,57,63,64,65])cfg[n]='0';write('config.dat',cfg.join('|'));
await req('/input.php',{login:'InfoAdmin',pass:password});let page=await req('/chat/index.php'),uid=field(page,'uid');
write('chat-settings.json',JSON.stringify({auto_refresh:1,refresh_seconds:3,page_size:10,history_limit:50,bot_enabled:1,joke_enabled:0,quiz_enabled:0,bot_greeting:0,bot_mode:'conversation',context_seconds:180,bot_cooldown:0,joke_seconds:300,quiz_seconds:600,quiz_wait:60,custom_rules:[]}));
write('chat.dat','');write('chat-state.json','{}');const before=profile().map(Number),id=randomBytes(16).toString('hex'),msg='Привет, как дела?';
let r=await req('/chat/add.php',{uid,msg,message_id:id},{accept:'application/json'});assert.equal(r.httpStatusCode,200);assert.equal(JSON.parse(r.text).total,2);
for(const n of [12,36,41])assert.equal(+profile()[n],before[n]+1);
assert.ok((await req('/pages/anketa.php?view=details&uz=InfoAdmin')).text.includes('Сообщений в чате: '+(+profile()[12])+'<br'));
assert.ok((await req('/pages/userlist.php')).text.includes('Чат: '+(+profile()[12])+' |'));
const counted=profile()[12];r=await req('/chat/add.php',{uid,msg,message_id:id},{accept:'application/json'});assert.equal(JSON.parse(r.text).saved,false);assert.equal(profile()[12],counted);
for(const body of [{uid:'bad',msg,message_id:id},{uid,msg:'abc',message_id:randomBytes(16).toString('hex')},{uid,'msg[0]':'text'}]){r=await req('/chat/add.php',body,{accept:'application/json'});assert.ok([400,403].includes(r.httpStatusCode));assert.equal(profile()[12],counted);}
const hits=read('datacounter/hits.dat');for(let i=0;i<4;i++)await req('/chat/updates.php',{uid},{accept:'application/json'});assert.equal(read('datacounter/hits.dat'),hits);assert.equal(profile()[12],counted);
page=await req('/mpanel/chat.php');r=await req('/mpanel/chat.php?action=alldel',{uid,version:field(page,'version')});assert.equal(r.httpStatusCode,302);assert.equal(profile()[12],counted);assert.deepEqual(await pure('echo json_encode([stats(8),reading_profil("InfoAdmin")[12]]);'),[0,counted]);
pass('personal chat count +1, bot excluded, duplicate/invalid sends unchanged, profile and leaderboard, clear retains cumulative contribution, polling does not add hits');
// Other real contribution paths use independent profile fields.
const beforePosts=profile().map(Number);
r=await req('/book/add.php',{uid,msg:'Сообщение для проверки информатора'});assert.equal(r.httpStatusCode,302);assert.equal(+profile()[9],beforePosts[9]+1);
write('dataforum/mainforum.dat','1|Проверка|999|999|\r\n');write('dataforum/topic1.dat','');
r=await req('/forum/forum.php?act=create',{uid,fid:'1',title:'Проверка счётчиков',msg:'Первое сообщение темы'});assert.equal(r.httpStatusCode,302,r.text);
let tid=read('dataforum/topic1.dat').trim().split('|')[0];r=await req('/forum/topic.php?act=add&fid=1&id='+tid,{uid,msg:'Второе сообщение темы'});assert.equal(r.httpStatusCode,302,r.text);assert.equal(+profile()[8],beforePosts[8]+2);
const now=Math.floor(Date.now()/1000);const newsBefore=profile().map(Number);write('news.dat',`Новость|Текст||${now}|InfoAdmin|991|\r\n`);
r=await req('/news/komm.php?action=add&id=991',{uid,msg:'Комментарий к новости'});assert.equal(r.httpStatusCode,302);for(const n of [33,36,41]) assert.equal(+profile()[n],newsBefore[n]+1);
assert.deepEqual(await pure('echo json_encode([stats_forum(),stats(1),stats(2),stats(0),stats(3)]);'),['1/2',1,2,1,1]);
page=await req('/pages/statistik.php');for(const s of ['Тем в форуме: <b>1','Записей в форуме: <b>2','Записей в гостевой: <b>1','Комментариев в новостях: <b>1'])assert.ok(page.text.includes(s),s);
write('dataforum/mainforum.dat','1|Проверка|999|999|\r\n');
assert.ok((await req('/mpanel/forum.php')).text.includes('(1/2)'));
pass('real guestbook, forum topic/reply and news-comment contributions; forum topics and posts are distinct');
// Sources, not stale totals. Deleted, blank and orphaned records do not inflate informers.
write('local.dat','999|999|999|999|999|4|5|999|999|0|0|');write('book.dat','\r\n');write('datakomm/991.dat','');write('datakomm/12345.dat','Orphan\n');
write('adminchat.dat','one\r\ntwo\r\n');write('chat.dat','one\n\ntwo\nthree\n');
write('databoard/database.dat','Раздел|Описание|7|\n');write('databoard/7.dat',`Действует|Текст|InfoAdmin|${now}|${now+3600}|1|0|\nИстёк|Текст|InfoAdmin|1|2|2|0|\n`);
assert.deepEqual(await pure('echo json_encode([stats(0),stats(3),stats(4),stats(5),stats(6),stats(8),stats_board()]);'),[0,0,2,4,5,3,1]);
const home=await req('/index.php');assert.match(home.text,/Мини-чат[\s\S]*?count-badge">3</);assert.match(home.text,/Объявления[\s\S]*?count-badge">1</);
write('databoard/database.dat','Bad|Bad|../../profil/InfoAdmin|\nРаздел|Описание|7|\nРаздел|Описание|7|\n');assert.equal(await pure('echo json_encode(stats_board());'),1);
write('dataforum/mainforum.dat','../../profil/InfoAdmin|Bad|0|0|\n1|Проверка|999|999|\n');assert.equal(await pure('echo json_encode(stats_forum());'),'1/2');
pass('counts repair themselves after deletion/empty history, expired ads excluded, legacy absent modules preserved, duplicate categories and path traversal ignored');
// Gallery counts include only existing accessible photos and attached comments.
let gd=await php.run({code:"<?php $im=imagecreatetruecolor(20,20);imagejpeg($im,'/www/local/datagallery/test.jpg');echo 'ok';"});assert.equal(gd.errors,'');
write('datagallery/fotobase.dat',`Описание|Фото|InfoAdmin||${now}|1|test.jpg|\nОписание|Нет файла|InfoAdmin||${now}|2|missing.jpg|\n`);
write('datagallery/test.jpg.dat','Один||1|InfoAdmin|\nДва||2|InfoAdmin|\n');write('datagallery/missing.jpg.dat','Orphan\n');
assert.deepEqual(await pure('echo json_encode([stats_gallery(),stats(7)]);'),[1,2]);
// Gallery addition increments comments, not chat/forum totals.
const commentsBefore=+profile()[33],galleryBefore=profile().map(Number);r=await req('/gallery/index.php?action=addkomm&gid=test.jpg',{uid,msg:'Третий комментарий'});assert.equal(r.httpStatusCode,302,r.text);for(const n of [33,36,41]) assert.equal(+profile()[n],galleryBefore[n]+1);assert.equal(await pure('echo json_encode(stats(7));'),3);
pass('gallery photo/comment informers exclude missing images; actual gallery comment updates personal count');
const member=profile();member[0]='InfoMember';member[7]='0';member[37]='1';member[38]=String(now+3600);member[46]='1';write('profil/InfoMember.prof',member.join(':||:'));
write('datatmp/userlist.dat','stale\n');write('datatmp/adminlist.dat','');write('datatmp/banlist.dat','');write('datatmp/reglist.dat','');
write('blacklogin.dat','test\n\n');write('blackmail.dat','a@example.test\nb@example.test\n');write('ban.dat','|127.0.0.2|test|\n');write('datavotes/result.dat','|2|3|0|');
assert.deepEqual(await pure('echo json_encode([stats_users(),stats_admins(),stats_banned(),stats_reglist(),stats_blacklogin(),stats_blackmail(),stats_ipbanned(),stats_votes()]);'),[2,1,1,1,1,2,1,5]);
page=await req('/pages/userlist.php');assert.ok(page.text.includes('InfoMember'));assert.ok(!page.text.includes('stale'));
assert.equal(await pure('$before=reading_profil("InfoAdmin");increment_profil("InfoAdmin",[12=>1]);change_profil("InfoAdmin",[29=>"Новое имя"]);increment_profil("InfoAdmin",[12=>1]);$after=reading_profil("InfoAdmin");echo json_encode((int)$after[12]===(int)$before[12]+2 && $after[29]==="Новое имя");'),true);
assert.equal(await pure('$before=file_get_contents(DATADIR."profil/InfoAdmin.prof");foreach([0,1,4] as $key){try{change_profil("InfoAdmin",[$key=>""]);throw new Exception("accepted blank credential");}catch(InvalidArgumentException $e){}}echo json_encode(file_get_contents(DATADIR."profil/InfoAdmin.prof")===$before);'),true);
pass('registered/admin/banned/pending/blacklist/vote counts; stale leaderboard ignored; profile deltas preserve intervening increments and unrelated changes');
// Notification informer: successful delivery and reading are independent of chat counts.
let recipient=read('profil/InfoMember.prof').split(':||:');recipient[37]='0';recipient[38]='0';recipient[46]='0';recipient[10]='0';write('profil/InfoMember.prof',recipient.join(':||:'));write('privat/InfoMember.priv','');
r=await req('/pages/privat.php?action=send&uz=InfoMember',{uid,msg:'Проверка уведомления о письме'});assert.equal(r.httpStatusCode,302);assert.equal(+read('profil/InfoMember.prof').split(':||:')[10],1);
assert.equal((await req('/pages/privat.php?action=send&uz=InfoMember',{uid:'bad',msg:'Не должно отправляться'})).httpStatusCode,403);assert.equal(+read('profil/InfoMember.prof').split(':||:')[10],1);
await req('/input.php?action=exit',{uid});await req('/input.php',{login:'InfoMember',pass:password});page=await req('/pages/themes.php');uid=field(page,'uid');assert.ok(page.text.includes('Приватное сообщение! (1)'));
page=await req('/pages/privat.php');assert.ok(page.text.includes('Получено новых писем: <b>1'));assert.equal(+read('profil/InfoMember.prof').split(':||:')[10],0);
await req('/input.php?action=exit',{uid});await req('/input.php',{login:'InfoAdmin',pass:password});uid=field(await req('/pages/themes.php'),'uid');
pass('private-message notification +1 on delivery, invalid send unchanged, visible to recipient and cleared after opening inbox');
write('datakontakt/InfoAdmin.dat','|InfoMember|\n\n');write('dataignor/InfoAdmin.dat','\n');write('privat/InfoAdmin.priv','InfoMember|Первое|1|\n\nInfoMember|Второе|2|\n');write('bank.dat','|InfoAdmin|20|0|\n');
assert.equal(await pure('$d=reading_profil("InfoAdmin");echo json_encode(user_kontakt("InfoAdmin")===1 && user_ignor("InfoAdmin")===0 && user_mail("InfoAdmin")===$d[10]."/2" && user_many("InfoAdmin")===$d[41]."/20" && user_bankmany("InfoAdmin")===20 && user_health("InfoAdmin")===(int)$d[56]."%" && user_stamina("InfoAdmin")===(int)$d[57]."%");'),true);
pass('contact/ignore and mailbox totals ignore blank lines; cash, bank, health and stamina informers match their sources');
// Shared IP and duplicates; expiry is based on the full timestamp.
assert.deepEqual(await pure(`$n=SITETIME;$rows=["$n|127.0.0.1|InfoAdmin|B|","$n|127.0.0.1|InfoMember|B|",($n-1)."|127.0.0.2|InfoAdmin|B|",($n-601)."|127.0.0.3||B|","$n|127.0.0.4||B|","$n|127.0.0.4||B|"];echo json_encode(array_map(fn($d)=>$d[2],motor_info_online_rows($rows)));`),['InfoAdmin','InfoMember','']);
assert.equal(await pure('$n=SITETIME;echo json_encode(count(motor_info_online_rows(["$n|127.0.0.1|ab|B|","$n|127.0.0.2|../bad|B|"])));'),1);
write('online.dat',`${now}|127.0.0.1|InfoMember|Browser|\n`);
assert.deepEqual(await pure('$ip="127.0.0.1";$log="InfoAdmin";$brow="Browser";motor_info_presence();$o=motor_info_online();echo json_encode([$o["total"],$o["registered"],$o["guests"]]);'),[2,2,0]);
pass('online counts preserve two accounts behind one IP, deduplicate accounts/guests and drop expired records');
// Hour/day changes, idle gaps and same date-number in a later month.
assert.equal(await pure(`$n=strtotime('2026-10-17 15:20:00 UTC');$old=strtotime('2026-09-17 15:20:00 UTC');file_put_contents(DATADIR.'datacounter/hits.dat','17|5|50|15|3|'.$old.'|');motor_info_traffic_tick('hits',1,$n);$c=motor_info_traffic_current('hits',$n);echo json_encode($c===['day'=>1,'hour'=>1,'all'=>51] && array_sum(motor_info_traffic_series('hits',24,$n))===1);`),true);
assert.deepEqual(await pure(`$n=strtotime('2026-10-17 15:20:00 UTC');$old=$n-2*3600;file_put_contents(DATADIR.'datacounter/hits.dat','17|5|50|13|3|'.$old.'|');file_put_contents(DATADIR.'datacounter/24_hits.dat','999|1|');motor_info_traffic_tick('hits',1,$n);$series=motor_info_traffic_series('hits',24,$n);echo json_encode([$series[strtotime('2026-10-17 13:00:00 UTC')],$series[strtotime('2026-10-17 14:00:00 UTC')],$series[strtotime('2026-10-17 15:00:00 UTC')],array_sum($series)]);`),[3,0,1,4]);
assert.equal(await pure(`$n=strtotime('2026-10-17 15:20:00 UTC');$old=strtotime('2026-10-16 15:20:00 UTC');file_put_contents(DATADIR.'datacounter/host.dat','16|5|50|15|3|'.$old.'|');motor_info_traffic_tick('host',0,$n);$c=motor_info_traffic_current('host',$n);echo json_encode($c===['day'=>0,'hour'=>0,'all'=>50]);`),true);
for(const path of ['/pages/counter.php','/pages/counter.php?action=count24','/pages/counter.php?action=count31','/pages/online.php','/pages/onlinewho.php','/pages/traffic.php','/pages/raitinglist.php','/pages/avtorlist.php','/pages/lifelist.php'])assert.equal((await req(path)).httpStatusCode,200,path);
for(const path of ['/gallery/count.php','/gallery/count24.php','/gallery/count31.php']){r=await req(path);assert.equal(r.httpStatusCode,200);assert.equal(Buffer.from(r.bytes).subarray(0,3).toString(),'GIF');}
pass('full-date rollover, two-hour gap, stale archive exclusion, zero-increment hosts, statistic pages and all three GIF informers');
writeFileSync(new URL('./informers-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2)+'\n');console.log('SUCCESS',requests,'HTTP requests');
}finally{php.exit();}
