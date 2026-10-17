import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.test-site',dir=new URL('./captcha-fixtures/',import.meta.url);mkdirSync(dir,{recursive:true});
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
let requests=0;const fixtures=[];
try{
 copy(root,'/www');await setPhpIniEntries(php,{sendmail_path:'/bin/false',allow_url_fopen:'0'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function req(url,body,method,client=handler){php.chdir('/www'+dirname(new URL(url,'https://motor.test').pathname));const r=await client.request({url,method:method||(body?'POST':'GET'),...(body?{body}:{})});requests++;assert.equal(r.errors,'',url);return r;}
 assert.equal((await req('/gallery/protect.php')).httpStatusCode,404);
 await req('/index.php');await req('/INSTALL.php');const password=randomBytes(10).toString('hex');await req('/INSTALL.php?action=install',{name:'CaptchaAdmin',password,password2:password,oemails:'admin@example.test',osite:'https://motor.test'});assert.ok(php.fileExists('/www/local/profil/CaptchaAdmin.prof'));
 const cfg=php.readFileAsText('/www/local/config.dat').split('|');for(const i of [3,29,57,62,103,104])cfg[i]='0';for(const i of [20,61])cfg[i]='1';const config=()=>php.writeFile('/www/local/config.dat',cfg.join('|'));config();
 let r=await req('/pages/registration.php');const code=r.text.match(/<b>([0-9]{4})<\/b>/)[1];const uid=r.text.match(/name="uid" value="([a-f0-9]+)"/)[1];cfg[103]='1';config();
 for(const url of ['/pages/registration.php','/book/index.php','/mail/index.php','/mail/lostpassword.php']){
  r=await req(url);assert.equal(r.httpStatusCode,200);assert.equal((r.text.match(/class="captcha-image"/g)||[]).length,1);assert.match(r.text,/width="252" height="96" alt="Проверочный код: четыре цифры"/);assert.match(r.text,/name="provkod" inputmode="numeric"/);assert.ok(!r.text.includes('<b>'+code+'</b>'));
  const file=fixtures.length+'.html';writeFileSync(new URL(file,dir),r.text);fixtures.push({url,file});
 }
 function png(response){assert.equal(response.httpStatusCode,200);assert.equal(response.headers['content-type'][0],'image/png');assert.match(response.headers['cache-control'][0],/private.*no-store/);assert.equal(response.headers['x-content-type-options'][0],'nosniff');assert.match(response.headers.vary[0],/Cookie/);const bytes=Buffer.from(response.bytes);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),504);assert.equal(bytes.readUInt32BE(20),192);return bytes;}
 const clean=png(await req('/gallery/protect.php?v=captcha1'));writeFileSync(new URL('code.png',dir),clean);
 assert.deepEqual(png(await req('/gallery/protect.php?code=9999&width=999999&height=999999')),clean,'query cannot override code or dimensions');
 r=await req('/gallery/protect.php',undefined,'HEAD');assert.equal(r.httpStatusCode,200);assert.equal(r.bytes.length,0);assert.equal(+r.headers['content-length'][0],clean.length);
 assert.equal((await req('/gallery/protect.php',{},'POST')).httpStatusCode,405);
 const other=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});assert.equal((await req('/gallery/protect.php',undefined,'GET',other)).httpStatusCode,404,'another session cannot read this code');
 cfg[104]='1';config();const noisy=png(await req('/gallery/protect.php'));assert.notDeepEqual(noisy,clean);cfg[104]='0';config();assert.deepEqual(png(await req('/gallery/protect.php')),clean,'image refresh keeps the same challenge');
 console.log('PASS 504x192 PNG, all four forms, private/no-store, HEAD, missing/other sessions, fixed dimensions, ignored client code, optional noise and stable challenge');
 const fields={uid,logs:'CaptchaMember',pars:'NewCaptchaPass123',pars2:'NewCaptchaPass123',meil:'member@example.test',provkod:code};
 r=await req('/pages/reguser.php',{...fields,provkod:'0'});assert.ok(r.text.includes('Проверочное число не совпало'));assert.ok(!php.fileExists('/www/local/profil/CaptchaMember.prof'));
 assert.equal((await req('/pages/reguser.php',{...fields,uid:'wrong'})).httpStatusCode,403);
 assert.equal((await req('/pages/reguser.php',{...Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='provkod')),'provkod[0]':code})).httpStatusCode,400);
 const before=php.readFileAsText('/www/local/book.dat');r=await req('/book/add.php',{uid,msg:'Test message',provkod:'0'});assert.ok(r.text.includes('Проверочное число не совпало'));assert.equal(php.readFileAsText('/www/local/book.dat'),before);
 for(const [url,body] of [['/mail/index.php?action=go',{uid,name:'Test',umail:'test@example.test',body:'Test message',provkod:'0'}],['/mail/lostpassword.php?action=send',{uid,uz:'CaptchaAdmin',provkod:'0'}]]){r=await req(url,body);assert.ok(r.text.includes('Проверочное число не совпало'));}
 r=await req('/pages/reguser.php',fields);assert.equal(r.httpStatusCode,200);assert.ok(php.fileExists('/www/local/profil/CaptchaMember.prof'));assert.ok(r.text.includes('Вы удачно зарегистрированы'));assert.ok(r.text.includes('pages/login.php'));assert.ok(!r.text.includes(fields.pars)&&!r.text.includes('input.php?login='));assert.equal((await req('/gallery/protect.php')).httpStatusCode,404,'successful submission consumes the challenge');
 console.log('PASS wrong codes, CSRF and arrays rejected; valid registration succeeds, consumes the code, and exposes no password or URL credentials');
 r=await php.run({code:"<?php define('BASEDIR','/www/');require '/www/includes/captcha.php';foreach(['','0','12345','<script>','1234\\n'] as $bad){try{motor_captcha_image($bad,false);throw new RuntimeException('Accepted invalid code');}catch(InvalidArgumentException $e){}}echo 'safe';"});assert.equal(r.errors,'');assert.equal(r.text,'safe');
 writeFileSync(new URL('manifest.json',dir),JSON.stringify(fixtures,null,2));writeFileSync(new URL('./captcha-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,forms:fixtures.length,image:[504,192],display:[252,96],sessionIsolation:true,noStore:true,wrongCodesRejected:true,validRegistration:true,registrationPasswordDisclosure:false,nativeFont:'checked by Docker build'},null,2));
}finally{php.exit();}
