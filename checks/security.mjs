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
// All three roles exercise the default route of each public controller, excluding write-only/binary/installer endpoints.
const smokePaths=[];for(const dir of ['pages','games','mpanel','board','book','chat','forum','gallery','news','votes','mail','pyramid','wap','www'])for(const name of readdirSync(join(root,dir))){if(!name.endsWith('.php'))continue;const path=dir+'/'+name;if(['pages/newpass.php','pages/nickname.php','pages/reguser.php','book/add.php','chat/add.php','board/add.php','board/edit.php','forum/edit.php','news/komm.php','gallery/resize.php','gallery/fullsize.php','gallery/avators.php','gallery/count.php','gallery/count24.php','gallery/count31.php','gallery/grafic.php','gallery/level.php','gallery/protect.php','chat/updates.php','pyramid/conf.php','pyramid/msg.php','pyramid/go.php','pyramid/del.php'].includes(path))continue;smokePaths.push('/'+path);}
let smoke=0;
for(const role of ['guest','SecureMember','SecureAdmin']){
 await req('/input.php?action=exit');if(role!=='guest')await req('/input.php',{login:role,pass:password});uid=await token();
 smoking=true;for(const path of smokePaths){r=await req(path);smoke++;}smoking=false;
}
if(smokeErrors.length){writeFileSync(new URL('./security-smoke-errors.log',import.meta.url),JSON.stringify(smokeErrors,null,2));throw new Error(smokeErrors.length+' routes failed; see checks/security-smoke-errors.log');}
pass('default-route smoke: '+smoke+' requests across guest, member and administrator');
uid=await token();r=await req('/mpanel/files.php?action=obzor&file=index.dat');assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Строчек:'));
pass('PHP 8 admin source preview no longer calls count on a string');
for(const [path,body] of [['/pages/nickname.php',{nickname:'НовоеИмя'}],['/pages/newpass.php',{newpar:'Change123',newpar2:'Change123',oldpar:password}],['/games/bank.php?action=operacia',{gold:'10',oper:'1'}],['/games/kredit.php?action=operacia',{gold:'10',oper:'1'}],['/votes/vote.php?action=vote',{golos:'1'}],['/pages/link.php?action=add',{linkurl:'http://example.test',linkname:'Проверка'}],['/pages/key.php?action=inkey',{key:'1234'}]]){
 assert.equal((await req(path,body)).httpStatusCode,403,path);assert.equal((await req(path,{...body,uid:'wrong'})).httpStatusCode,403,path);assert.equal((await req(path,{...body,uid},{Origin:'https://attacker.test'})).httpStatusCode,403,path);assert.equal((await req(path,{...body,uid},{'Sec-Fetch-Site':'cross-site'})).httpStatusCode,403,path);
}
for(const path of ['/pages/nickname.php','/pages/newpass.php','/games/bank.php?action=operacia','/games/kredit.php?action=operacia','/games/health.php?action=operacia&pred=1','/games/stamina.php?action=operacia&pred=1','/games/magazin.php?action=shop&weapon=kastet','/games/kosti.php?action=go','/games/bandit.php?action=go','/games/naperstki.php?action=go&thimble=1','/votes/vote.php?action=vote&golos=1'])assert.equal((await req(path)).httpStatusCode,403,path);
for(const path of ['/pages/account.php','/games/bank.php','/games/kredit.php','/games/hi.php','/pages/link.php']){r=await req(path);for(const f of r.text.matchAll(/<form\b[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/g))assert.match(f[1],/name="uid" value="[a-f0-9]{64}"/,path);}
let gameProfile=php.readFileAsText('/www/local/profil/SecureAdmin.prof').split(':||:');gameProfile[55]='1';gameProfile[56]='50';gameProfile[57]='50';gameProfile[61]='0';gameProfile[62]='0';gameProfile[41]='10000';php.writeFile('/www/local/profil/SecureAdmin.prof',gameProfile.join(':||:'));
for(const path of ['/games/kosti.php','/games/bandit.php','/games/health.php','/games/stamina.php','/games/magazin.php?action=lite']){r=await req(path);assert.match(r.text,/<form class="legacy-action" method="post"/);assert.ok(!/<a[^>]+href="[^\"]+action=(?:go|operacia|shop)[&\"]/.test(r.text),path);}
assert.equal((await req('/pages/nickname.php',{uid,'nickname[0]':'oops'})).httpStatusCode,400);
assert.equal((await req('/input.php',{'login[0]':'SecureAdmin',pass:password})).httpStatusCode,400);
pass('cross-site POST, missing/invalid CSRF, old GET mutations and array injection denied; old forms/buttons receive tokens');
// Exercise real permitted actions so the protection does not merely disable the old features.
r=await req('/votes/index.php');php.writeFile('/www/local/datavotes/votes.dat','Проверка|Первый|Второй|||||||||');php.writeFile('/www/local/datavotes/result.dat','|0|0|0|0|0|0|0|0|0|0|');php.writeFile('/www/local/datavotes/users.dat','');assert.equal((await req('/votes/vote.php?action=vote',{uid,golos:'1'})).httpStatusCode,302);assert.equal(lines('datavotes/result.dat')[0].split('|')[1],'1');
r=await req('/games/bank.php?action=operacia',{uid,gold:'1',oper:'2'});assert.equal(r.httpStatusCode,200);assert.ok(!r.text.includes('Fatal error'));
pass('legitimate votes and bank forms still execute');
// Path traversal is rejected before any archive entry is written.
const archiveCase=async(code)=>{const out=await php.run({code:"<?php define('DATADIR','/www/local/');require '/www/includes/backup-security.php';"+code});assert.equal(out.errors,'');return out.text;};
assert.equal(await archiveCase("$z=new ZipArchive();$z->open('/tmp/bad.zip',ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('safe.dat','safe');$z->addFromString('../escape.php','bad');$z->close();try{motor_backup_restore('/tmp/bad.zip');echo 'FAILED';}catch(Throwable $e){echo (!file_exists('/www/local/safe.dat')&&!file_exists('/www/escape.php'))?'blocked':'FAILED';}"),'blocked');
assert.equal(await archiveCase("$z=new ZipArchive();$z->open('/tmp/symlink.zip',ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('datafiles/link','/tmp');$z->setExternalAttributesName('datafiles/link',ZipArchive::OPSYS_UNIX,0120777<<16);$z->close();try{motor_backup_restore('/tmp/symlink.zip');echo 'FAILED';}catch(Throwable $e){echo 'blocked';}"),'blocked');
assert.equal(await archiveCase("mkdir('/tmp/outside');symlink('/tmp/outside','/www/local/unsafe');$z=new ZipArchive();$z->open('/tmp/symlink-target.zip',ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('unsafe/data.dat','bad');$z->close();try{motor_backup_restore('/tmp/symlink-target.zip');echo 'FAILED';}catch(Throwable $e){echo file_exists('/tmp/outside/data.dat')?'FAILED':'blocked';}unlink('/www/local/unsafe');"),'blocked');
assert.equal(await archiveCase("file_put_contents('/www/local/keep.dat','keep');$z=new ZipArchive();$z->open('/tmp/good.zip',ZipArchive::CREATE|ZipArchive::OVERWRITE);$z->addFromString('keep.dat','overwrite');$z->addFromString('databoard/restored.dat','restored');$z->close();motor_backup_restore('/tmp/good.zip');echo file_get_contents('/www/local/keep.dat').':'.file_get_contents('/www/local/databoard/restored.dat');"),'keep:restored');
assert.equal((await req('/mpanel/backup.php?action=unzip&filearc=good.zip&uid='+uid)).httpStatusCode,403);
pass('archive traversal and symlinks rejected before writes; restore preserves existing data; restore requires POST');
// Encoded reply names must never escape the message textarea.
const payload='</textarea><script>window.injected=1</script>',encoded=Buffer.from(payload).toString('base64').replaceAll('+','_').replaceAll('/','-').replaceAll('=','');
r=await req('/pyramid/index.php?name='+encoded);assert.ok(!r.text.includes(payload));assert.ok(r.text.includes('&lt;script&gt;'));
assert.equal((await req('/pyramid/del.php?action=all')).httpStatusCode,403);assert.ok((await req('/input.php?action=exit&probe=1')).text.includes('Выйти из учётной записи'));
pass('encoded reply-name XSS escaped; pyramid deletion and logout require POST');
r=await php.run({code: "<?php define('BASEDIR','/www/');require '/www/includes/recovery.php';[$token,$stored]=motor_recovery_issue(1000);echo json_encode([strlen($token),!str_contains($stored,$token),motor_recovery_valid($stored,$token,1001),motor_recovery_valid($stored,$token,44201),motor_recovery_valid($stored,str_repeat('a',64),1001),motor_recovery_valid('legacy',$token,1001)]);"});assert.equal(r.errors,'');assert.deepEqual(JSON.parse(r.text),[64,true,true,false,false,false]);
pass('password-recovery tokens random, stored hashed, bound to expiration; forged and legacy predictable tokens rejected');
// A real restore URL only displays confirmation on GET; POST consumes it once.
r=await php.run({code: "<?php define('BASEDIR','/www/');require '/www/includes/recovery.php';echo json_encode(motor_recovery_issue(time()));"});assert.equal(r.errors,'');const [recoveryKey,recoveryStored]=JSON.parse(r.text);
let recoveryProfile=php.readFileAsText('/www/local/profil/SecureMember.prof').split(':||:');const passwordBefore=recoveryProfile[1];recoveryProfile[35]=recoveryStored;php.writeFile('/www/local/profil/SecureMember.prof',recoveryProfile.join(':||:'));
await req('/input.php?action=exit');uid=await token();const restoreUrl='/mail/lostpassword.php?action=restore&uz=SecureMember&key='+recoveryKey;
r=await req(restoreUrl);assert.equal(r.httpStatusCode,200);assert.ok(r.text.includes('Подтвердите восстановление'));assert.equal(php.readFileAsText('/www/local/profil/SecureMember.prof').split(':||:')[1],passwordBefore);
assert.equal((await req(restoreUrl,{uid:'bad'})).httpStatusCode,403);assert.equal((await req(restoreUrl,{uid,newpar:'ChangedExample123',newpar2:'ChangedExample123'})).httpStatusCode,302);const restored=php.readFileAsText('/www/local/profil/SecureMember.prof');assert.notEqual(restored.split(':||:')[1],passwordBefore);assert.equal(restored.split(':||:')[35],'');await req(restoreUrl,{uid,newpar:'ChangedExample123',newpar2:'ChangedExample123'});assert.equal(php.readFileAsText('/www/local/profil/SecureMember.prof'),restored);
pass('actual recovery GET leaves password unchanged; POST+CSRF changes it once and invalidates the link');
cfg=php.readFileAsText('/www/local/config.dat').split('|');cfg[103]='0';php.writeFile('/www/local/config.dat',cfg.join('|'));r=await req('/mail/lostpassword.php');const captcha=r.text.match(/<b>([0-9]{4})<\/b>/);assert.ok(captcha);const beforeFailedMail=php.readFileAsText('/www/local/profil/SecureMember.prof');r=await req('/mail/lostpassword.php?action=send',{uid,uz:'SecureMember',provkod:captcha[1]});assert.equal(r.httpStatusCode,503);assert.equal(php.readFileAsText('/www/local/profil/SecureMember.prof'),beforeFailedMail);
pass('disabled mail reports failure without changing password, recovery token or cooldown');
// Every deployed code/static file is inventoried; mutable seed data is excluded explicitly.
const inventory=[];function inventoryTree(dir,relative=''){for(const ent of readdirSync(dir,{withFileTypes:true})){if(!relative&&ent.name==='local')continue;const name=relative+ent.name;if(ent.isDirectory())inventoryTree(join(dir,ent.name),name+'/');else{const data=readFileSync(join(dir,ent.name));inventory.push({path:name,bytes:data.length,sha256:hash(data)});}}}inventoryTree(root);
const inventoryParts=[];for(let start=0;start<inventory.length;start+=300){const name='security-inventory-'+(inventoryParts.length+1)+'.json';writeFileSync(new URL('./'+name,import.meta.url),JSON.stringify(inventory.slice(start,start+300),null,2));inventoryParts.push(name);}
writeFileSync(new URL('./security-inventory.json',import.meta.url),JSON.stringify({scope:'Assembled application; local seed/user data excluded',files:inventory.length,parts:inventoryParts},null,2));
writeFileSync(new URL('./security-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,smokeRoutes:smokePaths.length,smokeRequests:smoke,passed,inventoriedFiles:inventory.length},null,2));console.log('SUCCESS',requests,'HTTP requests;',inventory.length,'files inventoried');
}finally{php.exit()}
