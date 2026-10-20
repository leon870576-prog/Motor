import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
const fixtureDir=new URL('./userpages-fixtures/',import.meta.url);
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

const values=name=>[33,36,41,49].map(n=>Number(profile(name)[n]));
const beforeReads=()=>JSON.stringify(values('PageGuest'));
await login('PageOwner');const settings={revision:'0',title:'Синхронизация',about:'',published:'1',guestbook_open:'1'};
assert.equal((await action('save',settings)).httpStatusCode,303);
const post=id();cool();assert.equal((await action('news_add',{id:post,title:'Новость',msg:'Обсуждение'})).httpStatusCode,303);
await login('PageGuest');setProfile('PageGuest',{33:7,36:25,41:50});
const check=n=>assert.deepEqual(values('PageGuest'),[7+n,25+n,50+n,17]);
const now=Math.floor(Date.now()/1000);
php.writeFile('/www/local/news.dat',`Новость|Текст||${now}|PageOwner|991|\r\n`);
assert.equal((await req('/news/komm.php?action=add&id=991',{uid,msg:'Комментарий к общей новости'})).httpStatusCode,302);check(1);
await run("$im=imagecreatetruecolor(20,20);imagejpeg($im,'/www/local/datagallery/test.jpg');");
php.writeFile('/www/local/datagallery/fotobase.dat',`Описание|Фото|PageOwner||${now}|1|test.jpg|\n`);
assert.equal((await req('/gallery/index.php?action=addkomm&gid=test.jpg',{uid,msg:'Комментарий к фото'})).httpStatusCode,302);check(2);
cool();const comment={post,id:id(),msg:'Комментарий к личной новости'};
assert.equal((await action('comment_add',comment)).httpStatusCode,303);check(3);
for(let i=0;i<3;i++){assert.equal((await action('comment_add',comment)).httpStatusCode,303);check(3);}
assert.equal((await action('comment_edit',{...comment,revision:'1',msg:'Исправлено'})).httpStatusCode,303);check(3);
cool();const review={id:id(),msg:'Отзыв на личной странице'};
assert.equal((await action('guest_add',review)).httpStatusCode,303);check(4);
for(let i=0;i<3;i++){assert.equal((await action('guest_add',review)).httpStatusCode,303);check(4);}
assert.equal((await action('guest_edit',{...review,revision:'1',msg:'Исправленный отзыв'})).httpStatusCode,303);check(4);
const snapshot=beforeReads();for(const u of ['/pages/anketa.php?view=details&uz=PageGuest','/pages/userlist.php',base,base+'&tab=comments&post='+post])assert.equal((await req(u)).httpStatusCode,200);assert.equal(beforeReads(),snapshot);
const anketa=await req('/pages/anketa.php?view=details&uz=PageGuest');assert.ok(anketa.text.includes('Комментариев: 11<br'));assert.ok(anketa.text.includes('29'));
for(const a of ['guest_add','comment_add']){const body=a==='guest_add'?{id:id(),msg:'Отзыв'}:{post,id:id(),msg:'Текст'};assert.equal((await action(a,{...body,uid:'bad'})).httpStatusCode,403);check(4);}
assert.equal((await action('guest_delete',{id:review.id,revision:'2'})).httpStatusCode,303);check(4);
assert.equal((await action('comment_delete',{post,id:comment.id,revision:'2'})).httpStatusCode,303);check(4);
assert.equal((await action('guest_add',review)).httpStatusCode,303);assert.equal((await action('comment_add',comment)).httpStatusCode,303);check(4);
pass('all four comment sources add exactly +1 count/+1 point/+1 coin; questionnaire and list agree; personal edit/retry/delete and read-only views retain totals; authority unchanged');
// A preserved v1 fixture: three news comments already counted, no rewards; two
// retained reviews plus one deleted review proven by the old retry journal.
const historicalTemplate=profile('PageGuest');
function create(name,fields={}){const p=[...historicalTemplate];p[0]=name;p[4]='fixture@example.test';p[97]='';for(const[k,v]of Object.entries(fields))p[+k]=String(v);php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
create('OldUser',{33:10,36:20,41:30,97:'upc1:'+JSON.stringify({OldPage:3})});create('OldPage');
create('GonePageAuthor',{33:8,36:10,41:15,97:'upc1:'+JSON.stringify({RemovedPage:4})});
const rid1=id(),rid2=id(),rid3=id();let old=JSON.parse(await run(helper+"echo json_encode(motor_userpage_default('OldPage'));"));
old.created=1;old.published=false;old.comment_totals={OldUser:3};
old.guestbook=[rid1,rid2].map(id=>({id,author:'OldUser',text:'Старый отзыв',created:1,updated:1,revision:1}));
old.recent=[rid1,rid3].map(id=>({id,actor:'OldUser',kind:'guest_add',hash:'a'.repeat(64),time:1}));
php.writeFile('/www/local/userpages/OldPage.json',JSON.stringify(old));
const oldRaw=php.readFileAsText('/www/local/userpages/OldPage.json'),oldProfile=php.readFileAsText('/www/local/profil/OldUser.prof');
const migrate=async()=>JSON.parse(await run(helper+"echo json_encode(motor_userpage_activity_migrate('/activity-backup'));"));
let report=await migrate();assert.ok(report.profile_updates>=2);assert.deepEqual(values('OldUser'),[13,26,36,17]);assert.deepEqual(values('GonePageAuthor'),[8,14,19,17]);check(4);
assert.equal(php.readFileAsText('/activity-backup/profil/OldUser.prof'),oldProfile);assert.equal(php.readFileAsText('/activity-backup/userpages/OldPage.json'),oldRaw);
const migrated=php.readFileAsText('/www/local/profil/OldUser.prof'),migratedPage=php.readFileAsText('/www/local/userpages/OldPage.json');
for(let i=0;i<3;i++){report=await migrate();assert.equal(report.profile_updates,0);assert.equal(report.pages,0);assert.equal(php.readFileAsText('/www/local/profil/OldUser.prof'),migrated);assert.equal(php.readFileAsText('/www/local/userpages/OldPage.json'),migratedPage);}
assert.equal(php.readFileAsText('/activity-backup/profil/OldUser.prof'),oldProfile);
pass('v1 backfill rewards already-counted news without incrementing count twice; recovers retained/deleted-journal reviews; private/deleted-owner pages included; exact backups and repeated migration unchanged');
create('123');create('456',{33:0,36:0,41:0});
assert.equal(await run(helper+"motor_userpage_activity_sync('456','123',2,3);echo json_encode(array_map('intval',array_intersect_key(motor_userpage_profile('456'),array_flip([33,36,41]))));"),'{"33":5,"36":5,"41":5}');
create('BadState',{97:'unrecognized:do-not-overwrite'});const bad=php.readFileAsText('/www/local/profil/BadState.prof');
assert.equal(await run(helper+"try {motor_userpage_activity_sync('BadState','OldPage',1,1);echo 'accepted';} catch(Throwable $e){echo $e->getCode();}"),'503');assert.equal(php.readFileAsText('/www/local/profil/BadState.prof'),bad);
// A failed profile write must be recoverable after the page aggregate was saved.
create('BadPage');let failed=JSON.parse(await run(helper+"echo json_encode(motor_userpage_default('BadPage'));"));failed.created=1;failed.guestbook=[{id:id(),author:'BadState',text:'Сохранённый отзыв',created:1,updated:1,revision:1}];php.writeFile('/www/local/userpages/BadPage.json',JSON.stringify(failed));
assert.equal(await run(helper+"try {motor_userpage_activity_migrate('/activity-backup');echo 'accepted';}catch(Throwable $e){echo $e->getCode();}"),'503');assert.equal(php.readFileAsText('/www/local/profil/BadState.prof'),bad);
assert.equal(JSON.parse(php.readFileAsText('/www/local/userpages/BadPage.json')).review_totals.BadState,1);
setProfile('BadState',{97:''});const missed=values('BadState');await migrate();assert.deepEqual(values('BadState'),[missed[0]+1,missed[1]+1,missed[2]+1,missed[3]]);const repaired=values('BadState');await migrate();assert.deepEqual(values('BadState'),repaired);
create('ShortUser');let short=profile('ShortUser').slice(0,80);short[33]='0';short[36]='0';short[41]='0';php.writeFile('/www/local/profil/ShortUser.prof',short.join(':||:'));
await run(helper+"motor_userpage_activity_sync('ShortUser','OldPage',1,1);");assert.deepEqual(values('ShortUser'),[2,2,2,17]);
const symlink=await run(helper+"symlink(DATADIR.'profil/OldUser.prof',DATADIR.'profil/LinkUser.prof');try {motor_userpage_activity_sync('LinkUser','OldPage',1,1);echo 'accepted';}catch(Throwable $e){echo $e->getCode();}");assert.equal(symlink,'503');assert.equal(php.readFileAsText('/www/local/profil/OldUser.prof'),migrated);
pass('numeric logins and short profiles supported; unknown markers and symlink refused; migration preserves existing activity, money, authority and unrelated fields');
// Deterministically model the other process creating the directory between is_dir and mkdir.
const directoryRace=await run(String.raw`
define('BASEDIR','/www/');define('DATADIR','/race-data/');require '/www/includes/functions.php';require '/www/includes/userpages.php';
mkdir('/race-data');mkdir('/race-data/profil');mkdir('/race-data/userpages');
$source=file_get_contents('/www/includes/userpage-activity.php');
$shim='namespace MotorDirectoryRace; use \\RuntimeException; use \\InvalidArgumentException; use \\Throwable; function mkdir($path,$mode=0777,$recursive=false){$ok=\\mkdir($path,$mode,$recursive);return $path==="/race-backup"?false:$ok;} ';
eval($shim.substr($source,5));
$r=MotorDirectoryRace\motor_userpage_activity_migrate('/race-backup');
echo json_encode($r);
`);
assert.deepEqual(JSON.parse(directoryRace),{pages:0,profile_updates:0,missing_profiles:0});
pass('backup directory creation tolerates another process winning the mkdir race, with the migration lock and safety checks preserved');
writeFileSync(new URL('./comment-activity-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',requests,passed},null,2));console.log('SUCCESS',requests,'HTTP requests plus migration assertions');
}finally{php.exit()}
