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
let requests=0,passed=[],smoking=false,smokeErrors=[];
const pass=x=>{passed.push(x);console.log('PASS',x)};
try{
copy(root,'/www');
await setPhpIniEntries(php,{upload_max_filesize:'32M',post_max_size:'64M',max_file_uploads:'20',allow_url_fopen:'0',sendmail_path:'/bin/false'});
const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
async function req(url,body,headers={},method){
 if(url==='/input.php?action=exit' && !body){const form=await req('/pages/themes.php');const token=form.text.match(/name="uid" value="([^"]+)"/);assert.ok(token,'logout form token');body={uid:token[1]};}
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
 requests++;if(smoking){if(r.errors||r.exitCode!==0||r.httpStatusCode>=500)smokeErrors.push({url,status:r.httpStatusCode,errors:r.errors,exit:r.exitCode});}else{assert.equal(r.errors,'',url);assert.ok(r.exitCode===0,url+' exit '+r.exitCode);}return r;
}
function lines(path){return php.readFileAsText('/www/local/'+path).split(/\r?\n/).filter(Boolean)}
function manifest(section,parent){return JSON.parse(php.readFileAsText('/www/local/attachments/'+section+'/'+parent+'/manifest.json'))}
function url(section,parent,id){return '/attachment.php?section='+section+'&parent='+parent+'&file='+id}
async function token(){const r=await req('/pages/themes.php');return r.text.match(/name="uid" value="([^"]+)"/)[1]}
const password=randomBytes(10).toString('hex');await req('/index.php');await req('/INSTALL.php');await req('/INSTALL.php?action=install',{name:'SecureAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});
let cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57])cfg[i]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));
let before=await token();let r=await req('/input.php',{login:'SecureAdmin',pass:password,cookietrue:'1'});assert.equal(r.httpStatusCode,302);
assert.ok(r.headers['set-cookie'].some(x=>x.startsWith('SID=')),'session ID regenerated');for(const name of ['cooklog','cookpar']){const c=r.headers['set-cookie'].find(x=>x.startsWith(name+'='));assert.ok(/secure/i.test(c)&&/httponly/i.test(c)&&/samesite=lax/i.test(c),name);}
let uid=await token();assert.notEqual(uid,before);assert.equal((await req('/input.php?login=SecureAdmin&pass='+password)).httpStatusCode,405);
pass('login rotates session ID and CSRF token; remembered cookies Secure/HttpOnly/SameSite; GET credentials rejected');
const adminProfile=php.readFileAsText('/www/local/profil/SecureAdmin.prof');let member=adminProfile.split(':||:');member[0]='SecureMember';member[7]='0';member[25]='1';member[36]='500';member[41]='10000';member[75]='0';member[6]='1';php.writeFile('/www/local/profil/SecureMember.prof',member.join(':||:'));php.writeFile('/www/local/privat/SecureMember.priv','');

