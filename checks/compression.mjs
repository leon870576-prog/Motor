import {PHP,PHPRequestHandler,setPhpIniEntries} from '@php-wasm/universal';
import {loadNodeRuntime} from '@php-wasm/node';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {gunzipSync,inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.test-site');
const php=new PHP(await loadNodeRuntime('8.4',{emscriptenOptions:{processId:process.pid}}));
function copy(from,to){if(!php.fileExists(to))php.mkdir(to);for(const e of readdirSync(from,{withFileTypes:true})){const f=join(from,e.name),t=to+'/'+e.name;e.isDirectory()?copy(f,t):php.writeFile(t,readFileSync(f));}}
let requests=0;const results=[];
try {
 copy(root,'/www');
 await setPhpIniEntries(php,{allow_url_fopen:'0',sendmail_path:'/bin/false'});
 const handler=new PHPRequestHandler({php,documentRoot:'/www',absoluteUrl:'https://motor.test'});
 async function request(path,accept,body,extra={}){
  php.chdir('/www'+dirname(new URL(path,'https://motor.test').pathname));
  const r=await handler.request({url:path,method:body?'POST':'GET',...(body?{body}:{}),headers:{...(accept===undefined?{}:{'accept-encoding':accept}),...extra}});
  requests++;assert.equal(r.errors,'',path);assert.equal(r.exitCode,0,path);return r;
 }
 await request('/index.php');await request('/INSTALL.php');
 const password=randomBytes(10).toString('hex');
 await request('/INSTALL.php?action=install',undefined,{name:'CompressAdmin',password,password2:password,oemails:'test@example.test',osite:'https://motor.test'});
 assert.ok(php.fileExists('/www/local/profil/CompressAdmin.prof'),'Isolated test account installed');
 let config=php.readFileAsText('/www/local/config.dat').split('|');config[3]='0';config[29]='0';config[57]='0';config[69]='1';php.writeFile('/www/local/config.dat',config.join('|'));
 const enc=r=>(r.headers['content-encoding']||[]).join(',');
 for(const [accept,expected] of [[undefined,''],['',''],['identity',''],['gzip','gzip'],['deflate','deflate'],['gzip, deflate','gzip'],['GZIP','gzip'],['gzip;q=0, deflate;q=0',''],['gzip;q=0, deflate;q=0.8','deflate'],['gzip;q=0.2, deflate;q=0.9','deflate'],['gzip;q=0.4, identity;q=1',''],['gzip;q=0, *;q=0.5','deflate'],['notgzip',''],['gzip;q=bogus',''],['gzip;q=0,gzip;q=1',''],['*;q=0, identity;q=1','']]){
  const r=await request('/index.php',accept);assert.equal(r.httpStatusCode,200);assert.equal(enc(r),expected,String(accept));
  const bytes=Buffer.from(r.bytes),decoded=expected==='gzip'?gunzipSync(bytes):expected==='deflate'?inflateSync(bytes):bytes;
  const html=decoded.toString();assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.endsWith('</html>'));assert.ok(!/Fatal error|Parse error|%TITLE%/.test(html));
  if(expected)assert.ok(bytes.length<decoded.length*.5);
  assert.match((r.headers.vary||[]).join(','),/Accept-Encoding/i);
  results.push({accept:accept??'(absent)',encoding:expected||'identity',bytes:bytes.length,decodedBytes:decoded.length});
 }
 for(const accept of ['*;q=0','gzip;q=0,deflate;q=0,identity;q=0']){
  const r=await request('/index.php',accept);assert.equal(r.httpStatusCode,406);assert.equal(enc(r),'');assert.equal(r.bytes.length,0);
 }
 assert.equal(enc(await request('/index.php',undefined,undefined,{te:'gzip'})),'');
 for(const path of ['/forum/index.php','/news/index.php','/news/rss.php','/pages/login.php','/pages/traffic.php'])for(const accept of ['gzip','deflate']){
  const r=await request(path,accept);assert.equal(r.httpStatusCode,200);assert.equal(enc(r),accept);
  const html=(accept==='gzip'?gunzipSync(r.bytes):inflateSync(r.bytes)).toString();assert.ok(html.includes(path.endsWith('rss.php')?'</rss>':'</html>'));assert.ok(!/Fatal error|Parse error/.test(html));
 }
 // Existing login/CSRF responses still decode correctly.
 assert.equal((await request('/input.php','gzip',{login:'CompressAdmin',pass:password})).httpStatusCode,302);
 const admin=await request('/mpanel/attachments.php','gzip');assert.equal(admin.httpStatusCode,200);assert.match(gunzipSync(admin.bytes).toString(),/name="uid" value="[a-f0-9]{64}"/);
 const denied=await request('/mpanel/attachments.php','deflate',{uid:'invalid'});assert.equal(denied.httpStatusCode,403);assert.ok(inflateSync(denied.bytes).length>0);
 // The PHP handler must not wrap a body already compressed by ob_gzhandler.
 php.writeFile('/probe.php',"<?php define('BASEDIR','/');require '/www/includes/compression.php';ob_start('ob_gzhandler');motor_start_compression(true);echo str_repeat('one encoding only ',100);");
 const duplicate=await php.run({scriptPath:'/probe.php',$_SERVER:{HTTP_ACCEPT_ENCODING:'gzip'}});
 assert.equal(duplicate.errors,'');assert.equal(gunzipSync(duplicate.bytes).toString(),'one encoding only '.repeat(100));
 config[69]='0';php.writeFile('/www/local/config.dat',config.join('|'));
 assert.equal(enc(await request('/index.php','gzip')),'','Admin off switch must remain effective');
 writeFileSync(new URL('./compression-results.json',import.meta.url),JSON.stringify({php:'8.4',requests,cases:results,deflate_zlib_roundtrip:true,no_double_encoding:true,csrf_preserved:true,admin_off_switch:true},null,2));
 console.log(`PASS ${requests} HTTP requests: gzip/deflate decode, q=0/preferences/wildcards, identity, TE ignored, 406, RSS, admin/CSRF, double-compression guard and off switch`);
}finally{php.exit();}
