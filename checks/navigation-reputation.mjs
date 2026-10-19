import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site'),php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));

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
const profile=name=>php.readFileAsText('/www/local/profil/'+name+'.prof').split(':||:');
function set(name,fields){const p=profile(name);for(const[k,v]of Object.entries(fields))p[+k]=String(v);php.writeFile('/www/local/profil/'+name+'.prof',p.join(':||:'));}
for(const name of ['PageAdmin','PageOwner','PageGuest','PageOther'])set(name,{36:name==='PageOwner'?0:200,48:0,49:0,50:0,51:0});
cfg[98]='1';cfg[30]='100';php.writeFile('/www/local/config.dat',cfg.join('|'));
const base='/pages/userpage.php?uz=PageOwner';
let r=await req('/pages/anketa.php?uz=PageOwner');assert.equal(r.httpStatusCode,302);assert.equal(r.headers.location[0],'userpage.php?uz=PageOwner');
assert.equal((await req('/pages/anketa.php')).headers.location[0],'userpage.php');
r=await req(base);assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('view=details&amp;uz=PageOwner'));assert.equal(php.fileExists('/www/local/userpages'),false);
const order=html=>{const news=html.indexOf('<h2>Новости пользователя</h2>'),photo=html.indexOf('<h2>Фотографии</h2>'),reviews=html.indexOf('<h2>Отзывы</h2>');assert.ok(news>0&&photo>news&&reviews>photo);};order(r.text);
await login('PageAdmin');r=await req('/input.php',{login:'PageAdmin',pass:password});assert.equal(r.headers.location[0],'pages/userpage.php');uid=await token();
for(const url of ['/pages/userlist.php','/pages/avtorlist.php','/pages/online.php','/pages/adminlist.php','/mpanel/adminlist.php']){r=await req(url);assert.equal(r.httpStatusCode,200);assert.ok(!/href="[^\"]*anketa\.php/.test(r.text),url);}
for(const url of [base,'/pages/userpage.php','/pages/userpage.php?uz=PageGuest']){r=await req(url);assert.equal(r.httpStatusCode,200);order(r.text);assert.match(r.text,/href="\.\.\/pages\/index.php\?action=menu" aria-label="Моё меню"/);}
r=await req('/pages/anketa.php?view=details&uz=PageOwner');assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Анкета PageOwner'));assert.ok(!r.text.includes('action=plus&amp;uid='));
const target='/pages/raiting.php?uz=PageOwner',vote=(extra={},url=target,headers={},method)=>req(url,{uid,vote:'plus',revision:'none',...extra},headers,method);
const revision=r=>{const m=r.text.match(/name="revision" value="(none|[a-f0-9]{32})"/);assert.ok(m,'vote revision is present');return m[1];};
const counts=()=>[48,49,50,51].map(i=>profile('PageOwner')[i]).join(',');const initial=counts();
for(const action of ['plus','minus'])for(const method of ['GET','HEAD'])assert.equal((await req(target+'&action='+action+'&uid='+uid,undefined,{},method)).httpStatusCode,403);
assert.equal((await req(target)).httpStatusCode,200);assert.equal(counts(),initial);
for(const [body,headers] of [[{uid:''},{}],[{uid:'wrong'},{}],[{}, {'Origin':'https://evil.test'}],[{}, {'Sec-Fetch-Site':'cross-site'}],[{'vote[]':'plus',vote:undefined},{}]])assert.equal((await vote(body,target,headers)).httpStatusCode,body['vote[]']?400:403);
assert.equal((await req(target+'&uid='+uid,{vote:'plus'})).httpStatusCode,403,'token must be in POST');
assert.equal((await vote({vote:'multiply'})).httpStatusCode,400);
assert.equal((await vote({},'/pages/raiting.php?uz=PageAdmin')).httpStatusCode,403);
assert.equal((await vote({},'/pages/raiting.php?uz=MissingUser')).httpStatusCode,404);
assert.equal((await vote({},target,{},'PUT')).httpStatusCode,405);assert.equal(counts(),initial);
pass('personal pages and old bookmarks, header button opens My menu, login opens personal page, questionnaire access, News→Photos→Reviews, read-only GET/HEAD and CSRF/Origin/method/type guards');
r=await vote();assert.equal(r.httpStatusCode,303,r.text.match(/role="alert">([^<]+)/)?.[1]);assert.equal(r.headers.location[0],'userpage.php?uz=PageOwner&voted=1');assert.equal(profile('PageOwner')[49],'1');assert.equal(profile('PageOwner')[50],'1');assert.equal(profile('PageOwner')[36],'0');
const mail=php.readFileAsText('/www/local/privat/PageOwner.priv');assert.equal(mail.split('повысил ваш авторитет').length-1,1);const unread=profile('PageOwner')[10];
assert.equal((await vote()).httpStatusCode,303);assert.equal((await vote({},'/pages/raiting.php?uz=PageGuest')).httpStatusCode,429);
assert.equal(php.readFileAsText('/www/local/privat/PageOwner.priv'),mail);assert.equal(profile('PageOwner')[10],unread);
const cooldown=profile('PageAdmin')[48],unrelated=[33,36,41,96,97,98,99].map(i=>profile('PageOwner')[i]);
const voteFixtures=new URL('./userpages-fixtures/',import.meta.url);mkdirSync(voteFixtures,{recursive:true});
r=await req(base);let plusRevision=revision(r);writeFileSync(new URL('reputation-plus.html',voteFixtures),r.text);
assert.equal((await vote({vote:'minus',revision:'none'})).httpStatusCode,409,'old form cannot undo a newer vote');
for(const bad of ['', 'x', '<script>', 'a'.repeat(31)])assert.equal((await vote({vote:'minus',revision:bad})).httpStatusCode,400);
assert.equal((await req(target,{uid,vote:'minus'})).httpStatusCode,400,'revision required');
assert.equal((await vote({vote:'minus',revision:plusRevision,uid:'bad'})).httpStatusCode,403);
assert.equal((await vote({vote:'minus',revision:plusRevision},target,{Origin:'https://evil.test'})).httpStatusCode,403);
assert.equal((await vote({vote:'minus',revision:plusRevision})).headers.location[0],'userpage.php?uz=PageOwner&voted=changed');
assert.deepEqual([49,50,51].map(i=>profile('PageOwner')[i]),['-1','0','1']);assert.equal(profile('PageAdmin')[48],cooldown);
assert.deepEqual([33,36,41,96,97,98,99].map(i=>profile('PageOwner')[i]),unrelated);
const editMail=php.readFileAsText('/www/local/privat/PageOwner.priv'),editUnread=profile('PageOwner')[10];assert.match(editMail,/изменил оценку вашего авторитета с \+1 на −1/);
assert.equal((await vote({vote:'minus',revision:plusRevision})).httpStatusCode,303);assert.equal(php.readFileAsText('/www/local/privat/PageOwner.priv'),editMail);assert.equal(profile('PageOwner')[10],editUnread);
assert.equal((await vote()).httpStatusCode,409,'late retry must not restore the first plus');
let minusRevision=revision(await req(target));assert.notEqual(minusRevision,plusRevision);
for(const url of [base,'/pages/anketa.php?view=details&uz=PageOwner',target]){r=await req(url);assert.match(r.text,/Ваша оценка: <strong>−1/);assert.match(r.text,/value="minus"[^>]*disabled/);assert.equal(revision(r),minusRevision);if(url===base)writeFileSync(new URL('reputation-minus.html',voteFixtures),r.text);}
assert.equal((await vote({revision:minusRevision})).httpStatusCode,303);assert.deepEqual([49,50,51].map(i=>profile('PageOwner')[i]),['1','1','0']);assert.equal(profile('PageAdmin')[48],cooldown);
assert.equal((await vote({vote:'minus',revision:plusRevision})).httpStatusCode,409,'revision protects against an ABA round trip');
assert.equal((await vote({},'/pages/raiting.php?uz=PageGuest')).httpStatusCode,429,'edits do not clear new-recipient cooldown');
set('PageAdmin',{48:0});assert.equal((await vote()).httpStatusCode,303);assert.equal(profile('PageOwner')[49],'1');
await login('PageGuest');assert.equal((await vote({vote:'minus'})).httpStatusCode,303);assert.deepEqual([49,50,51].map(i=>profile('PageOwner')[i]),['0','1','1']);
await login('PageOwner');assert.equal((await vote({},'/pages/raiting.php?uz=PageOther')).httpStatusCode,403);
await logout();assert.equal((await vote()).httpStatusCode,403);
pass('newbie receives ±1; +1→−1 and reverse update total and both counters, same-vote retries are inert, stale/ABA forms blocked, edit CSRF preserved, cooldown only for new recipients');
await login('PageOther');set('PageOther',{37:1,38:Math.floor(Date.now()/1000)+86400});assert.equal((await vote()).httpStatusCode,302);assert.equal(profile('PageOwner')[49],'0');set('PageOther',{37:0});
const helper="define('BASEDIR','/www/');define('DATADIR','/www/local/');require '/www/includes/functions.php';require '/www/includes/reputation.php';$config=['karantin'=>0,'regkeys'=>1];";
const helperVote="try {motor_reputation_vote('PageOther','PageOwner','plus',2000000000,'"+profile('PageOther')[1]+"');echo 'BAD';}catch(Throwable $e){echo $e->getCode();}";
set('PageOther',{46:1});assert.equal(await run(helper+helperVote),'403');set('PageOther',{46:0,6:1999999999});assert.equal(await run(helper.replace("'karantin'=>0","'karantin'=>86400")+helperVote),'403');set('PageOther',{6:1});
assert.equal(await run(helper+helperVote.replace(profile('PageOther')[1],'invalid-credential')),'403');
const targetPath='/www/local/profil/PageOwner.prof',original=php.readFileAsText(targetPath);
await run("file_put_contents('/tmp/rep-outside','outside');rename('"+targetPath+"','/tmp/rep-profile');symlink('/tmp/rep-outside','"+targetPath+"');");assert.equal((await vote()).httpStatusCode,404);assert.equal(php.readFileAsText('/tmp/rep-outside'),'outside');await run("unlink('"+targetPath+"');rename('/tmp/rep-profile','"+targetPath+"');");
await run("symlink('/tmp/rep-outside','/www/local/dataraiting/PageOther.dat');");assert.equal((await vote()).httpStatusCode,503);assert.equal(php.readFileAsText('/tmp/rep-outside'),'outside');await run("unlink('/www/local/dataraiting/PageOther.dat');");
php.writeFile('/www/local/dataraiting/PageOther.dat','corrupt');assert.equal((await vote()).httpStatusCode,503);assert.equal(php.readFileAsText(targetPath),original);php.writeFile('/www/local/dataraiting/PageOther.dat','');
set('PageOwner',{49:'bad'});assert.equal((await vote()).httpStatusCode,503);set('PageOwner',{49:0});
set('PageOwner',{29:'<img src=x onerror=alert(1)>',2:'<svg onload=alert(1)>',13:'<script>alert(1)</script>',3:'[url=javascript:alert(1)]test[/url]'});
r=await req('/pages/anketa.php?view=details&uz=PageOwner');assert.ok(!r.text.includes('<img src=x'));assert.ok(!r.text.includes('<svg onload'));assert.ok(!r.text.includes('<script>alert'));assert.ok(!r.text.includes('href="javascript:'));
assert.equal((await vote()).httpStatusCode,303);assert.equal(profile('PageOwner')[49],'1');
pass('ban, registration confirmation/quarantine, credential recheck, symlink/corrupt-history/profile refusals and escaped legacy questionnaire fields');
// Retain votes beyond 20 recipients; migrate known legacy rows without recounting old totals.
const retained=await run(helper+"$p=explode(':||:',file_get_contents('/www/local/profil/PageOther.prof'));$p[48]='0';file_put_contents('/www/local/profil/PageOther.prof',implode(':||:',$p));file_put_contents('/www/local/dataraiting/PageOther.dat','');for($i=0;$i<21;$i++){$q=$p;$q[0]='Bound'.$i;$q[36]='0';$q[49]=$q[50]=$q[51]='0';file_put_contents('/www/local/profil/Bound'.$i.'.prof',implode(':||:',$q));motor_reputation_vote('PageOther','Bound'.$i,'plus',2000000000+$i*10801,$p[1]);}motor_reputation_vote('PageOther','Bound0','minus',2000000000+20*10801,$p[1]);$rows=motor_reputation_read('PageOther');$q=explode(':||:',file_get_contents('/www/local/profil/Bound0.prof'));echo count($rows).':'.$rows['Bound0']['sign'].':'.implode(',',array_slice($q,49,3));");assert.equal(retained,'21:-1:-1,0,1');
set('PageOther',{48:2100000000});set('PageOwner',{49:17,50:21,51:4});php.writeFile('/www/local/dataraiting/PageOther.dat','PageOwner|+|\r\n');
let legacyRevision=revision(await req(base));assert.equal((await vote({vote:'minus',revision:legacyRevision})).httpStatusCode,303);assert.deepEqual([49,50,51].map(i=>profile('PageOwner')[i]),['15','20','5']);
minusRevision=revision(await req(base));const stableHistory=php.readFileAsText('/www/local/dataraiting/PageOther.dat');
set('PageOwner',{51:0});assert.equal((await vote({revision:minusRevision})).httpStatusCode,503);assert.equal(profile('PageOwner')[49],'15');assert.equal(php.readFileAsText('/www/local/dataraiting/PageOther.dat'),stableHistory);set('PageOwner',{51:5});
set('PageOther',{36:0});assert.equal((await vote({revision:minusRevision})).httpStatusCode,403,'editing still requires configured activity');set('PageOther',{36:200});
assert.equal((await vote({revision:minusRevision})).httpStatusCode,303);assert.deepEqual([49,50,51].map(i=>profile('PageOwner')[i]),['17','21','4']);
for(const invalid of ['PageOwner|+|\nPageOwner|-|\n','PageOwner|+|invalid|\n','x'.repeat(2097153)]){php.writeFile('/www/local/dataraiting/PageOther.dat',invalid);assert.equal((await vote()).httpStatusCode,503);assert.equal(profile('PageOwner')[49],'17');}
php.writeFile('/www/local/dataraiting/PageOther.dat',stableHistory);set('PageOwner',{49:15,50:20,51:5});
pass('one notification per real change, all three forms show current vote, legacy history keeps baseline, >20 recipients retained, corrupt/oversized history and negative counters rejected');
// Every remaining direct questionnaire URL must explicitly request its details view.
function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory()&&e.name!=='local')scan(p);else if(e.isFile()&&e.name.endsWith('.php')){const text=readFileSync(p,'utf8');for(const m of text.matchAll(/href="[^\"]*anketa\.php([^\"]*)/g))assert.ok(m[1].includes('view=details'),p+' '+m[0]);}}}scan(root);
writeFileSync(new URL('./navigation-reputation-results.json',import.meta.url),JSON.stringify({php:'8.4 WASM',requests,passed,concurrency:'mandatory native Docker gate'},null,2));console.log('SUCCESS',requests,'HTTP requests');
}finally{php.exit()}
