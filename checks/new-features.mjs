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

// Avatar catalogue and its mutation endpoints use an isolated account.
const originalProfile=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof');
for (const endpoint of ['select','addbuy']) {
 assert.equal((await req('/pages/avators.php?action='+endpoint+'&uid='+uid+'&av=1.gif')).httpStatusCode,403);
 for (const data of [{av:'1.gif'},{uid:'invalid',av:'1.gif'},{'uid[]':uid,av:'1.gif'}]) assert.equal((await req('/pages/avators.php?action='+endpoint,data)).httpStatusCode,403);
 assert.equal((await req('/pages/avators.php?action='+endpoint,{uid,'av[]':'1.gif'})).httpStatusCode,400);
 for (const av of ['../local/config.dat','..','201.gif','1.gif%00','1.gif" onerror="alert(1)','https://evil.test/x.gif']) {
  await req('/pages/avators.php?action='+endpoint,{uid,av});assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof'),originalProfile);
 }
}
assert.equal((await req('/pages/avators.php?action=addload',{uid})).httpStatusCode,400);
assert.equal((await req('/pages/avators.php?action=addload')).httpStatusCode,403);
assert.equal((await req('/gallery/avators.php?uz[]=abc')).httpStatusCode,302);
let ar=await req('/pages/avators.php?action=select',{uid,av:'200.gif'});assert.ok(ar.text.includes('Аватар успешно выбран'));
assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:')[43],'images/avators/200.gif');
let prof=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof').split(':||:');prof[41]='100000';php.writeFile('/www/local/profil/MotorTestAdmin.prof',prof.join(':||:'));
ar=await req('/pages/avators.php?action=addbuy',{uid,av:'1.gif'});assert.ok(ar.text.includes('успешно'));
const paid=php.readFileAsText('/www/local/profil/MotorTestAdmin.prof');assert.equal(paid.split(':||:')[43],'images/avators2/1.gif');assert.ok(Number(paid.split(':||:')[41])<100000);
await req('/pages/avators.php?action=addbuy',{uid,av:'1.gif'});assert.equal(php.readFileAsText('/www/local/profil/MotorTestAdmin.prof'),paid);
const avatarFixtures=[];mkdirSync(new URL('./avatar-fixtures/',import.meta.url),{recursive:true});
// Isolated records exercise all three chat characters, including the old spelling.
config=php.readFileAsText('/www/local/config.dat').split('|');
for(const name of ['shutnik','magnik','botnik']){const match=readFileSync(join(root,'includes/start.php'),'utf8').match(new RegExp("\\$config\\['"+name+"'\\] = \\$con_data\\[(\\d+)\\]"));assert.ok(match);config[Number(match[1])]='0';}
php.writeFile('/www/local/config.dat',config.join('|'));
const stamp=Math.floor(Date.now()/1000),authors=['Вундер-киндер','Настюха','Весельчак','Весальчак','MotorTestAdmin'];
php.writeFile('/www/local/chat.dat',authors.map(name=>`Проверка аватара :)|${name}||${stamp}|Test|127.0.0.1|0|0||`).join('\r\n')+'\r\n');
for(const dir of ['datakontakt','dataignor'])php.writeFile('/www/local/'+dir+'/MotorTestAdmin.dat',`|MotorTestAdmin|${stamp}|\r\n`);
for(const [i,path] of ['/pages/avators.php','/pages/avators.php?action=buy','/pages/profil.php','/pages/anketa.php?view=details&uz=MotorTestAdmin','/chat/index.php','/mpanel/chat.php','/pages/kontakt.php','/pages/ignor.php'].entries()) {
 ar=await req(path);assert.equal(ar.httpStatusCode,200);writeFileSync(new URL('./avatar-fixtures/'+i+'.html',import.meta.url),ar.text);avatarFixtures.push({url:path,file:i+'.html'});
 if(path.includes('/chat'))for(const name of ['mag','bot','shut'])assert.ok(ar.text.includes('class="motor-avatar" src="../images/img/'+name+'.gif?v=avatars3"'),path+' bot '+name);
}
writeFileSync(new URL('./avatar-fixtures/manifest.json',import.meta.url),JSON.stringify(avatarFixtures));
pass('avatar selection/purchase, duplicate charge prevention, CSRF, GET rejection, invalid types/paths, malformed upload and array-safe image serving');
const security=await php.run({code:`<?php
define('BASEDIR','/');define('DATADIR','/www/local/');require '/www/includes/functions.php';$config=['resmiles'=>-1,'guestsuser'=>'Guest'];
function ok($v,$m){if(!$v)throw new Exception($m);}
foreach(['b','i','u','del','q'] as $t)ok(str_contains(bb_code('['.$t.']тест[/'.$t.']'),'<'.$t.'>тест</'.$t.'>'),'tag '.$t);
foreach(['red','green','blue','yellow','big','small'] as $t)ok(str_contains(bb_code('['.$t.']тест[/'.$t.']'),'class="bb-'.$t.'"'),'tag '.$t);
ok(bb_code('[unknown]')==='[unknown]','unknown tags literal');
ok(str_contains(bb_code('[b][i]Nested[/i][/b]'),'<b><i>Nested</i></b>'),'nesting');
ok(!str_contains(bb_code('[code][b]literal[/b] https://example.test :hello <script>alert(1)</script>[/code]'),'<a '),'code no link');
ok(!str_contains(bb_code('[code]:hello[/code]'),'motor-smile'),'code no smile');
$cases=['<script>alert(1)</script>','</textarea><img src=x onerror=alert(1)>','[url=javascript:alert(1)]x[/url]','[url=data:text/html,x]x[/url]','[url=//evil.test]x[/url]','[url=java&#115;cript:alert(1)]x[/url]','[url=https://good.test&quot; onmouseover=&quot;alert(1)]x[/url]','[url=https://user:secret@example.test]x[/url]','[url=https://example.test\\\\evil]x[/url]','[url=https://example.test]&#60;img src=x onerror=alert(1)&#62;[/url]','[code]</code><svg/onload=alert(1)>[/code]','[b][i]crossed[/b][/i]','[url=https://example.test][code]literal[/code][/url]'];
$out=[];foreach($cases as $c){$o=bb_code($c);ok(!preg_match('~<(?:script|svg|iframe|object)\\b|<img[^>]+onerror|href="(?:javascript|data):~i',$o),'unsafe output');$out[]=$o;}
$clean=bb_code('<img src="/images/smiles/hello.gif" onerror="alert(1)" />');ok(!str_contains($clean,'onerror'),'legacy smile attributes stripped');
ok(str_contains(bb_code('[url=https://example.test/?a=1&amp;b=2]Сайт[/url]'),'href="https://example.test/?a=1&amp;b=2"'),'HTTPS query');
foreach(['https://сайт.ру','https://пример.рф/страница?а=1&б=2#раздел','https://example.com:8443/path','http://example.com/path'] as $address) {
    ok(str_contains(bb_code('[url='.$address.']Сайт[/url]'),'href="'.htmlspecialchars($address,ENT_QUOTES,'UTF-8').'"'),'normalised picker URL rendered: '.$address);
}
ok(!str_contains(motor_avatar_image('images/avators/1.gif" onerror="x'), 'onerror'),'avatar attribute injection');
foreach(['Вундер-киндер'=>'mag','Настюха'=>'bot','Весельчак'=>'shut','Весальчак'=>'shut'] as $author=>$asset) {
    ok(str_contains(user_avatars($author),'images/img/'.$asset.'.gif?v=avatars3'),'bot mapping');
    $sz=getimagesize('/www/images/img/'.$asset.'.gif');ok($sz[0]===256 && $sz[1]===256 && $sz[2]===IMAGETYPE_GIF,'chat avatar dimensions');
}
foreach(['images/img/../mag.gif','images/img/other.gif','images/img/mag.gif" onerror="x','https://example.test/mag.gif'] as $path)ok(str_contains(motor_avatar_image($path),'images/avators/noavatar.gif'),'bot path allowlist');
ok(str_contains(motor_avatar_image('images/img/mag.gif','56px;background:red'),'--avatar-size:56px'),'numeric size only');
$n=0;foreach(['/www/images/avators/','/www/images/avators2/'] as $dir)foreach(glob($dir.'*.gif') as $f){$sz=getimagesize($f);ok($sz[0]===128 && $sz[1]===128 && $sz[2]===IMAGETYPE_GIF,'avatar dimensions');$n++;}ok($n===402,'all avatar names');
echo json_encode(['avatars'=>$n,'security_outputs'=>$out,'cases'=>count($cases)],JSON_UNESCAPED_UNICODE);
`});assert.equal(security.errors,'');assert.equal(security.exitCode,0);const data=JSON.parse(security.text);writeFileSync(new URL('./security-fixture.json',import.meta.url),JSON.stringify(data));
pass('all 402 GIF avatars, strict renderer tag allowlist, nesting, literal code, HTTP(S) validation, XSS escaping and legacy smile cleanup');
writeFileSync(new URL('./new-features-results.json',import.meta.url),JSON.stringify({requests,passed,...data},null,2));

}finally{php.exit()}