const field=(r,name)=>{const m=r.text.match(new RegExp('name="'+name+'" value="([^"]+)"'));assert.ok(m,'field '+name);return m[1]};
const read=p=>php.readFileAsText('/www/local/'+p),write=(p,v)=>php.writeFile('/www/local/'+p,v);
const paths=['/mpanel/index.php?action=delinstall','/mpanel/logfiles.php?action=del','/mpanel/logadmin.php?action=del','/mpanel/checker.php?action=skan','/mpanel/forum.php?act=recount','/mpanel/forum.php?act=closedtopic&fid=1&id=1','/mpanel/forum.php?act=delforum&fid=1','/mpanel/banlist.php?action=reload','/mpanel/adminlist.php?action=reload','/mpanel/book.php?action=alldel','/mpanel/adminchat.php?action=alldel','/mpanel/antimat.php?action=alldel','/mpanel/subscribe.php?action=alldel','/pages/kontakt.php?action=add&uz=SecureMember','/pages/ignor.php?action=add&uz=SecureMember','/pages/privat.php?action=alldel'];
for(const path of paths){
 for(const method of ['GET','HEAD'])assert.equal((await req(path+'&uid='+uid,undefined,{},method)).httpStatusCode,403,path);
 for(const [body,h] of [[{uid:'bad'},{}],[{uid},{Origin:'https://attacker.test'}]])assert.equal((await req(path,body,h)).httpStatusCode,403,path);
}
pass('16 legacy actions reject GET/HEAD with valid token, wrong POST token and cross-site POST');
assert.ok(php.fileExists('/www/INSTALL.php'));
let page=await req('/mpanel/index.php');assert.match(page.text,/<form class="legacy-action" method="post" action="index.php\?action=delinstall/);assert.ok(!page.text.includes('href="index.php?action=delinstall'));
for(const [path,key] of [['/pages/kontakt.php?action=add&uz=SecureMember','datakontakt'],['/pages/ignor.php?action=add&uz=SecureMember','dataignor']]){assert.equal((await req(path,{uid})).httpStatusCode,302);assert.match(read(key+'/SecureAdmin.dat'),/SecureMember/);}
page=await req('/pages/anketa.php?view=details&uz=SecureMember');assert.match(page.text,/<form class="legacy-action" method="post" action="kontakt.php/);
const rendered=await php.run({code:"<?php define('BASEDIR','/www/');require '/www/includes/request-security.php';$_SESSION=['token'=>str_repeat('a',64)];$_SERVER['SCRIPT_NAME']='/portal/pages/anketa.php';echo json_encode([motor_request_route(),motor_request_html('<a href=\"kontakt.php?action=add&amp;uz=Target\">User supplied</a>'),motor_request_html('<a data-motor-action href=\"kontakt.php?action=add&amp;uz=Target\">Contact</a>')]);"});
assert.equal(rendered.errors,'');let out=JSON.parse(rendered.text);assert.equal(out[0],'pages/anketa.php');assert.ok(!out[1].includes('name="uid"'));assert.ok(out[2].includes('method="post"'));
const nested=await php.run({code: "<?php define('BASEDIR','/www/');require '/www/includes/request-security.php';$_SESSION=['token'=>str_repeat('a',64)];$_SERVER['SCRIPT_NAME']='/pages/privat.php';echo motor_request_html('<form method=\"post\" action=\"privat.php?action=del\"><a data-motor-action href=\"kontakt.php?action=add&amp;uz=Target\">Contact</a></form>');"});assert.equal(nested.errors,'');assert.equal((nested.text.match(/<form\b/g)||[]).length,1);assert.ok(nested.text.includes('formaction="kontakt.php?action=add'));
pass('real contact/ignore POSTs work; action links rendered as forms; unmarked user link receives no token; subdirectory route normalized');
write('datavotes/votes.dat','Вопрос|Один|Два|Три||||||||');write('datavotes/result.dat','|0|0|0|0|0|0|0|0|0|0|');write('datavotes/users.dat','');
page=await req('/votes/vote.php');assert.match(page.text,/Всего проголосовавших: 0</);
let poll_revision=field(await req('/votes/index.php'),'poll_revision');assert.equal((await req('/votes/vote.php?action=vote',{uid,golos:'1',poll_revision})).httpStatusCode,302);
const voted=read('datavotes/result.dat');await req('/votes/vote.php?action=vote',{uid,golos:'2',poll_revision});assert.equal(read('datavotes/result.dat'),voted);assert.match((await req('/votes/vote.php')).text,/Всего проголосовавших: 1</);
assert.equal((await req('/votes/vote.php?action=vote',{uid,golos:'11',poll_revision})).httpStatusCode,400);
// Real admin create/edit submits; stale member form must not vote in a replacement question.
const form=await req('/mpanel/votes.php?action=new');const newBody={uid,poll_revision:field(form,'poll_revision'),question:'Новый вопрос',answer1:'Первый',answer2:'Второй',answer3:'Третий'};
assert.equal((await req('/mpanel/votes.php?action=add',newBody)).httpStatusCode,302);assert.match(read('datavotes/allvotes.dat'),/Вопрос.*\|1\|/);
assert.equal((await req('/votes/vote.php?action=vote',{uid,golos:'1',poll_revision})).httpStatusCode,409);assert.equal((await req('/mpanel/votes.php?action=add',newBody)).httpStatusCode,409);
assert.match((await req('/votes/vote.php')).text,/Всего проголосовавших: 0</);
poll_revision=field(await req('/mpanel/votes.php'),'poll_revision');assert.equal((await req('/mpanel/votes.php?action=edit',{...newBody,poll_revision,question:'Исправленный вопрос'})).httpStatusCode,302);
assert.match((await req('/votes/index.php')).text,/Исправленный вопрос/);
pass('zero/one voter totals, same-user replay, invalid option, admin create/archive/edit and stale form after replacement');
const configBefore=read('config.dat');
for(const value of ['0','-1','one','1001']) {assert.equal((await req('/mpanel/setting.php?action=editthree',{uid,set17:value})).httpStatusCode,400);assert.equal(read('config.dat'),configBefore);}
let settings=configBefore.split('|'),saveBody={uid};for(const n of [17,18,19,20,21,25,56,130])saveBody['set'+n]=settings[n];saveBody.set17='3';
assert.equal((await req('/mpanel/setting.php?action=editthree',saveBody)).httpStatusCode,302);assert.equal(read('config.dat').split('|')[17],'3');
settings[17]='0';write('config.dat',settings.join('|'));assert.equal((await req('/news/index.php')).httpStatusCode,200);assert.equal(read('config.dat').split('|')[17],'0');write('config.dat',configBefore);
pass('legacy admin pagination rejects zero/negative/text/out-of-range values, valid save works, old invalid settings read safely without rewriting data');
let p=read('profil/SecureMember.prof').split(':||:');p[7]='102';write('profil/SecureMember.prof',p.join(':||:'));write('datatmp/adminlist.dat','');page=await req('/mpanel/adminlist.php');assert.match(page.text,/Всего в администрации: <b>2</);assert.ok(page.text.includes('SecureMember'));
p[7]='0';p[37]='1';p[38]=String(Math.floor(Date.now()/1000)+86400);p[39]='Проверка';p[52]='1';p[63]='SecureAdmin';p[46]='1';write('profil/SecureMember.prof',p.join(':||:'));write('datatmp/banlist.dat','');write('datatmp/reglist.dat','');
page=await req('/mpanel/banlist.php');assert.match(page.text,/Всего забанено: <b>1</);page=await req('/mpanel/reglist.php');assert.match(page.text,/Всего ожидающих: <b>1</);assert.match(page.text,/name="id\[\]" value="SecureMember"/);
let pending_revision=field(page,'pending_revision');const profileBefore=read('profil/SecureMember.prof');await req('/mpanel/reglist.php');assert.equal(read('profil/SecureMember.prof'),profileBefore);
assert.equal((await req('/mpanel/reglist.php?action=choice',{uid,choice:'2','id[0]':'SecureAdmin',pending_revision})).httpStatusCode,400);assert.ok(php.fileExists('/www/local/profil/SecureAdmin.prof'));
assert.equal((await req('/mpanel/reglist.php?action=choice',{uid,choice:'1','id[0]':'SecureMember',pending_revision})).httpStatusCode,302);assert.equal(read('profil/SecureMember.prof').split(':||:')[46],'0');
assert.equal((await req('/mpanel/reglist.php?action=choice',{uid,choice:'2','id[0]':'SecureMember',pending_revision})).httpStatusCode,409);assert.ok(php.fileExists('/www/local/profil/SecureMember.prof'));
pass('admin/ban/pending lists match current profiles with empty cache; GET never deletes old pending account; explicit approval, forged target and stale delete rejected');
// Less-privileged administrator cannot delete installation code or use owner-only settings.
p=read('profil/SecureMember.prof').split(':||:');p[7]='103';p[37]='0';p[38]='0';write('profil/SecureMember.prof',p.join(':||:'));
await req('/input.php?action=exit');await req('/input.php',{login:'SecureMember',pass:password});uid=await token();assert.equal((await req('/mpanel/index.php?action=delinstall',{uid})).httpStatusCode,403);assert.ok(php.fileExists('/www/INSTALL.php'));
for(const route of ['/mpanel/points-settings.php','/mpanel/chat-settings.php','/mpanel/arcade-settings.php'])assert.ok([302,403].includes((await req(route)).httpStatusCode));
pass('moderator cannot remove installer or open owner-only settings');
writeFileSync(new URL('./audit-regressions-results.json',import.meta.url),JSON.stringify({runtime:'PHP 8.4 WASM',requests,passed},null,2)+'\n');console.log('SUCCESS',requests,'audit regression HTTP requests');
}finally{php.exit()}
